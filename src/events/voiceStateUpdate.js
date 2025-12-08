import { Events } from 'discord.js';
import config from '../config.js';

export default {
    name: Events.VoiceStateUpdate,
    async execute(oldState, newState, client) {
        // Skip if TTS is disabled
        if (!config.tts.enabled) return;

        const member = newState.member || oldState.member;
        if (!member || member.user.bot) return;

        const displayName = member.displayName || member.user.username;

        // User joined a voice channel
        if (!oldState.channelId && newState.channelId) {
            const channel = newState.channel;
            await client.ttsService.announceJoin(channel, displayName);
        }
        
        // User left a voice channel
        else if (oldState.channelId && !newState.channelId) {
            const channel = oldState.channel;
            await client.ttsService.announceLeave(channel, displayName);
        }
        
        // User moved between channels
        else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
            const oldChannel = oldState.channel;
            const newChannel = newState.channel;
            
            await client.ttsService.announceLeave(oldChannel, displayName);
            await client.ttsService.announceJoin(newChannel, displayName);
        }
    },
};
