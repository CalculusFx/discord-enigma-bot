import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import config from '../../config.js';
import { default as db } from '../../services/database.js';

export default {
    data: new SlashCommandBuilder()
        .setName('tts-status')
        .setDescription('แสดงสถานะ TTS (provider, cache, rate-limit)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, client) {
        await interaction.deferReply({ flags: 64 });

        try {
            const ttsService = client.services?.tts;
            const stats = ttsService?.stats || { cacheHits: 0, cacheMisses: 0, lastOpenAIResponse: null };
            const provider = config.tts.provider === 'auto' ? (config.openai.apiKey ? 'openai (auto)' : 'google (auto)') : config.tts.provider;
            const rate = config.tts.rateLimit || {};

            const embed = new EmbedBuilder()
                .setTitle('TTS Status')
                .addFields(
                    { name: 'Provider', value: String(provider), inline: true },
                    { name: 'Cache Enabled', value: String(config.tts.cache?.enabled ?? false), inline: true },
                    { name: 'Cache Hits', value: String(stats.cacheHits || 0), inline: true },
                    { name: 'Cache Misses', value: String(stats.cacheMisses || 0), inline: true },
                    { name: 'Rate Limit Enabled', value: String(rate.enabled ?? false), inline: true },
                    { name: 'Per Minute', value: String(rate.perMinute ?? 0), inline: true },
                )
                .setTimestamp();

            if (stats.lastOpenAIResponse && config.tts.debug) {
                embed.addFields({ name: 'Last OpenAI Response', value: `status=${stats.lastOpenAIResponse.status} body=${String(stats.lastOpenAIResponse.body).slice(0, 1024)}` });
            }

            return interaction.editReply({ embeds: [embed] });
        } catch (err) {
            console.error('tts-status error', err);
            return interaction.editReply({ content: `เกิดข้อผิดพลาด: ${err.message || err}` });
        }
    }
};
