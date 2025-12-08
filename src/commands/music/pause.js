import { SlashCommandBuilder } from 'discord.js';
import { useQueue } from 'discord-player';

export default {
    data: new SlashCommandBuilder()
        .setName('pause')
        .setDescription('หยุดเพลงชั่วคราว'),

    async execute(interaction) {
        const queue = useQueue(interaction.guild.id);

        if (!queue || !queue || !queue.currentTrack) {
            return interaction.reply({
                content: '❌ ไม่มีเพลงกำลังเล่นอยู่',
                ephemeral: true,
            });
        }

        if (queue.node.isPaused()) {
            return interaction.reply({
                content: '❌ เพลงถูกหยุดชั่วคราวอยู่แล้ว',
                ephemeral: true,
            });
        }

        queue.node.pause();

        return interaction.reply({
            content: '⏸️ หยุดเพลงชั่วคราวแล้ว',
        });
    },
};
