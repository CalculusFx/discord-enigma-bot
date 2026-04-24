import { MessageFlags } from 'discord.js';
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
                flags: MessageFlags.Ephemeral,
            });
        }

        if (queue.node.isPaused()) {
            return interaction.reply({
                content: '❌ เพลงถูกหยุดชั่วคราวอยู่แล้ว',
                flags: MessageFlags.Ephemeral,
            });
        }

        queue.node.pause();

        return interaction.reply({
            content: '⏸️ หยุดเพลงชั่วคราวแล้ว',
        });
    },
};
