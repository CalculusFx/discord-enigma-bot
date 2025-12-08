import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { useQueue } from 'discord-player';
import config from '../../config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('แสดงเพลงที่กำลังเล่นอยู่'),

    async execute(interaction) {
        const queue = useQueue(interaction.guild.id);

        if (!queue || !queue.currentTrack) {
            return interaction.reply({
                content: '❌ ไม่มีเพลงกำลังเล่นอยู่',
                ephemeral: true,
            });
        }

        const track = queue.currentTrack;
        const progress = queue.node.createProgressBar({
            indicator: '🔘',
            leftChar: '▬',
            rightChar: '▬',
            length: 15,
        });

        const embed = new EmbedBuilder()
            .setColor(config.colors.music)
            .setTitle('🎵 กำลังเล่น')
            .setDescription(`**[${track.title}](${track.url})**`)
            .setThumbnail(track.thumbnail)
            .addFields(
                { name: '👤 ศิลปิน', value: track.author, inline: true },
                { name: '⏱️ ระยะเวลา', value: track.duration, inline: true },
                { name: '🔊 ระดับเสียง', value: `${queue.node.volume}%`, inline: true },
                { name: '📊 Progress', value: progress },
            )
            .setFooter({ text: `ขอโดย ${track.requestedBy?.tag || 'Unknown'}` });

        return interaction.reply({ embeds: [embed] });
    },
};
