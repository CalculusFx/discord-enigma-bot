// config.js
import dotenv from 'dotenv';
dotenv.config({ override: true }); // ให้ .env เขียนทับ env เดิมได้

export default {
    // Discord Configuration
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.CLIENT_ID,
    guildId: process.env.GUILD_ID,

    // Bot Settings
    prefix: process.env.BOT_PREFIX || '!',
    defaultVolume: parseInt(process.env.DEFAULT_VOLUME, 10) || 50,
    maxQueueSize: parseInt(process.env.MAX_QUEUE_SIZE, 10) || 100,

    // TTS Settings
    tts: {
        enabled: process.env.TTS_ENABLED === 'true',
        language: process.env.TTS_LANGUAGE || 'th',
        provider: process.env.TTS_PROVIDER || 'auto', // 'auto' | 'openai' | 'google'
        cache: {
            enabled: process.env.TTS_CACHE_ENABLED === 'true',
            dir: process.env.TTS_CACHE_DIR || './temp/tts_cache',
            ttlSeconds: parseInt(process.env.TTS_CACHE_TTL, 10) || 86400,
            maxEntries: parseInt(process.env.TTS_CACHE_MAX, 10) || 1000,
        },
        debug: process.env.TTS_DEBUG === 'true',
    // Preferred OpenAI voice name (e.g., 'nova', 'coral', 'alloy')
    voice: process.env.TTS_VOICE || process.env.TTS_OPENAI_VOICE || 'nova',
    // Optional gender preference: 'male'|'female'|'auto'
    // Default to 'female' per user request; can be overridden via env TTS_GENDER
    gender: process.env.TTS_GENDER || 'female',
    // Optional instructions to guide TTS prosody and style
    instructions: process.env.TTS_INSTRUCTIONS || process.env.TTS_OPENAI_INSTRUCTIONS || '',
    // OpenAI TTS model to use
    model: process.env.TTS_MODEL || process.env.TTS_OPENAI_MODEL || 'gpt-4o-mini-tts',
        rateLimit: {
            enabled: process.env.TTS_RATE_LIMIT_ENABLED === 'true',
            perMinute: parseInt(process.env.TTS_RATE_LIMIT_PER_MIN, 10) || 30,
        },
    // Voice join/connect tuning
    joinTimeoutMs: parseInt(process.env.TTS_JOIN_TIMEOUT_MS, 10) || 30000,
    joinRetries: parseInt(process.env.TTS_JOIN_RETRIES, 10) || 3,
    },

    // Moderation learned-pattern handling
    moderation: {
        // Minimum confidence required for a learned pattern to be enforced automatically.
        // Raise this to reduce false positives from low-confidence learned patterns.
        learnedMinConfidence: parseFloat(process.env.LEARNED_MIN_CONFIDENCE) || 0.8,
        enabled: process.env.MODERATION_ENABLED === 'true',
        autoDelete: process.env.AUTO_DELETE_VIOLATIONS === 'true',
        logChannelId: process.env.LOG_CHANNEL_ID,
        // Decay window in hours: how long moderation infractions count towards escalation
        decayHours: parseFloat(process.env.MODERATION_DECAY_HOURS) || 24,
        provider: process.env.MODERATION_PROVIDER || 'heuristic',
    },

    // Music Settings
    music: {
        leaveOnEmpty: true,
        leaveOnEmptyCooldown: 300000,
        leaveOnEnd: true,
        leaveOnEndCooldown: 300000,
    },

    // Spotify Configuration
    spotify: {
        clientId: process.env.SPOTIFY_CLIENT_ID,
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    },

    // AI Providers
    huggingface: {
        apiKey: process.env.HUGGINGFACE_API_KEY,
    },
    openai: {
        apiKey: process.env.OPENAI_API_KEY,
    },

    // Admin Settings
    admin: {
        password: process.env.ADMIN_PASSWORD || 'adminenigma123',
    },

    // Moderation Settings (legacy block moved into moderation above)
    // ...existing moderation keys are defined earlier
    blockedPatterns: {
            profanity: [
                /ควย/i,
                /สัส/i,
                /เหี้ย/i,
                /ไอ้สัด/i,
                /ไอ้เวร/i,
                /เย็ด/i,
                /หี/i,
                /เชี่ย/i,
                /เลว/i,
                /ระยำ/i,
                /fuck/i,
                /shit/i,
                /bitch/i,
                /asshole/i,
                /damn/i,
            ],
            gambling: [
                /casino/i,
                /bet365/i,
                /พนัน/i,
                /แทงบอล/i,
                /บาคาร่า/i,
                /สล็อต/i,
                /เดิมพัน/i,
                /หวย.*ออนไลน์/i,
            ],
            illegal: [
                /ยาเสพติด/i,
                /กัญชา.*ขาย/i,
                /drug.*sell/i,
            ],
            scam: [
                /ได้เงินฟรี/i,
                /รับเงิน.*ง่าย/i,
                /free.*money/i,
                /giveaway.*crypto/i,
            ],
            },

        blockedDomains: [
            'bet365.com',
            'casino.com',
            'pornhub.com',
            'xvideos.com',
        ],

    colors: {
        primary: 0x5865F2,
        success: 0x57F287,
        warning: 0xFEE75C,
        error: 0xED4245,
        music: 0x1DB954,
    },
};
