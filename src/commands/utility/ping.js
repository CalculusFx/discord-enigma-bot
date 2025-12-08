import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import config from '../../config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('ตรวจสอบการตอบสนองของบอท'),

    async execute(interaction, client) {
        const sent = await interaction.deferReply({ fetchReply: true });
        
        const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;
        const wsHeartbeat = client.ws.ping;

        const embed = new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle('🏓 Pong!')
            .addFields(
                { name: '⏱️ Roundtrip', value: `${roundtrip}ms`, inline: true },
                { name: '💓 WebSocket', value: `${wsHeartbeat}ms`, inline: true },
            )
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    },
};
