import OpenAI from 'openai';
import config from '../../config.js';
import { getLearnedPatterns, addLearnedPattern, getBlockedDomains, logModeration } from '../database.js';

export class ModerationService {
    constructor() {
        this.openai = config.openai.apiKey ? new OpenAI({ apiKey: config.openai.apiKey }) : null;
        this.blockedPatterns = config.moderation.blockedPatterns;
        this.blockedDomains = [...config.moderation.blockedDomains];
        
        // URL regex pattern
        this.urlPattern = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
        
        // Load learned patterns and domains from database
        this.loadLearnedData();
    }

    loadLearnedData() {
        try {
            // Load learned patterns
            const patterns = getLearnedPatterns();
            console.log(`📚 กำลังโหลด ${patterns.length} patterns ที่เรียนรู้แล้ว...`);
            
            patterns.forEach(p => {
                const category = this.blockedPatterns[p.type];
                if (category) {
                    // Escape special regex characters in the pattern
                    const escapedPattern = p.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    
                    // Check if pattern already exists
                    const exists = category.some(existing => 
                        existing.source === escapedPattern || existing.source === p.pattern
                    );
                    
                    if (!exists) {
                        category.push(new RegExp(escapedPattern, 'i'));
                        console.log(`  ✅ โหลด pattern: "${p.pattern}" (${p.type}, confidence: ${p.confidence})`);
                    }
                }
            });

            // Load blocked domains from database
            const domains = getBlockedDomains();
            domains.forEach(d => {
                if (!this.blockedDomains.includes(d.domain)) {
                    this.blockedDomains.push(d.domain);
                }
            });
            
            console.log(`🛡️ โหลด patterns สำเร็จ - พร้อมใช้งาน!`);
        } catch (error) {
            console.error('Error loading learned data:', error);
        }
    }

    async checkMessage(message) {
        const content = message.content.toLowerCase();
        
        // Check blocked patterns
        for (const [type, patterns] of Object.entries(this.blockedPatterns)) {
            for (const pattern of patterns) {
                if (pattern.test(content)) {
                    return {
                        isViolation: true,
                        type: type,
                        reason: this.getReasonMessage(type),
                    };
                }
            }
        }

        // Check URLs for blocked domains
        const urls = content.match(this.urlPattern) || [];
        for (const url of urls) {
            const domain = this.extractDomain(url);
            if (this.blockedDomains.some(blocked => domain.includes(blocked))) {
                return {
                    isViolation: true,
                    type: 'blocked_domain',
                    reason: 'ลิงก์ไปยังเว็บไซต์ที่ไม่อนุญาต',
                };
            }
        }

        // Use AI moderation if available
        if (this.openai && content.length > 10) {
            const aiResult = await this.checkWithAI(content);
            if (aiResult.isViolation) {
                return aiResult;
            }
        }

        return { isViolation: false };
    }

    async checkWithAI(content) {
        try {
            const response = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: `คุณเป็นระบบตรวจสอบเนื้อหาสำหรับ Discord server
                        ตรวจสอบข้อความว่ามีเนื้อหาต่อไปนี้หรือไม่:
                        1. การพนัน, คาสิโน, เดิมพัน
                        2. เนื้อหาผู้ใหญ่/ลามก
                        3. ยาเสพติด, สิ่งผิดกฎหมาย
                        4. การหลอกลวง, scam
                        5. spam หรือโฆษณา
                        6. คำหยาบคายรุนแรง
                        
                        ตอบในรูปแบบ JSON:
                        {"isViolation": boolean, "type": string, "reason": string, "confidence": number}
                        
                        ถ้าไม่พบการละเมิด ให้ isViolation เป็น false`
                    },
                    {
                        role: 'user',
                        content: content
                    }
                ],
                max_tokens: 150,
                temperature: 0.1,
            });

            const result = JSON.parse(response.choices[0].message.content);
            
            if (result.isViolation && result.confidence >= 0.8) {
                return {
                    isViolation: true,
                    type: result.type || 'ai_detected',
                    reason: result.reason || 'เนื้อหาไม่เหมาะสม (ตรวจพบโดย AI)',
                };
            }

            return { isViolation: false };
        } catch (error) {
            console.error('AI moderation error:', error);
            return { isViolation: false };
        }
    }

    async checkAttachment(attachment) {
        const filename = attachment.name.toLowerCase();
        const contentType = attachment.contentType || '';
        
        // Check for suspicious file types
        const dangerousExtensions = ['.exe', '.bat', '.cmd', '.msi', '.scr'];
        if (dangerousExtensions.some(ext => filename.endsWith(ext))) {
            return {
                isViolation: true,
                type: 'dangerous_file',
                reason: 'ไฟล์ประเภทนี้ไม่อนุญาต',
            };
        }

        // For images/videos, use OpenAI Vision if available
        if (this.openai && (contentType.startsWith('image/') || contentType.startsWith('video/'))) {
            // Note: For production, you'd want to use OpenAI's moderation endpoint
            // or a dedicated image moderation service
            try {
                const moderationResult = await this.openai.moderations.create({
                    input: `Image/Video attachment: ${filename}`,
                });
                
                const results = moderationResult.results[0];
                if (results.flagged) {
                    return {
                        isViolation: true,
                        type: 'inappropriate_media',
                        reason: 'ไฟล์มีเดียไม่เหมาะสม',
                    };
                }
            } catch (error) {
                console.error('Media moderation error:', error);
            }
        }

        return { isViolation: false };
    }

    async learn(content, type) {
        const lowerContent = content.toLowerCase();
        
        // 1. เรียนรู้คำเดี่ยว (Single words)
        const words = content.split(/\s+/).filter(w => w.length > 3);
        for (const word of words) {
            if (this.isSignificantWord(word)) {
                const cleanWord = word.toLowerCase().replace(/[^\u0E00-\u0E7Fa-z]/g, '');
                if (cleanWord.length >= 3) {
                    addLearnedPattern(cleanWord, type, 0.4);
                    console.log(`📚 [Learning] เรียนรู้คำเดี่ยว: "${cleanWord}" (${type})`);
                }
            }
        }
        
        // 2. เรียนรู้วลี 2 คำ (Bigrams)
        const cleanWords = lowerContent.split(/\s+/).filter(w => w.length >= 2);
        for (let i = 0; i < cleanWords.length - 1; i++) {
            const bigram = `${cleanWords[i]} ${cleanWords[i + 1]}`;
            const cleanBigram = bigram.replace(/[^\u0E00-\u0E7Fa-z\s]/g, '').trim();
            
            if (cleanBigram.length >= 5 && !this.isCommonPhrase(cleanBigram)) {
                addLearnedPattern(cleanBigram, type, 0.5);
                console.log(`📚 [Learning] เรียนรู้วลี: "${cleanBigram}" (${type})`);
            }
        }
        
        // 3. เรียนรู้รูปแบบตัวเลขผสม (เช่น "ควย123", "s4t4n")
        const alphanumericPattern = /[a-z\u0E00-\u0E7F]+\d+|\d+[a-z\u0E00-\u0E7F]+/gi;
        const matches = lowerContent.match(alphanumericPattern);
        if (matches) {
            matches.forEach(match => {
                if (match.length >= 4) {
                    addLearnedPattern(match, type, 0.6);
                    console.log(`📚 [Learning] เรียนรู้รูปแบบผสม: "${match}" (${type})`);
                }
            });
        }
        
        // 4. เรียนรู้คำที่มีอักขระซ้ำ (เช่น "สัสสสส", "fuckkk")
        const repeatedPattern = /(.)\1{2,}/g;
        const repeated = lowerContent.match(repeatedPattern);
        if (repeated) {
            repeated.forEach(match => {
                const baseWord = lowerContent.substring(
                    Math.max(0, lowerContent.indexOf(match) - 3),
                    lowerContent.indexOf(match) + match.length + 3
                ).trim();
                if (baseWord.length >= 4) {
                    addLearnedPattern(baseWord.replace(/[^\u0E00-\u0E7Fa-z]/g, ''), type, 0.6);
                    console.log(`📚 [Learning] เรียนรู้คำซ้ำ: "${baseWord}" (${type})`);
                }
            });
        }
    }

    isSignificantWord(word) {
        // คำที่ไม่ควรเรียนรู้ (คำธรรมดา, คำเชื่อม)
        const commonWords = [
            // ภาษาไทย
            'และ', 'หรือ', 'แต่', 'เพราะ', 'ที่', 'ใน', 'กับ', 'จาก', 'ไป', 'มา', 
            'ได้', 'เป็น', 'มี', 'ไม่', 'นะ', 'ครับ', 'ค่ะ', 'จ้า', 'คุณ', 'ผม',
            // ภาษาอังกฤษ
            'the', 'and', 'or', 'but', 'for', 'with', 'from', 'this', 'that', 'have',
            'your', 'what', 'when', 'where', 'why', 'how', 'hello', 'thanks'
        ];
        
        const cleanWord = word.toLowerCase().replace(/[^\u0E00-\u0E7Fa-z]/g, '');
        return !commonWords.includes(cleanWord) && cleanWord.length >= 3;
    }
    
    isCommonPhrase(phrase) {
        // วลีที่ไม่ควรเรียนรู้
        const commonPhrases = [
            'ไม่ได้', 'ได้ไหม', 'ทำไม', 'อะไร', 'ที่ไหน', 'what is', 'how to', 'i am',
            'thank you', 'hello there'
        ];
        return commonPhrases.includes(phrase.toLowerCase());
    }

    extractDomain(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.toLowerCase();
        } catch {
            return url.toLowerCase();
        }
    }

    getReasonMessage(type) {
        const reasons = {
            profanity: 'คำหยาบคายไม่อนุญาต',
            gambling: 'เนื้อหาเกี่ยวกับการพนันไม่อนุญาต',
            illegal: 'เนื้อหาเกี่ยวกับสิ่งผิดกฎหมายไม่อนุญาต',
            scam: 'ข้อความดูเหมือนจะเป็นการหลอกลวง',
            adult: 'เนื้อหาสำหรับผู้ใหญ่ไม่อนุญาต',
            blocked_domain: 'ลิงก์ไปยังเว็บไซต์ที่ไม่อนุญาต',
        };
        return reasons[type] || 'เนื้อหาไม่เหมาะสม';
    }
}
