import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { useQueue } from 'discord-player';
import config from '../../config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('แสดงคิวเพลงปัจจุบัน')
        .addIntegerOption(option =>
            option.setName('page')
                .setDescription('หน้าที่ต้องการดู')
                .setMinValue(1)
        ),

    async execute(interaction) {
        const queue = useQueue(interaction.guild.id);

        if (!queue || !queue || !queue.currentTrack) {
            return interaction.reply({
                content: '❌ ไม่มีเพลงในคิว',
                ephemeral: true,
            });
        }

        const currentTrack = queue.currentTrack;
        const tracks = queue.tracks.data;
        const totalPages = Math.ceil(tracks.length / 10) || 1;
        const page = Math.min(interaction.options.getInteger('page') || 1, totalPages);

        const start = (page - 1) * 10;
        const end = start + 10;
        const pageTracks = tracks.slice(start, end);

        let queueList = '';
        if (pageTracks.length > 0) {
            queueList = pageTracks
                .map((track, i) => `**${start + i + 1}.** [${track.title}](${track.url}) - \`${track.duration}\``)
                .join('\n');
        } else {
            queueList = 'ไม่มีเพลงในคิว';
        }

        const embed = new EmbedBuilder()
            .setColor(config.colors.music)
            .setTitle('🎵 คิวเพลง')
            .setDescription(`**กำลังเล่น:**\n[${currentTrack.title}](${currentTrack.url}) - \`${currentTrack.duration}\`\n\n**คิวต่อไป:**\n${queueList}`)
            .setThumbnail(currentTrack.thumbnail)
            .setFooter({ text: `หน้า ${page}/${totalPages} | ${tracks.length} เพลงในคิว` });

        return interaction.reply({ embeds: [embed] });
    },
};
