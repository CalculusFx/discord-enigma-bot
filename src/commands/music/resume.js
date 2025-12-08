import { SlashCommandBuilder } from 'discord.js';
import { useQueue } from 'discord-player';

export default {
    data: new SlashCommandBuilder()
        .setName('resume')
        .setDescription('เล่นเพลงต่อ'),

    async execute(interaction) {
        const queue = useQueue(interaction.guild.id);

        if (!queue) {
            return interaction.reply({
                content: '❌ ไม่มีเพลงในคิว',
                ephemeral: true,
            });
        }

        if (!queue.node.isPaused()) {
            return interaction.reply({
                content: '❌ เพลงกำลังเล่นอยู่แล้ว',
                ephemeral: true,
            });
        }

        queue.node.resume();

        return interaction.reply({
            content: '▶️ เล่นเพลงต่อแล้ว',
        });
    },
};
