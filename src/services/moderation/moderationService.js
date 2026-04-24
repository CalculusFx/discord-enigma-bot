import config from '../../config.js';
import { getLearnedPatterns, addLearnedPattern, getBlockedDomains, logModeration, getModerationProvider, setModerationProvider, getGuildModerationProvider, setGuildModerationProvider, getGuildSettings, addAdminLog, getLearnedPatternById, updateLearnedPatternConfidence, removeLearnedPattern } from '../database.js';
import { HfInference } from '@huggingface/inference';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

// provider adapters
import * as heuristicProvider from './providers/heuristicProvider.js';
import * as openaiProvider from './providers/openaiProvider.js';

const hf = new HfInference(config.huggingface.apiKey || undefined); // เพิ่ม apiKey ใน config.js/.env

export class ModerationService {
    constructor() {
    // ไม่ใช้ OpenAI แล้ว
    // Support legacy placement: allow blockedPatterns to live under config.moderation
    // or at top-level `config.blockedPatterns` (backwards compatibility).
    this.blockedPatterns = (config.moderation && config.moderation.blockedPatterns) ? config.moderation.blockedPatterns : (config.blockedPatterns || {});
        // Normalize blockedDomains: accept array, comma-separated string, or missing values
        const rawDomains = config && config.moderation && config.moderation.blockedDomains;
        if (Array.isArray(rawDomains)) {
            this.blockedDomains = [...rawDomains];
        } else if (typeof rawDomains === 'string') {
            this.blockedDomains = rawDomains.split(',').map(s => s.trim()).filter(Boolean);
            console.warn('[ModerationService] moderation.blockedDomains provided as string; parsed into array');
        } else {
            this.blockedDomains = [];
            if (rawDomains != null) console.warn('[ModerationService] moderation.blockedDomains is not an array or string; defaulting to empty list');
        }
        
        // URL regex pattern
        this.urlPattern = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
        
    // Load learned patterns and domains from database
    this.loadLearnedData();

    // pendingActions stores short tokens -> { pattern, type, patternId }
    this.pendingActions = new Map();

    // Simple in-memory cache for AI moderation results
    this.aiCache = new Map(); // key -> { result, ts }
    this.aiCacheMax = 500;
    // Expose provider and availability flags for commands/UI
    const persisted = getModerationProvider();
    this.provider = persisted || config.moderation.provider || 'heuristic';
    this.openai = Boolean(config.openai && config.openai.apiKey);
    }

    // Optional client reference (set by index.js after client creation)
    setClient(client) {
        this.client = client;
    }

    // Notify admins or mod channel when a new learned pattern is added automatically
    async notifyAdmins(pattern, type, meta = {}) {
        // send an embed with approve/reject buttons for admins to act on the learned pattern
        const logChannelId = config.moderation?.logChannelId;
        if (!this.client) return;

        const embed = new EmbedBuilder()
            .setTitle('📚 New learned moderation pattern')
            .setDescription(`A new pattern was automatically learned.`)
            .addFields(
                { name: 'Pattern', value: `\`${pattern}\``, inline: false },
                { name: 'Type', value: String(type || 'unknown'), inline: true },
                { name: 'Guild', value: meta.guildId ? `<@&${meta.guildId}>` : 'Global', inline: true },
            )
            .setTimestamp();

        // create buttons with pattern text encoded in customId; patternId may be present in meta
        // Try to resolve a DB id for the pattern if possible
        let patternId = meta.patternId || meta.id || null;
        if (!patternId) {
            // search all stored patterns (including low-confidence) when resolving an id/token
            const learned = getLearnedPatterns(null, 0).find(p => String(p.pattern) === String(pattern) && p.type === type);
            if (learned) patternId = learned.id;
        }

        // Use a short token when we don't have a numeric id or when pattern string is too long
        const makeToken = () => `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`;
        let token = null;
        if (patternId && String(patternId).length <= 50) {
            token = String(patternId);
        } else {
            token = makeToken();
            this.pendingActions.set(token, { pattern, type, patternId: patternId || null });
        }

        const approveId = `mod_approve:${token}`;
        const rejectId = `mod_reject:${token}`;

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(approveId)
                .setLabel('Approve')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(rejectId)
                .setLabel('Reject')
                .setStyle(ButtonStyle.Danger),
        );

        if (logChannelId) {
            const ch = await this.client.channels.fetch(logChannelId).catch(() => null);
            if (ch && ch.send) {
                await ch.send({ embeds: [embed], components: [row] }).catch(() => null);
            }
        }

        // also attempt to send to the guild log channel if provided
        if (meta.guildId) {
            try {
                const guildSettings = getGuildSettings(meta.guildId) || {};
                const gidLog = guildSettings?.log_channel_id || null;
                if (gidLog) {
                    const gch = await this.client.channels.fetch(gidLog).catch(() => null);
                    if (gch && gch.send) {
                        await gch.send({ embeds: [embed], components: [row] }).catch(() => null);
                    }
                }
            } catch (e) {
                // ignore
            }
        }
    }

    // Compile a learned literal pattern into a flexible regex that tolerates
    // repeated characters and elongated runs. E.g. "สัส" -> /ส{1,}ั{1,}ส{1,}/i
    compileFlexiblePattern(pat) {
        const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
        const chars = Array.from(String(pat));
        // Allow configurable max repeats per character to avoid matching arbitrarily long elongations.
        // Default to 3 (e.g., allow 'สัสสส' but not infinite runs).
        const maxRepeat = (config && config.moderation && Number(config.moderation.maxFlexibleRepeat)) ? Number(config.moderation.maxFlexibleRepeat) : 3;
        const parts = chars.map(ch => {
            if (/\s/.test(ch)) return '\\s+';
            // For combining marks (diacritics), don't allow repeated runs; make them optional
            try {
                if (/\p{M}/u.test(ch)) return `${escapeRegex(ch)}?`;
            } catch (e) {
                // ignore if environment doesn't support \p
            }
            return `${escapeRegex(ch)}{1,${maxRepeat}}`;
        });
        return new RegExp(parts.join(''), 'iu');
    }

    /**
     * Set moderation provider at runtime (in-memory only).
     * Note: this does not persist to .env - consider persisting to DB if needed.
     */
    setProvider(name, guildId = null) {
        if (guildId) {
            try {
                setGuildModerationProvider(guildId, name);
                console.log(`[ModerationService] provider for guild ${guildId} set to: ${name}`);
            } catch (err) {
                console.error('Failed to persist guild moderation provider:', err);
            }
        } else {
            this.provider = name;
            if (!config.moderation) config.moderation = {};
            config.moderation.provider = name;
            // persist
            try {
                setModerationProvider(name);
            } catch (err) {
                console.error('Failed to persist moderation provider:', err);
            }
            console.log(`[ModerationService] global provider set to: ${name}`);
        }
    }

    loadLearnedData() {
        try {
            // Load learned patterns (only those above configured enforcement threshold)
            const minConf = (config.moderation && config.moderation.learnedMinConfidence) ? Number(config.moderation.learnedMinConfidence) : 0.6;
            const patterns = getLearnedPatterns(null, minConf);
            console.log(`📚 กำลังโหลด ${patterns.length} patterns ที่เรียนรู้แล้ว (minConf=${minConf})...`);
            // Helper: escape regex special chars
            const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            // Convert a learned literal pattern into a flexible regex that tolerates
            // repeated characters and elongated runs. E.g. "สัส" -> /ส+ั+ส+/i (approx)
            const compileFlexible = (pat) => this.compileFlexiblePattern(pat);

            // Track original patterns to avoid duplicates
            const seen = new Set();
            patterns.forEach(p => {
                const category = this.blockedPatterns[p.type];
                if (!category) return;

                const key = String(p.pattern).toLowerCase();
                if (seen.has(key)) return;

                try {
                    const regex = compileFlexible(p.pattern);
                    category.push(regex);
                    seen.add(key);
                    console.log(`  ✅ โหลด pattern: "${p.pattern}" (${p.type}, confidence: ${p.confidence})`);
                } catch (err) {
                    // fallback to literal safe regex
                    const safe = escapeRegex(p.pattern);
                    category.push(new RegExp(safe, 'i'));
                    seen.add(key);
                    console.log(`  ⚠️ โหลด pattern แบบ fallback: "${p.pattern}" (${p.type})`);
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

    // Clear learned entries and reload from DB + config
    reloadLearnedData() {
        // Reset blockedPatterns to config base (non-learned)
        this.blockedPatterns = {};
        for (const [k, arr] of Object.entries(config.moderation.blockedPatterns || {})) {
            this.blockedPatterns[k] = (arr || []).map(item => (item instanceof RegExp ? item : new RegExp(String(item), 'i')));
        }
        this.blockedDomains = [...(config.moderation.blockedDomains || [])];
        // Reload from DB
        this.loadLearnedData();
        console.log('[ModerationService] reloaded learned patterns from DB');
    }

    async learn(content, type, meta = {}) {
        const lowerContent = content.toLowerCase();
        // Helper: avoid learning long sentences or multi-word spammy phrases unintentionally
        const shouldAutoLearn = (s) => {
            if (!s) return false;
            const t = String(s).trim();
            // too long in characters
            if (t.length > 60) return false;
            // too many words
            const wc = t.split(/\s+/).filter(Boolean).length;
            if (wc > 3) return false;
            // avoid learning pure punctuation or very short tokens
            if (t.length < 3) return false;
            return true;
        };
        
        // 1. เรียนรู้คำเดี่ยว (Single words)
        const words = content.split(/\s+/).filter(w => w.length > 3);
        for (const word of words) {
            if (!this.isSignificantWord(word)) continue;
            const cleanWord = word.toLowerCase().replace(/[^\u0E00-\u0E7Fa-z0-9]/g, '');
            if (cleanWord.length < 3) continue;

            // Determine if this single word should be learned.
            let shouldLearn = true;
            // For repetition-type learning, require the word itself to show repetition/elongation or numeric/alphanumeric pattern
            if (type === 'repetition') {
                shouldLearn = false;
                // repeated characters (3+), e.g., 'สัสสส' or 'kkkk'
                if (/(.)\1{2,}/.test(cleanWord)) shouldLearn = true;
                // repeated digit sequences, e.g., '55555'
                if (/\d{1,}/.test(cleanWord)) shouldLearn = true;
                // alphanumeric mixes like 'abc123' or '123abc'
                if (/[a-z\u0E00-\u0E7F]+\d+|\d+[a-z\u0E00-\u0E7F]+/i.test(cleanWord)) shouldLearn = true;
                // elongated forms where same char repeated but separated by combining marks — fallback handled by repeated chars above
            }

                if (!shouldLearn) continue;

            // only auto-learn short tokens / short words
            if (!shouldAutoLearn(cleanWord)) continue;

            // finally add pattern
            addLearnedPattern(cleanWord, type, 0.4);
            try { addAdminLog({ action: 'auto_learn_pattern', performedBy: meta?.source || null, details: { pattern: cleanWord, type, guildId: meta?.guildId || null } }); } catch {}
            try { this.notifyAdmins(cleanWord, type, meta); } catch {}
            // also add to in-memory patterns immediately
            try {
                const flex = this.compileFlexiblePattern(cleanWord);
                if (this.blockedPatterns[type] && !this.blockedPatterns[type].some(r => r.source === flex.source)) {
                    this.blockedPatterns[type].push(flex);
                }
            } catch {}
            console.log(`📚 [Learning] เรียนรู้คำเดี่ยว: "${cleanWord}" (${type})`);
        }
        
        // 2. เรียนรู้วลี 2 คำ (Bigrams)
        const cleanWords = lowerContent.split(/\s+/).filter(w => w.length >= 2);
        for (let i = 0; i < cleanWords.length - 1; i++) {
            const bigram = `${cleanWords[i]} ${cleanWords[i + 1]}`;
            const cleanBigram = bigram.replace(/[^\u0E00-\u0E7Fa-z\s]/g, '').trim();
            
            if (cleanBigram.length >= 5 && !this.isCommonPhrase(cleanBigram)) {
                // only learn short bigrams (<=2 words and not overly long)
                if (shouldAutoLearn(cleanBigram)) {
                    addLearnedPattern(cleanBigram, type, 0.5);
                }
                try { addAdminLog({ action: 'auto_learn_pattern', performedBy: meta?.source || null, details: { pattern: cleanBigram, type, guildId: meta?.guildId || null } }); } catch {}
                try { this.notifyAdmins(cleanBigram, type, meta); } catch {}
                try {
                    const flex = this.compileFlexiblePattern(cleanBigram);
                    if (this.blockedPatterns[type] && !this.blockedPatterns[type].some(r => r.source === flex.source)) {
                        this.blockedPatterns[type].push(flex);
                    }
                } catch {}
                console.log(`📚 [Learning] เรียนรู้วลี: "${cleanBigram}" (${type})`);
            }
        }
        
        // 3. เรียนรู้รูปแบบตัวเลขผสม (เช่น "ควย123", "s4t4n")
        const alphanumericPattern = /[a-z\u0E00-\u0E7F]+\d+|\d+[a-z\u0E00-\u0E7F]+/gi;
        const matches = lowerContent.match(alphanumericPattern);
        if (matches) {
            for (const match of matches) {
                if (match.length >= 4) {
                    // alphanumeric matches can be learned if reasonably short
                    if (shouldAutoLearn(match)) {
                        addLearnedPattern(match, type, 0.6);
                    }
                    try { addAdminLog({ action: 'auto_learn_pattern', performedBy: meta?.source || null, details: { pattern: match, type, guildId: meta?.guildId || null } }); } catch {}
                    try { this.notifyAdmins(match, type, meta); } catch {}
                        try {
                            const flex = this.compileFlexiblePattern(match);
                            if (this.blockedPatterns[type] && !this.blockedPatterns[type].some(r => r.source === flex.source)) {
                                this.blockedPatterns[type].push(flex);
                            }
                        } catch {}
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
                    const cleaned = baseWord.replace(/[^\u0000-\u0E7Fa-z]/g, '');
                    if (shouldAutoLearn(cleaned)) {
                        addLearnedPattern(cleaned, type, 0.6);
                    }
                    try { addAdminLog({ action: 'auto_learn_pattern', performedBy: meta?.source || null, details: { pattern: cleaned, type, guildId: meta?.guildId || null } }); } catch {}
                    try { this.notifyAdmins(cleaned, type, meta); } catch {}
                    try {
                        const flex = this.compileFlexiblePattern(cleaned);
                        if (this.blockedPatterns[type] && !this.blockedPatterns[type].some(r => r.source === flex.source)) {
                            this.blockedPatterns[type].push(flex);
                        }
                    } catch {}
                    console.log(`📚 [Learning] เรียนรู้คำซ้ำ: "${cleaned}" (${type})`);
                }
            }
        }
    }

    /**
     * Promote a learned pattern (increase confidence) by id.
     */
    async approveLearnedPattern(patternId, performedBy = null) {
        try {
            // patternId can be numeric id or token
            let resolvedId = null;
            let p = null;
            if (typeof patternId === 'number' || (/^\d+$/.test(String(patternId)) && String(patternId).length < 10)) {
                resolvedId = Number(patternId);
                p = getLearnedPatternById(resolvedId);
            } else {
                // token: try pendingActions map
                const meta = this.pendingActions.get(String(patternId));
                if (meta) {
                    // try find in DB by pattern+type
                    const found = getLearnedPatterns().find(x => x.pattern === meta.pattern && x.type === meta.type);
                    if (found) {
                        resolvedId = found.id;
                        p = found;
                    } else {
                        // insert if missing
                        addLearnedPattern(meta.pattern, meta.type, 0.5);
                        const newFound = getLearnedPatterns().find(x => x.pattern === meta.pattern && x.type === meta.type);
                        resolvedId = newFound?.id || null;
                        p = newFound || null;
                    }
                    // clear pending
                    this.pendingActions.delete(String(patternId));
                }
            }

            if (!p || !resolvedId) return null;
            const newConf = Math.min(0.99, (p.confidence || 0) + 0.3);
            const updated = updateLearnedPatternConfidence(resolvedId, newConf);
            addAdminLog({ action: 'approve_pattern', performedBy, details: { id: resolvedId, pattern: p.pattern, oldConfidence: p.confidence, newConfidence: newConf } });

            // ensure in-memory patterns include the compiled regex
            try {
                const flex = this.compileFlexiblePattern(p.pattern);
                if (this.blockedPatterns[p.type] && !this.blockedPatterns[p.type].some(r => r.source === flex.source)) {
                    this.blockedPatterns[p.type].push(flex);
                }
            } catch (e) {}

            return { ...updated };
        } catch (err) {
            console.error('approveLearnedPattern error:', err);
            return null;
        }
    }

    /**
     * Reject a learned pattern: remove from DB and from in-memory patterns.
     */
    async rejectLearnedPattern(patternId, performedBy = null) {
        try {
            // resolve id or token similar to approve
            let resolvedId = null;
            let p = null;
            if (typeof patternId === 'number' || (/^\d+$/.test(String(patternId)) && String(patternId).length < 10)) {
                resolvedId = Number(patternId);
                p = getLearnedPatternById(resolvedId);
            } else {
                const meta = this.pendingActions.get(String(patternId));
                if (meta) {
                    const found = getLearnedPatterns().find(x => x.pattern === meta.pattern && x.type === meta.type);
                    if (found) {
                        resolvedId = found.id;
                        p = found;
                    }
                    this.pendingActions.delete(String(patternId));
                }
            }

            if (!p || !resolvedId) return null;
            const removed = removeLearnedPattern(resolvedId);
            addAdminLog({ action: 'reject_pattern', performedBy, details: { id: resolvedId, pattern: p.pattern } });

            // remove from in-memory blockedPatterns
            try {
                if (this.blockedPatterns[p.type]) {
                    const source = this.compileFlexiblePattern(p.pattern).source;
                    this.blockedPatterns[p.type] = this.blockedPatterns[p.type].filter(r => r.source !== source && r.source !== String(p.pattern));
                }
            } catch (e) {}

            return { removed: Boolean(removed), pattern: p };
        } catch (err) {
            console.error('rejectLearnedPattern error:', err);
            return null;
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
            'your', 'what', 'when', 'where', 'why', 'how', 'hello', 'thanks', '55555'
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
    async checkMessage(content, guildId = null) {
            // ป้องกัน content ไม่ใช่ string
            if (typeof content !== 'string') {
                content = String(content ?? '');
            }

            // ตรวจสอบ pattern ที่ block
            for (const [type, patterns] of Object.entries(this.blockedPatterns)) {
                for (const pattern of patterns) {
                    if (pattern.test(content)) {
                        return {
                            isViolation: true,
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
                            isViolation: true,
                            type: 'blocked_domain',
                            pattern: domain,
                            reason: this.getReasonMessage('blocked_domain')
                        };
                    }
                }
            }

            // Provider selection (guild override -> persisted global -> config)
            const guildProvider = guildId ? getGuildModerationProvider(guildId) : null;
            const provider = guildProvider || config.moderation.provider || this.provider || 'heuristic';
            try {
                if (provider === 'heuristic') {
                    const res = await heuristicProvider.check(content, config, guildId);
                    if (res && res.isViolation) return res;

                    // Secondary layer: run HuggingFace after heuristic if API key is available.
                    // This catches bypass cases that heuristic misses (e.g. Thai consonant substitution).
                    const hfKey = config.huggingface && config.huggingface.apiKey;
                    if (hfKey) {
                        try {
                            const cacheKey = `hf:${content.slice(0, 512)}`;
                            const cached = this.aiCache.get(cacheKey);
                            if (cached && (Date.now() - cached.ts) < 60 * 60 * 1000) {
                                if (cached.result && cached.result.isViolation) return cached.result;
                            } else {
                                const hfRes = await fetch('https://router.huggingface.co/api/models/wisesight/bert-base-thai-toxic', {
                                    method: 'POST',
                                    headers: { 'Authorization': `Bearer ${hfKey}`, 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ inputs: content })
                                });
                                if (hfRes.ok) {
                                    const hfJson = await hfRes.json();
                                    const result = Array.isArray(hfJson) && hfJson.length > 0
                                        ? hfJson.find(r => String(r.label).toLowerCase().includes('toxic') && Number(r.score) > 0.5)
                                        : null;
                                    const hfResult = result
                                        ? { isViolation: true, type: 'ai_toxic', pattern: result.label, score: result.score, reason: 'ตรวจพบข้อความไม่เหมาะสมโดย AI (Hugging Face)' }
                                        : { isViolation: false };
                                    this.aiCache.set(cacheKey, { result: hfResult, ts: Date.now() });
                                    if (this.aiCache.size > this.aiCacheMax) this.aiCache.delete(this.aiCache.keys().next().value);
                                    if (hfResult.isViolation) return hfResult;
                                }
                            }
                        } catch (hfErr) {
                            console.warn('[ModerationService] HuggingFace secondary check error:', hfErr?.message || hfErr);
                        }
                    }
                } else if (provider === 'openai') {
                    try {
                        const key = content.slice(0, 1024); // simple key
                        const cached = this.aiCache.get(key);
                        if (cached && (Date.now() - cached.ts) < (1000 * 60 * 60)) {
                            if (cached.result && cached.result.isViolation) return cached.result;
                        } else {
                            const res = await openaiProvider.check(content, config);
                            // store even non-violations to reduce duplicate calls
                            this.aiCache.set(key, { result: res, ts: Date.now() });
                            if (this.aiCache.size > this.aiCacheMax) {
                                // remove oldest entry
                                const firstKey = this.aiCache.keys().next().value;
                                this.aiCache.delete(firstKey);
                            }
                            if (res && res.isViolation) return res;
                        }
                    } catch (err) {
                        console.error('OpenAI provider error:', err);
                    }
                } else if (provider === 'huggingface') {
                    // attempt Hugging Face using direct fetch with Authorization header
                    const apiKey = config.huggingface.apiKey;
                    if (!apiKey) {
                        console.warn('Hugging Face provider selected but no API key configured');
                    } else {
                        try {
                            // use the new HF router endpoint (api-inference deprecated)
                            const url = 'https://router.huggingface.co/api/models/wisesight/bert-base-thai-toxic';
                            const res = await fetch(url, {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bearer ${apiKey}`,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({ inputs: content })
                            });
                            if (!res.ok) {
                                const text = await res.text();
                                console.error('Hugging Face HTTP error:', res.status, text);
                            } else {
                                const hfResult = await res.json();
                                // hfResult expected to be array of {label, score}
                                if (Array.isArray(hfResult) && hfResult.length > 0) {
                                    const toxic = hfResult.find(r => String(r.label).toLowerCase().includes('toxic') && Number(r.score) > 0.5);
                                    if (toxic) return { isViolation: true, type: 'ai_toxic', pattern: toxic.label, score: toxic.score, reason: 'ตรวจพบข้อความไม่เหมาะสมโดย AI (Hugging Face)' };
                                }
                            }
                        } catch (err) {
                            console.error('AI moderation error (huggingface fetch):', err);
                        }
                    }
                }
            } catch (err) {
                console.error('Moderation provider error:', err);
            }

            return { isViolation: false };
        }

        /**
         * ตรวจสอบ attachment (image/video/file) ว่าผิดกฎหรือไม่
         * @param {object} attachment Discord attachment object
         * @returns {object} result object with isViolation boolean
         */
        async checkAttachment(attachment) {
            try {
                if (!attachment) return { isViolation: false };
                const url = attachment.url || attachment.proxyURL || attachment.attachment?.url || '';
                const name = attachment.name || '';

                // Check blocked domain
                if (url) {
                    const domain = this.extractDomain(url);
                    if (this.blockedDomains.includes(domain)) {
                        return { isViolation: true, type: 'blocked_domain', pattern: domain, reason: this.getReasonMessage('blocked_domain') };
                    }
                }

                // Basic filename heuristics: check keywords in filename
                const filename = (name || url.split('/').pop() || '').toLowerCase();
                if (filename) {
                    // reuse heuristic provider for filename text
                    try {
                        const res = heuristicProvider.check(filename, config);
                        if (res && res.isViolation) return { ...res, reason: `Attachment: ${res.reason}` };
                    } catch (err) {
                        console.error('Attachment heuristic error:', err);
                    }
                }

                // default: not a violation
                // If it's an image, attempt OCR and learn text from it (optional)
                try {
                    const contentType = (attachment.contentType || attachment.contentType || '').toLowerCase();
                    const isImage = (attachment.contentType && attachment.contentType.startsWith && attachment.contentType.startsWith('image')) || /\.(png|jpe?g|webp|bmp|gif)$/.test(url);
                    if (isImage) {
                        const ocrText = await this.ocrExtractTextFromUrl(url).catch(() => null);
                        if (ocrText && String(ocrText).trim().length > 0) {
                            // call learn() to register learned patterns from image text
                            try {
                                await this.learn(String(ocrText), 'image_text', { guildId: null, source: 'ocr_attachment' });
                            } catch (e) {}
                        }
                    }
                } catch (e) {}

                return { isViolation: false };
            } catch (err) {
                console.error('Error in checkAttachment:', err);
                return { isViolation: false };
            }
        }

    // OCR helper (dynamic): tries to use tesseract.js if configured as provider
    async ocrExtractTextFromUrl(url) {
        try {
            const provider = config.ocr?.provider || null;
            if (!provider) return null;
            if (provider === 'tesseract') {
                // dynamic import to avoid forcing dependency
                const { createWorker } = await import('tesseract.js').catch(() => ({}));
                if (!createWorker) return null;
                const worker = createWorker({ logger: m => {} });
                await worker.load();
                await worker.loadLanguage('eng+tha').catch(() => {});
                await worker.initialize('eng+tha').catch(() => {});
                const { data } = await worker.recognize(url);
                await worker.terminate();
                return data?.text || null;
            }
            // add other providers here in future
            return null;
        } catch (err) {
            console.error('OCR extraction error:', err);
            return null;
        }
    }
}