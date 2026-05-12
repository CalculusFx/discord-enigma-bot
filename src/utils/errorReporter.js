import { EmbedBuilder } from 'discord.js';

const LOG_CHANNEL_NAME = 'ห้องประชุมซากุระ🌸';
const FLOOD_COOLDOWN_MS = 15000; // ส่งซ้ำได้ทุก 15 วิ per source

let _client = null;
const _lastSent = new Map(); // source -> timestamp

export function setReporterClient(client) {
    _client = client;
}

async function findLogChannel() {
    if (!_client) return null;
    for (const guild of _client.guilds.cache.values()) {
        const channels = guild.channels.cache;
        const ch = channels.find(c => c.name === LOG_CHANNEL_NAME && c.isTextBased?.());
        if (ch) return ch;
    }
    return null;
}

/**
 * ส่ง error/warning ไปห้องประชุมซากุระ🌸
 * @param {'error'|'warn'|'info'} level
 * @param {string} source  - ชื่อแหล่งที่มา เช่น 'PlayerError', 'Command:play'
 * @param {Error|string} errorOrMsg
 * @param {Object} [extra] - fields เพิ่มเติม { key: value }
 */
export async function report(level, source, errorOrMsg, extra = {}) {
    const now = Date.now();
    const floodKey = `${level}:${source}`;
    if (_lastSent.has(floodKey) && now - _lastSent.get(floodKey) < FLOOD_COOLDOWN_MS) return;
    _lastSent.set(floodKey, now);

    const isError = errorOrMsg instanceof Error;
    const message = isError ? errorOrMsg.message : String(errorOrMsg);
    const stack = isError && errorOrMsg.stack
        ? errorOrMsg.stack.split('\n').slice(0, 6).join('\n')
        : null;

    const color = level === 'error' ? 0xED4245 : level === 'warn' ? 0xFEE75C : 0x5865F2;
    const icon = level === 'error' ? '🚨' : level === 'warn' ? '⚠️' : 'ℹ️';
    const label = level === 'error' ? 'ERROR' : level === 'warn' ? 'WARNING' : 'INFO';

    const thaiTime = new Date().toLocaleString('th-TH', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`${icon} [${label}] ${source}`)
        .setDescription(`\`\`\`${message.slice(0, 1800)}\`\`\``)
        .addFields({ name: '🕐 เวลา', value: thaiTime, inline: true })
        .setTimestamp();

    if (stack) {
        embed.addFields({ name: '📄 Stack', value: `\`\`\`\n${stack.slice(0, 900)}\n\`\`\`` });
    }

    for (const [k, v] of Object.entries(extra)) {
        if (v != null) embed.addFields({ name: k, value: String(v).slice(0, 500), inline: true });
    }

    try {
        const ch = await findLogChannel();
        if (ch) await ch.send({ embeds: [embed] });
    } catch {
        // ถ้าส่งไม่ได้ให้ log console แทน ห้ามให้ reporter crash process
    }
}
