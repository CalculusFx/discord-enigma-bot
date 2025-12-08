import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dataDir = join(__dirname, '../../data');
if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
}

const dbPath = join(dataDir, 'database.json');

// Initialize database structure
function loadDatabase() {
    if (existsSync(dbPath)) {
        try {
            return JSON.parse(readFileSync(dbPath, 'utf8'));
        } catch {
            return createDefaultDatabase();
        }
    }
    return createDefaultDatabase();
}

function createDefaultDatabase() {
    return {
        learnedPatterns: [],
        moderationLogs: [],
        blockedDomains: [],
        guildSettings: {}
    };
}

function saveDatabase(db) {
    writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

let db = loadDatabase();

export function initDatabase() {
    db = loadDatabase();
    saveDatabase(db);
    console.log('✅ Database initialized');
}

export function getLearnedPatterns(type = null) {
    if (type) {
        return db.learnedPatterns.filter(p => p.type === type && p.confidence >= 0.7);
    }
    return db.learnedPatterns.filter(p => p.confidence >= 0.7);
}

export function addLearnedPattern(pattern, type, confidence = 0.5) {
    const existing = db.learnedPatterns.find(p => p.pattern === pattern && p.type === type);
    
    if (existing) {
        existing.confidence = Math.min(existing.confidence + 0.1, 1.0);
        existing.updatedAt = new Date().toISOString();
    } else {
        db.learnedPatterns.push({
            id: db.learnedPatterns.length + 1,
            pattern,
            type,
            confidence,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
    }
    
    saveDatabase(db);
}

export function logModeration(data) {
    const now = new Date();
    db.moderationLogs.push({
        id: db.moderationLogs.length + 1,
        userId: data.userId,
        userTag: data.userTag,
        username: data.username,
        guildId: data.guildId,
        guildName: data.guildName,
        channelId: data.channelId,
        channelName: data.channelName,
        content: data.content,
        violationType: data.violationType,
        reason: data.reason,
        actionTaken: data.actionTaken,
        timestamp: now.toISOString(),
        date: now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }),
        time: now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    });
    
    // Keep only last 1000 logs to prevent database from growing too large
    if (db.moderationLogs.length > 1000) {
        db.moderationLogs = db.moderationLogs.slice(-1000);
    }
    
    saveDatabase(db);
}

export function getModerationLogs(limit = 50) {
    return db.moderationLogs.slice(-limit).reverse();
}

export function getModerationLogsByUser(userId, limit = 20) {
    return db.moderationLogs
        .filter(log => log.userId === userId)
        .slice(-limit)
        .reverse();
}

export function addBlockedDomain(domain, category, addedBy = null) {
    const existing = db.blockedDomains.find(d => d.domain === domain);
    if (!existing) {
        db.blockedDomains.push({
            id: db.blockedDomains.length + 1,
            domain,
            category,
            addedBy,
            createdAt: new Date().toISOString()
        });
        saveDatabase(db);
    }
}

export function getBlockedDomains() {
    return db.blockedDomains;
}

export function getGuildSettings(guildId) {
    return db.guildSettings[guildId];
}

export function updateGuildSettings(guildId, settings) {
    db.guildSettings[guildId] = {
        ...db.guildSettings[guildId],
        tts_enabled: settings.ttsEnabled ? 1 : 0,
        moderation_enabled: settings.moderationEnabled ? 1 : 0,
        log_channel_id: settings.logChannelId,
        tts_language: settings.ttsLanguage,
        updated_at: new Date().toISOString()
    };
    saveDatabase(db);
}

export default db;
