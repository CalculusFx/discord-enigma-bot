import config from '../../config.js';
import { getLearnedPatterns, addLearnedPattern, getBlockedDomains, logModeration } from '../database.js';
import { HfInference } from '@huggingface/inference';

const hf = new HfInference(config.huggingface.apiKey || undefined); // เพิ่ม apiKey ใน config.js/.env

export class ModerationService {
    constructor() {
    // ไม่ใช้ OpenAI แล้ว
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
        } catch (err) {
            console.error('Error loading learned data:', err);
        }
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
            for (const match of matches) {
                if (match.length >= 4) {
                    addLearnedPattern(match, type, 0.6);
                    console.log(`📚 [Learning] เรียนรู้รูปแบบผสม: "${match}" (${type})`);
                }
            }
        }
        // 4. เรียนรู้คำที่มีอักขระซ้ำ (เช่น "สัสสสส", "fuckkk")
        const repeatedPattern = /(.)\1{2,}/g;
        const repeated = lowerContent.match(repeatedPattern);
        if (repeated) {
            for (const match of repeated) {
                const baseWord = lowerContent.substring(
                    Math.max(0, lowerContent.indexOf(match) - 3),
                    lowerContent.indexOf(match) + match.length + 3
                ).trim();
                if (baseWord.length >= 4) {
                    addLearnedPattern(baseWord.replace(/[^00-\u0E7Fa-z]/g, ''), type, 0.6);
                    console.log(`📚 [Learning] เรียนรู้คำซ้ำ: "${baseWord}" (${type})`);
                }
            }
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

        /**
         * ตรวจสอบข้อความว่ามีเนื้อหาผิดกฎหรือไม่
         * @param {string} content ข้อความที่ต้องการตรวจสอบ
         * @returns {object|null} ข้อมูลการละเมิด หรือ null ถ้าไม่พบ
         */
        async checkMessage(content) {
            // ตรวจสอบ pattern ที่ block
            for (const [type, patterns] of Object.entries(this.blockedPatterns)) {
                for (const pattern of patterns) {
                    if (pattern.test(content)) {
                        return {
                            type,
                            pattern: pattern.source,
                            reason: this.getReasonMessage(type)
                        };
                    }
                }
            }

            // ตรวจสอบ domain ที่ block
            const urls = content.match(this.urlPattern);
            if (urls) {
                for (const url of urls) {
                    const domain = this.extractDomain(url);
                    if (this.blockedDomains.includes(domain)) {
                        return {
                            type: 'blocked_domain',
                            pattern: domain,
                            reason: this.getReasonMessage('blocked_domain')
                        };
                    }
                }
            }

            // TODO: เพิ่ม AI moderation (Hugging Face) ถ้าต้องการ
            
                // ตรวจสอบด้วย Hugging Face (wisesight/bert-base-thai-toxic)
                try {
                    const hfResult = await hf.textClassification({
                        model: 'wisesight/bert-base-thai-toxic',
                        inputs: content
                    });
                    if (hfResult && Array.isArray(hfResult) && hfResult.length > 0) {
                        // หาค่าที่มี score สูงสุด
                        const toxic = hfResult.find(r => r.label.toLowerCase().includes('toxic') && r.score > 0.5);
                        if (toxic) {
                            return {
                                type: 'ai_toxic',
                                pattern: toxic.label,
                                score: toxic.score,
                                reason: 'ตรวจพบข้อความไม่เหมาะสมโดย AI (Hugging Face)'
                            };
                        }
                    }
                } catch (err) {
                    console.error('AI moderation error:', err);
                }

            return null; // ไม่พบการละเมิด
        }
}
