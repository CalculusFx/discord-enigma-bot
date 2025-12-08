import { SlashCommandBuilder } from 'discord.js';
import { useQueue } from 'discord-player';

export default {
    data: new SlashCommandBuilder()
        .setName('shuffle')
        .setDescription('สลับลำดับเพลงในคิว'),

    async execute(interaction) {
        const queue = useQueue(interaction.guild.id);

        if (!queue || !queue || !queue.currentTrack) {
            return interaction.reply({
                content: '❌ ไม่มีเพลงกำลังเล่นอยู่',
                ephemeral: true,
            });
        }

        if (queue.tracks.data.length < 2) {
            return interaction.reply({
                content: '❌ ต้องมีเพลงในคิวอย่างน้อย 2 เพลงเพื่อสลับ',
                ephemeral: true,
            });
        }

        queue.tracks.shuffle();

        return interaction.reply({
            content: '🔀 สลับลำดับเพลงในคิวแล้ว!',
        });
    },
};
