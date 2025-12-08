import 'dotenv/config';

export default {
    // Discord Configuration
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.CLIENT_ID,
    guildId: process.env.GUILD_ID,

    // Bot Settings
    prefix: process.env.BOT_PREFIX || '!',
    defaultVolume: parseInt(process.env.DEFAULT_VOLUME) || 50,
    maxQueueSize: parseInt(process.env.MAX_QUEUE_SIZE) || 100,

    // TTS Settings
    tts: {
        enabled: process.env.TTS_ENABLED === 'true',
        language: process.env.TTS_LANGUAGE || 'th',
    },

    // Music Settings
    music: {
        leaveOnEmpty: true,
        leaveOnEmptyCooldown: 300000, // 5 minutes (300000ms)
        leaveOnEnd: true,
        leaveOnEndCooldown: 300000, // 5 minutes
    },

    // Spotify Configuration
    spotify: {
        clientId: process.env.SPOTIFY_CLIENT_ID,
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    },

    // OpenAI Configuration
    openai: {
        apiKey: process.env.OPENAI_API_KEY,
    },

    // Admin Settings
    admin: {
        password: process.env.ADMIN_PASSWORD || 'admin123',
    },

    // Moderation Settings
    moderation: {
        enabled: process.env.MODERATION_ENABLED === 'true',
        autoDelete: process.env.AUTO_DELETE_VIOLATIONS === 'true',
        logChannelId: process.env.LOG_CHANNEL_ID,
        
        // Blocked content patterns
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
        
        // Blocked domains
        blockedDomains: [
            'bet365.com',
            'casino.com',
            'pornhub.com',
            'xvideos.com',
        ],
    },

    // Colors for embeds
    colors: {
        primary: 0x5865F2,
        success: 0x57F287,
        warning: 0xFEE75C,
        error: 0xED4245,
        music: 0x1DB954,
    },
};
