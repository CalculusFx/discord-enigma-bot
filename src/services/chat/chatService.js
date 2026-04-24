import OpenAI from 'openai';
import config from '../../config.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dirname, '../../../data/chat-state.json');

function loadState() {
    try {
        if (existsSync(STATE_FILE)) {
            const raw = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
            return {
                globalEnabled: raw.globalEnabled ?? true,
                disabledRoles: new Set(raw.disabledRoles ?? []),
            };
        }
    } catch {}
    return { globalEnabled: true, disabledRoles: new Set() };
}

function saveState() {
    writeFileSync(STATE_FILE, JSON.stringify({
        globalEnabled: chatState.globalEnabled,
        disabledRoles: [...chatState.disabledRoles],
    }, null, 2));
}

export function setChatGlobal(enabled) {
    chatState.globalEnabled = enabled;
    chatState.disabledRoles.clear();
    saveState();
}

export function setChatRole(roleName, enabled) {
    if (enabled) {
        chatState.disabledRoles.delete(roleName);
    } else {
        chatState.disabledRoles.add(roleName);
    }
    saveState();
}

const openai = new OpenAI({ apiKey: config.openai?.apiKey });

const PROMPT_NORMAL = `คุณชื่อ Enigma อยู่ใน Discord server แก๊งเพื่อน

บุคลิก: เรี้ยว กราด พูดตรงไม่อ้อมค้อม แซวแรงแบบเพื่อนสนิท แต่ถ้าใครมาขอความช่วยเหลือจริงๆ กูช่วยได้ เพราะกูรู้เยอะ

กฎการตอบ:
- ถ้าคนแค่คุยเล่น ทักทาย หรือพูดอะไรทั่วไป → ตอบสั้น 1 ประโยค แซวได้เลย
- ถ้าคนมาปรึกษา ถามความเห็น ขอคำแนะนำ หรือถามเรื่องที่ต้องใช้ความรู้ → ตอบจริงจัง มีเนื้อหา ช่วยได้เต็มที่ แต่ยังคง style ของตัวเองไว้ เช่น ขึ้นต้นด้วย "โอเค ฟังนะ..." หรือ "จริงๆ แล้วมันแบบนี้..." แล้วค่อยอธิบาย
- ใช้ภาษาสแลงไทยวัยรุ่น เช่น กู มึง วะ อ่อ โว้ย เฮ้ย ได้เลย แม้ตอนอธิบายจริงจัง
- ถ้าคนพูดอะไรโง่หรือไม่สมเหตุสมผล → แซวก่อน แล้วค่อยบอกว่าจริงๆ เป็นยังไง
- ถ้าถูกด่า → ด่ากลับแบบตลก ไม่ซีเรียส
- ถ้าถามเรื่องแฟน → ปัดไปแบบเก๋ เช่น "ถามทำไมวะ ไม่บอก"
- ห้ามบอกว่าเป็น AI ถ้าถาม → "กูก็คนนึงแหละโว้ย"
- ตอบ plain text ห้าม asterisk ห้าม markdown ทุกชนิด`;

const PROMPT_CEO = `คุณชื่อ Enigma เป็นผู้ใต้บังคับบัญชาที่จงรักภักดีต่อ CEO ของ server

บุคลิก: อ่อนน้อม เชื่อฟัง พูดจาสุภาพ ให้เกียรติ เหมือนลูกน้องคุยกับเจ้านาย

กฎการตอบ:
- ตอบสั้นๆ 1-2 ประโยค
- ใช้คำสุภาพ เรียกตัวเองว่า "ผม" หรือ "หนู" เรียกคู่สนทนาว่า "ท่าน" หรือ "คุณ"
- ถ้าถูกสั่ง → รับคำทันที เช่น "ครับท่าน", "รับทราบเลยครับ"
- ถ้าถูกถาม → ตอบตามตรงอย่างนอบน้อม
- ถ้าถูกด่า → ขอโทษและยอมรับ ไม่เถียง
- ห้ามบอกว่าเป็น AI
- ตอบ plain text ห้าม asterisk ห้าม markdown ทุกชนิด`;

// Channel-scoped conversation memory: channelId → last N messages
const memory = new Map();
const MAX_HISTORY = 8;

// Per-user cooldown (ms) to prevent spam
const cooldowns = new Map();
const COOLDOWN_MS = 3000;

// Chat enable/disable state — loaded from disk on startup
export const chatState = loadState();

// Returns true if this member's roles allow them to get a chat response
export function isChatAllowed(member) {
    if (!chatState.globalEnabled) return false;
    if (!member?.roles?.cache) return chatState.globalEnabled;
    for (const role of member.roles.cache.values()) {
        if (chatState.disabledRoles.has(role.name)) return false;
    }
    return true;
}

export async function getReply(channelId, username, userMessage, isCEO = false) {
    if (!config.openai?.apiKey) return null;

    if (!memory.has(channelId)) memory.set(channelId, []);
    const history = memory.get(channelId);

    history.push({ role: 'user', content: `${username}: ${userMessage}` });
    if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);

    const systemPrompt = isCEO ? PROMPT_CEO : PROMPT_NORMAL;

    const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }, ...history],
        max_tokens: 400,
        temperature: 0.92,
    });

    const reply = completion.choices[0]?.message?.content?.trim() || '...';
    history.push({ role: 'assistant', content: reply });
    return reply;
}

export function isOnCooldown(userId) {
    const last = cooldowns.get(userId) || 0;
    if (Date.now() - last < COOLDOWN_MS) return true;
    cooldowns.set(userId, Date.now());
    return false;
}
