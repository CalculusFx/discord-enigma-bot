import { SlashCommandBuilder } from 'discord.js';
import { useQueue } from 'discord-player';

export default {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('ข้ามเพลงปัจจุบัน'),

    async execute(interaction) {
        const queue = useQueue(interaction.guild.id);

        if (!queue || !queue || !queue.currentTrack) {
            return interaction.reply({
                content: '❌ ไม่มีเพลงกำลังเล่นอยู่',
                ephemeral: true,
            });
        }

        const currentTrack = queue.currentTrack;
        queue.node.skip();

        return interaction.reply({
            content: `⏭️ ข้ามเพลง **${currentTrack.title}** แล้ว`,
        });
    },
};
