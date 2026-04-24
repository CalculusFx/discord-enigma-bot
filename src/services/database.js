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
    adminLogs: [],
        blockedDomains: [],
    globalSettings: {},
    guildSettings: {},
    moderationWhitelist: []
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

export function getLearnedPatterns(type = null, minConfidence = 0.4) {
    // Return learned patterns filtered by a configurable confidence threshold.
    // Callers may pass minConfidence=0 to retrieve all stored patterns.
    const minConf = Number(minConfidence) || 0;
    if (type) {
        return db.learnedPatterns.filter(p => p.type === type && Number(p.confidence || 0) >= minConf);
    }
    return db.learnedPatterns.filter(p => Number(p.confidence || 0) >= minConf);
}

export function listLearnedPatterns(limit = 100) {
    return db.learnedPatterns.slice(-limit).reverse();
}

export function getLearnedPatternById(id) {
    return db.learnedPatterns.find(p => p.id === Number(id)) || null;
}

export function removeLearnedPattern(id) {
    const idx = db.learnedPatterns.findIndex(p => p.id === Number(id));
    if (idx === -1) return false;
    db.learnedPatterns.splice(idx, 1);
    saveDatabase(db);
    return true;
}

export function updateLearnedPatternConfidence(id, confidence) {
    const existing = db.learnedPatterns.find(p => p.id === Number(id));
    if (!existing) return null;
    existing.confidence = Math.max(0, Math.min(1, Number(confidence)));
    existing.updatedAt = new Date().toISOString();
    saveDatabase(db);
    return existing;
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

export function addAdminLog(entry) {
    const now = new Date();
    db.adminLogs.push({
        id: db.adminLogs.length + 1,
        action: entry.action,
        performedBy: entry.performedBy || null,
        details: entry.details || null,
        timestamp: now.toISOString(),
        date: now.toLocaleDateString('th-TH'),
        time: now.toLocaleTimeString('th-TH')
    });
    // keep latest 500
    if (db.adminLogs.length > 500) db.adminLogs = db.adminLogs.slice(-500);
    saveDatabase(db);
}

export function getAdminLogs(limit = 50) {
    return db.adminLogs.slice(-limit).reverse();
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

export function getGlobalSettings() {
    return db.globalSettings || {};
}

export function setGlobalSetting(key, value) {
    db.globalSettings = db.globalSettings || {};
    db.globalSettings[key] = value;
    saveDatabase(db);
}

export function getModerationProvider() {
    return db.globalSettings?.moderationProvider || null;
}

export function setModerationProvider(provider) {
    setGlobalSetting('moderationProvider', provider);
}

export function getGuildSettings(guildId) {
    return db.guildSettings[guildId];
}

export function updateGuildSettings(guildId, settings) {
    db.guildSettings[guildId] = {
        ...db.guildSettings[guildId],
    tts_enabled: settings.ttsEnabled ? 1 : 0,
    moderation_enabled: settings.moderationEnabled ? 1 : 0,
    // per-guild toggle to enable/disable repetition enforcement
    moderation_repetition: (typeof settings.repetitionEnabled !== 'undefined') ? (settings.repetitionEnabled ? 1 : 0) : db.guildSettings[guildId]?.moderation_repetition,
    log_channel_id: settings.logChannelId,
    tts_language: settings.ttsLanguage,
        updated_at: new Date().toISOString()
    };
    saveDatabase(db);
}

export function getGuildModerationProvider(guildId) {
    return db.guildSettings[guildId]?.moderationProvider || null;
}

export function setGuildModerationProvider(guildId, provider) {
    db.guildSettings[guildId] = db.guildSettings[guildId] || {};
    db.guildSettings[guildId].moderationProvider = provider;
    saveDatabase(db);
}

// Per-guild TTS helpers
export function getGuildTTSSettings(guildId) {
    if (!guildId) return null;
    db.guildSettings[guildId] = db.guildSettings[guildId] || {};
    // default structure
    const s = db.guildSettings[guildId];
    return {
        enabled: s.tts_enabled === 1 || s.tts_enabled === true || false,
        language: s.tts_language || null,
        disabledChannels: s.tts_disabled_channels || [] // array of channel ids
    };
}

export function setGuildTTSSettings(guildId, settings) {
    if (!guildId) return null;
    db.guildSettings[guildId] = db.guildSettings[guildId] || {};
    if (typeof settings.enabled !== 'undefined') db.guildSettings[guildId].tts_enabled = settings.enabled ? 1 : 0;
    if (typeof settings.language !== 'undefined') db.guildSettings[guildId].tts_language = settings.language;
    if (Array.isArray(settings.disabledChannels)) db.guildSettings[guildId].tts_disabled_channels = settings.disabledChannels;
    db.guildSettings[guildId].updated_at = new Date().toISOString();
    saveDatabase(db);
    return getGuildTTSSettings(guildId);
}

export function isTtsEnabledForChannel(guildId, channelId) {
    const s = getGuildTTSSettings(guildId) || {};
    if (s.enabled === false) return false;
    const disabled = Array.isArray(s.disabledChannels) ? s.disabledChannels : s.tts_disabled_channels || [];
    if (disabled && disabled.includes(String(channelId))) return false;
    return true;
}

// Moderation whitelist helpers
export function getModerationWhitelist() {
    return db.moderationWhitelist || [];
}

export function addModerationWhitelistItem(item) {
    if (!db.moderationWhitelist) db.moderationWhitelist = [];
    const existing = db.moderationWhitelist.find(i => i.item === item);
    if (existing) return existing;
    const entry = { id: (db.moderationWhitelist.length || 0) + 1, item, createdAt: new Date().toISOString() };
    db.moderationWhitelist.push(entry);
    saveDatabase(db);
    return entry;
}

export function removeModerationWhitelistItem(id) {
    const idx = db.moderationWhitelist.findIndex(p => p.id === Number(id));
    if (idx === -1) return false;
    db.moderationWhitelist.splice(idx, 1);
    saveDatabase(db);
    return true;
}

// Per-guild moderation whitelist helpers (stored under guildSettings[guildId].moderationWhitelist)
export function getGuildModerationWhitelist(guildId) {
    if (!guildId) return [];
    return db.guildSettings[guildId]?.moderationWhitelist || [];
}

export function addGuildModerationWhitelistItem(guildId, item) {
    if (!guildId) return null;
    db.guildSettings[guildId] = db.guildSettings[guildId] || {};
    if (!db.guildSettings[guildId].moderationWhitelist) db.guildSettings[guildId].moderationWhitelist = [];
    const existing = db.guildSettings[guildId].moderationWhitelist.find(i => i.item === item);
    if (existing) return existing;
    const entry = { id: (db.guildSettings[guildId].moderationWhitelist.length || 0) + 1, item, createdAt: new Date().toISOString() };
    db.guildSettings[guildId].moderationWhitelist.push(entry);
    saveDatabase(db);
    return entry;
}

export function removeGuildModerationWhitelistItem(guildId, id) {
    if (!guildId) return false;
    const arr = db.guildSettings[guildId]?.moderationWhitelist || [];
    const idx = arr.findIndex(p => p.id === Number(id));
    if (idx === -1) return false;
    arr.splice(idx, 1);
    db.guildSettings[guildId].moderationWhitelist = arr;
    saveDatabase(db);
    return true;
}

export default db;
