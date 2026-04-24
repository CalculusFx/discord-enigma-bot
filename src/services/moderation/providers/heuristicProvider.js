// Simple heuristic moderation provider: checks keywords, repeated chars, excessive links

const _esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Build an evasion-tolerant regex: between each character allow optional non-letter separators.
 * Catches "ส.ั.ส", "ส ั ส", "ส@ัส" but NOT "สวัสดี" (ว is a letter).
 */
function evasionRegex(word) {
    const parts = Array.from(word).map(_esc);
    return new RegExp(parts.join('[^\\p{L}\\p{N}]*'), 'iu');
}

/**
 * Build an evasion-tolerant regex that allows non-Thai insertion between Thai chars.
 * e.g. "สhัeส" still matches "สัส".
 */
function thaiEvasionRegex(word) {
    const parts = Array.from(word).map(_esc);
    return new RegExp(parts.join('[^\\u0E00-\\u0E7F]*'), 'iu');
}

// Thai character → Latin phonetic equivalents, used by mixedScriptRegex.
// Tone/combining marks map to [] meaning they become optional in the regex.
const THAI_LATIN_MAP = {
    'ก': ['k','g'], 'ข': ['k','kh'], 'ค': ['k','kh'], 'ง': ['ng'],
    'จ': ['j'], 'ช': ['ch','c'], 'ซ': ['s','z'], 'ด': ['d'],
    'ต': ['t'], 'ถ': ['th','t'], 'ท': ['th','t'], 'น': ['n'],
    'บ': ['b'], 'ป': ['p'], 'ผ': ['ph','p'], 'พ': ['ph','p','w'],
    'ฝ': ['f'], 'ฟ': ['f'], 'ม': ['m'], 'ย': ['y'],
    'ร': ['r'], 'ล': ['l'], 'ว': ['w','v'], 'ส': ['s'],
    'ห': ['h'], 'อ': ['o','a'],
    'า': ['a','ar'], 'ิ': ['i'], 'ี': ['ee','i'], 'ึ': ['ue'],
    'ุ': ['u'], 'ู': ['u','oo'], 'เ': ['e'], 'แ': ['ae','a'],
    'โ': ['o'], 'ไ': ['ai','i'], 'ใ': ['ai','i'],
    'ั': ['a','u'], 'ะ': ['a'], 'ื': ['ue'],
    // Tone/diacritic marks: optional
    '็': [], '่': [], '้': [], '๊': [], '๋': [], 'ํ': [], '์': [],
};

/**
 * Generate a mixed-script regex where each Thai char can be replaced by its Latin equivalent.
 * Catches: "Sล็อต" (S→ส), "สlot" (l→ล), "Wนัน" (W→พ via 'w' mapping).
 */
function mixedScriptRegex(thaiWord) {
    const parts = Array.from(thaiWord).map(ch => {
        const latins = THAI_LATIN_MAP[ch];
        if (latins === undefined) return _esc(ch);
        if (latins.length === 0) return `(?:${_esc(ch)})?`;
        return `(?:${[_esc(ch), ...latins.map(_esc)].join('|')})`;
    });
    return new RegExp(parts.join('[^\\p{L}\\p{N}]*'), 'iu');
}

// Gambling keywords with Thai forms, Thai phonetic variants, and Latin romanizations.
const GAMBLING_TERMS = [
    {
        label: 'พนัน',
        thai: ['พนัน', 'รับพนัน', 'พนันบอล', 'รับพนันบอล'],
        thaiPhonetic: ['พะนัน', 'พะนัล', 'พะหนัน', 'พนัลบอล'],
        latin: ['panan', 'phanan', 'panun', 'phanun', 'wnan', 'gambling'],
    },
    {
        label: 'สล็อต',
        thai: ['สล็อต'],
        thaiPhonetic: ['ซล็อต'],
        latin: ['slot', 'slots', 'slott'],
    },
    {
        label: 'บาคาร่า',
        thai: ['บาคาร่า'],
        thaiPhonetic: ['บาคารา', 'บาคาลา'],
        latin: ['baccarat', 'baccara', 'bakara', 'bacara'],
    },
    {
        label: 'แทงบอล',
        thai: ['แทงบอล', 'แทงหวย'],
        thaiPhonetic: ['แตงบอล'],
        latin: ['tangball', 'thangball', 'tangbol', 'thangbol'],
    },
    {
        label: 'เดิมพัน',
        thai: ['เดิมพัน'],
        thaiPhonetic: [],
        latin: ['wager', 'wagering'],
    },
    {
        label: 'หวย',
        thai: ['หวยออนไลน์', 'ซื้อหวย', 'เลขหวย'],
        thaiPhonetic: [],
        latin: ['huay', 'huai'],
    },
    {
        label: 'คาสิโน',
        thai: ['คาสิโน'],
        thaiPhonetic: ['คาซิโน'],
        latin: ['casino'],
    },
    {
        label: 'bet365',
        thai: [],
        thaiPhonetic: [],
        latin: ['bet365'],
    },
    // Gambling promotion phrases
    {
        label: 'โปรโมชั่นพนัน',
        thai: ['ถอนไว', 'ฝากถอน', 'ราคาบอล', 'เปิดบิล', 'ฝากขั้นต่ำ'],
        thaiPhonetic: [],
        latin: [],
    },
];

// Wrap a regex with Unicode-aware word boundaries so "slot" doesn't match inside "timeslot".
function withWordBoundary(rx) {
    return new RegExp(`(?<![\\p{L}\\p{N}])(?:${rx.source})(?![\\p{L}\\p{N}])`, rx.flags);
}

// Pre-compile all gambling detection patterns once at module load.
const GAMBLING_CHECKS = (function buildChecks() {
    return GAMBLING_TERMS.map(kw => {
        const allThai = [...kw.thai, ...kw.thaiPhonetic];
        const compiled = { label: kw.label, thaiStrings: allThai, latinStrings: kw.latin, regexes: [] };
        for (const thai of allThai) {
            const tl = thai.toLowerCase();
            if (tl.length < 3) continue;
            try { compiled.regexes.push(withWordBoundary(evasionRegex(tl))); } catch {}
            try { compiled.regexes.push(withWordBoundary(thaiEvasionRegex(tl))); } catch {}
            try { compiled.regexes.push(withWordBoundary(mixedScriptRegex(tl))); } catch {}
        }
        return compiled;
    });
})();

export async function check(content, config, guildId = null) {
    if (typeof content !== 'string') content = String(content ?? '');
    const lower = content.toLowerCase();

    // Evasion-bypass variants:
    // 1. Strip common separator chars → catches "ส ั ส", "f.u.c.k", "bet-365"
    const nosep = lower.replace(/[\s\-_.@#*!|/\\]+/g, '');
    // 2. Strip non-Thai chars → catches Thai words with English letters inserted like "สhัeส"
    const thaionly = lower.replace(/[^\u0E00-\u0E7F\u0300-\u036F]/g, '');
    // 3. Strip non-English/Latin chars → catches English words with noise inserted
    const latinonly = lower.replace(/[^a-z]/g, '');
    // 4. Leet-speak normalizer (keeps spaces for word-boundary matching): "sl0t"→"slot", "ph4n4n"→"phanаn"
    const leet = lower
        .replace(/4/g, 'a').replace(/3/g, 'e').replace(/1/g, 'i')
        .replace(/0/g, 'o').replace(/5/g, 's').replace(/\$/g, 's')
        .replace(/7/g, 't').replace(/8/g, 'b').replace(/6/g, 'g');

    // Check moderation whitelist (DB)
    try {
        const db = await import('../../database.js');
        // check guild-level whitelist first
        if (guildId && typeof db.getGuildModerationWhitelist === 'function') {
            const gw = db.getGuildModerationWhitelist(guildId);
            if (Array.isArray(gw) && gw.length > 0) {
                for (const w of gw) {
                    if (!w || !w.item) continue;
                    try {
                        const raw = String(w.item);
                        if (/^\/.+\/[a-z]*$/i.test(raw)) {
                            const lastSlash = raw.lastIndexOf('/');
                            const pattern = raw.slice(1, lastSlash);
                            const flags = raw.slice(lastSlash + 1) || 'iu';
                            const r = new RegExp(pattern, flags);
                            if (r.test(content)) return { isViolation: false, whitelistMatched: w };
                            continue;
                        }
                        const key = raw.toLowerCase();
                        const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
                        const tokenPattern = `(^|[^\\p{L}\\p{N}])${escapeRegex(key)}($|[^\\p{L}\\p{N}])`;
                        const r = new RegExp(tokenPattern, 'iu');
                        if (r.test(content)) return { isViolation: false, whitelistMatched: w };
                    } catch {}
                }
            }
        }

        const { getModerationWhitelist } = db;
        const whitelist = getModerationWhitelist();
        if (Array.isArray(whitelist) && whitelist.length > 0) {
            const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
            for (const w of whitelist) {
                if (!w || !w.item) continue;
                const raw = String(w.item);
                // support raw regex if stored like /pattern/flags
                if (/^\/.+\/[a-z]*$/i.test(raw)) {
                    try {
                        const lastSlash = raw.lastIndexOf('/');
                        const pattern = raw.slice(1, lastSlash);
                        const flags = raw.slice(lastSlash + 1) || 'iu';
                        const r = new RegExp(pattern, flags);
                        if (r.test(content)) return { isViolation: false, whitelistMatched: w };
                        continue;
                    } catch (err) {
                        // fallthrough to literal matching
                    }
                }

                const key = raw.toLowerCase();
                // Use Unicode-aware boundary: match if item appears as a standalone token
                // or as substring when appropriate. Use Unicode property escapes to identify letters/numbers.
                const tokenPattern = `(^|[^\\p{L}\\p{N}])${escapeRegex(key)}($|[^\\p{L}\\p{N}])`;
                try {
                    const r = new RegExp(tokenPattern, 'iu');
                    if (r.test(content)) return { isViolation: false, whitelistMatched: w };
                } catch (err) {
                    // fallback to simple substring
                    if (lower.includes(key)) return { isViolation: false, whitelistMatched: w };
                }
            }
        }
    } catch (err) {
        // ignore DB errors and continue
    }

    // quick URL spam check
    const urlCount = (lower.match(/https?:\/\//g) || []).length;
    if (urlCount >= 3) return { isViolation: true, type: 'spam_links', reason: 'ส่งลิงก์จำนวนมาก' };

    // Normalize elongated characters: compress runs of the same character to a max of 3
    // e.g. 'ม่ายยยยย' -> 'ม่ายยย'
    const normalized = lower.replace(/(.)\1{3,}/gu, (m, ch) => ch.repeat(3));

    // Create a variant with trailing elongation collapsed to a single char.
    // e.g. 'พราวอยู่ไหนนนน' -> 'พราวอยู่ไหนน'
    let withoutTrailing = lower;
    try {
        withoutTrailing = lower.replace(/(?!\p{N})(.)\1{2,}$/u, '$1');
    } catch (err) {
        // fallback: if unicode property escapes not supported, use simple digit-safe pattern
        withoutTrailing = lower.replace(/([^0-9])\1{2,}$/, '$1');
    }
    const normalizedWithoutTrailing = withoutTrailing.replace(/(.)\1{3,}/gu, (m, ch) => ch.repeat(3));

    // obvious profanities (extend as needed)
    const profanity = [ 'ควย', 'สัส', 'เหี้ย', 'ไอ้สัด', 'ไอ้เวร', 'เย็ด', 'หี', 'เชี่ย', 'fuck', 'shit', 'bitch' ];

    // Quick profanity token check: catch base profane tokens even when suffixed (e.g., 'ควยบอท')
    // Also checks evasion-bypass variants to catch inserted separators/foreign characters.
    for (const p of profanity) {
        const lp = p.toLowerCase();
        const isThai = /[\u0E00-\u0E7F]/.test(lp);
        const isLatin = /[a-z]/.test(lp);

        // 1. Exact token boundary match
        try {
            const tokenPattern = `(^|[^\\p{L}\\p{N}])${lp}($|[^\\p{L}\\p{N}])`;
            const r = new RegExp(tokenPattern, 'iu');
            if (r.test(lower)) return { isViolation: true, type: 'profanity', pattern: p, reason: 'คำหยาบคายไม่อนุญาต' };
        } catch (e) {
            if (lower.includes(lp)) return { isViolation: true, type: 'profanity', pattern: p, reason: 'คำหยาบคายไม่อนุญาต' };
        }

        // 2. Suffix match: profane base followed by letters (e.g., ควยบอท, สัสอีกรอบ)
        if (lower.includes(lp) && /\p{L}/u.test(lower[lower.indexOf(lp) + lp.length] || '')) {
            return { isViolation: true, type: 'profanity', pattern: p, reason: 'คำหยาบคายไม่อนุญาต' };
        }

        // 3. Separator bypass: check nosep variant (catches "ส ั ส", "ส.ั.ส", "f.u.c.k")
        if (nosep.includes(lp)) return { isViolation: true, type: 'profanity', pattern: p, reason: 'คำหยาบคายไม่อนุญาต (เลี่ยงด้วยสัญลักษณ์)' };

        // 4. Thai-word foreign-insertion bypass: check thaionly variant (catches "สhัeส")
        if (isThai && thaionly.includes(lp)) return { isViolation: true, type: 'profanity', pattern: p, reason: 'คำหยาบคายไม่อนุญาต (เลี่ยงด้วยตัวอักษรต่างภาษา)' };

        // 5. Latin-word noise bypass: check latinonly and leet variants (catches "f_u_c_k", "sh1t")
        if (isLatin && (latinonly.includes(lp) || leet.includes(lp))) return { isViolation: true, type: 'profanity', pattern: p, reason: 'คำหยาบคายไม่อนุญาต (เลี่ยงด้วยสัญลักษณ์)' };

        // 6. Evasion regex: catches insertion of non-letter separators between each char (e.g., "ส ั ส", "ส@ัส")
        try {
            if (evasionRegex(lp).test(lower)) return { isViolation: true, type: 'profanity', pattern: p, reason: 'คำหยาบคายไม่อนุญาต (เลี่ยงด้วยอักขระแทรก)' };
        } catch (e) { /* ignore */ }

        // 7. Thai evasion regex: catches Thai words with non-Thai chars inserted between Thai chars
        if (isThai) {
            try {
                if (thaiEvasionRegex(lp).test(lower)) return { isViolation: true, type: 'profanity', pattern: p, reason: 'คำหยาบคายไม่อนุญาต (เลี่ยงด้วยตัวอักษรแทรก)' };
            } catch (e) { /* ignore */ }
        }
    }

    // detect repeated digit sequences like '55555' or '000000'
    // allow long numeric sequences when they appear inside a normal sentence (e.g., invoice#1234567890)
    // flag only when the message is predominantly digits or there is an extreme single-digit run
    if (/^\d{10,}$/.test(lower)) return { isViolation: true, type: 'repetition', rule: 'digit_run', subtype: 'digit', reason: 'เลขซ้ำ/ยาวเกินไป' };
    if (/([0-9])\1{40,}/u.test(lower)) return { isViolation: true, type: 'repetition', rule: 'digit_run_extreme', subtype: 'digit', reason: 'ตัวเลขซ้ำมากเกินไป' };

    // repeated characters (e.g., สัสสสสส) - detect long runs using the normalized text
    // But allow short, harmless elongated interjections (e.g., 'น้องงงง', 'ช่ายยย', 'ค้าบบบ')
    // Rule: if the message is short, contains only letters (no digits), the collapsed base is short,
    // and the content does not include profanity, treat as harmless elongation.
    const collapsedBase = lower.replace(/(.)\1+/gu, '$1'); // collapse runs to single char
    const isShortHarmless = () => {
        // overall message should be short
        if (lower.length > 12) return false;
        // collapsed base should be reasonably short
        if (collapsedBase.length > 8) return false;
        // no digits
        if (/\d/.test(lower)) return false;
        // must not contain profanity
        for (const p of profanity) if (normalized.includes(p) || lower.includes(p)) return false;
        return true;
    };

    // Detect repeated-character runs (e.g., 'ฮัลโหลลลล', 'สัสสสส') using the normalized text
    // Allow some cases:
    // - short harmless elongations (handled by isShortHarmless)
    // - long messages where the only repeated run is a trailing elongation (dragged ending)
    const repeatRegex = /(?!\p{N})(.)\1{3,}/gu; // matches runs of 4+ identical non-digit chars
    // Check repeats on the version without trailing elongation so trailing dragged letters are ignored
    const repeats = Array.from(normalizedWithoutTrailing.matchAll(repeatRegex));
    if (repeats.length > 0) {
        const hasShortHarmless = isShortHarmless();

        // Check for trailing elongation: find in the original (lower) a long run (4+ same char)
        // that occurs near the end of the message and is the only such long run.
        let trailingElongation = false;
        try {
            const trailingRegex = /(?!\p{N})(.)\1{3,}/gu; // original long run (4+)
            const allLongRuns = Array.from(lower.matchAll(trailingRegex));
            if (allLongRuns.length === 1) {
                const m = allLongRuns[0];
                const start = typeof m.index === 'number' ? m.index : -1;
                const posRatio = start >= 0 ? start / Math.max(1, lower.length) : 0;
                // If the long run starts in the latter half of the message, treat as trailing elongation
                if (posRatio >= 0.5) trailingElongation = true;
            }
        } catch (err) {
            // ignore regex errors
        }

        if (!hasShortHarmless && !trailingElongation) {
            return { isViolation: true, type: 'repetition', rule: 'char_run', subtype: 'char', reason: 'ตัวอักษรซ้ำมากเกินไป' };
        }
        // otherwise ignore repeated-character warning for short harmless elongations or trailing elongation
    }

    // Gambling detection — covers direct Thai, phonetic variants, Latin romanizations,
    // and mixed-script evasion (Sล็อต, สlot, Wนัน, Panan, พะนัล, etc.)
    for (const kw of GAMBLING_CHECKS) {
        const reason = 'เกี่ยวกับการพนัน';

        // 1. Direct substring: Thai forms + phonetic variants against original, nosep, thaionly
        for (const thai of kw.thaiStrings) {
            const tl = thai.toLowerCase();
            if (lower.includes(tl) || thaionly.includes(tl) || nosep.includes(tl))
                return { isViolation: true, type: 'gambling', pattern: kw.label, reason };
        }

        // 2. Latin romanizations — always use word boundaries to avoid "timeslot"→slot false positives.
        //    Also test leet-normalized content (e.g. "sl0t"→"slot").
        for (const latin of kw.latinStrings) {
            const ll = latin.toLowerCase();
            const wbRx = new RegExp(`(?<![\\p{L}\\p{N}])${_esc(ll)}(?![\\p{L}\\p{N}])`, 'iu');
            if (wbRx.test(lower) || wbRx.test(nosep) || wbRx.test(leet))
                return { isViolation: true, type: 'gambling', pattern: kw.label, reason: `${reason} (เลี่ยงด้วยอักษรโรมัน)` };
        }

        // 3. Pre-compiled evasion/mixed-script regexes
        for (const rx of kw.regexes) {
            try {
                if (rx.test(lower)) return { isViolation: true, type: 'gambling', pattern: kw.label, reason: `${reason} (เลี่ยงด้วยอักขระแทรก)` };
            } catch {}
        }
    }

    // Also check learned patterns from DB (simple substring match against normalized content)
    try {
        // require here to avoid circular import in some environments
        const { getLearnedPatterns } = await import('../../database.js');
        // only enforce learned patterns that meet the configured confidence threshold
        const minConf = (config && config.moderation && typeof config.moderation.learnedMinConfidence !== 'undefined') ? Number(config.moderation.learnedMinConfidence) : 0.6;
        const learned = getLearnedPatterns(null, minConf);
        for (const p of learned) {
            const pat = (p.pattern || '').toLowerCase();
            if (!pat) continue;
            // match against normalizedWithoutTrailing first, then normalized and original
            if (normalizedWithoutTrailing.includes(pat) || normalized.includes(pat) || lower.includes(pat)) {
                return { isViolation: true, type: p.type || 'learned', pattern: p.pattern, confidence: p.confidence, reason: 'ตรวจพบ pattern ที่เรียนรู้' };
            }
        }
    } catch (err) {
        // silent if DB not available
    }

    return { isViolation: false };
}
