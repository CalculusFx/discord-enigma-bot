import { Events } from 'discord.js';
import config from '../config.js';

// cooldown 4 วิ per user+action เพื่อกัน Discord fire event ซ้ำ (reconnect, mobile sync)
const ANNOUNCE_COOLDOWN_MS = 4000;
const recentAnnounces = new Map(); // `${userId}:${action}` → timestamp

function canAnnounce(userId, action) {
    const key = `${userId}:${action}`;
    const now = Date.now();
    const last = recentAnnounces.get(key);
    if (last && now - last < ANNOUNCE_COOLDOWN_MS) return false;
    recentAnnounces.set(key, now);
    // ล้าง entries เก่าเพื่อไม่ให้ Map โต
    if (recentAnnounces.size > 500) {
        for (const [k, t] of recentAnnounces) {
            if (now - t > 60000) recentAnnounces.delete(k);
        }
    }
    return true;
}

export default {
    name: Events.VoiceStateUpdate,
    async execute(oldState, newState, client) {
        if (!config.tts.enabled) return;

        const member = newState.member || oldState.member;
        if (!member || member.user.bot) return;

        const userId = member.user.id;
        const displayName = member.displayName || member.user.username;

        // User joined a voice channel
        if (!oldState.channelId && newState.channelId) {
            if (!canAnnounce(userId, 'join')) return;
            const channel = newState.channel;
            console.log('[VOICE] join event for', userId, 'displayName=', displayName, 'channel=', channel?.id);
            await client.ttsService.announceJoin(channel, displayName);
        }

        // User left a voice channel
        else if (oldState.channelId && !newState.channelId) {
            if (!canAnnounce(userId, 'leave')) return;
            const channel = oldState.channel;
            console.log('[VOICE] leave event for', userId, 'displayName=', displayName, 'channel=', channel?.id);
            await client.ttsService.announceLeave(channel, displayName);
        }

        // User moved between channels
        else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
            if (!canAnnounce(userId, 'move')) return;
            const oldChannel = oldState.channel;
            const newChannel = newState.channel;
            console.log('[VOICE] move event for', userId, 'displayName=', displayName, 'from=', oldChannel?.id, 'to=', newChannel?.id);
            await client.ttsService.announceLeave(oldChannel, displayName);
            await client.ttsService.announceJoin(newChannel, displayName);
        }
    },
};
