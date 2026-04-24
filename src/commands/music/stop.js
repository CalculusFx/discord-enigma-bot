import { MessageFlags } from 'discord.js';
import { SlashCommandBuilder } from 'discord.js';
import { useQueue } from 'discord-player';

export default {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('หยุดเล่นเพลงและล้างคิว'),

    async execute(interaction) {
        const queue = useQueue(interaction.guild.id);

        if (!queue) {
            return interaction.reply({
                content: '❌ ไม่มีเพลงกำลังเล่นอยู่',
                flags: MessageFlags.Ephemeral,
            });
        }

        queue.delete();

        return interaction.reply({
            content: '⏹️ หยุดเล่นเพลงและล้างคิวแล้ว',
        });
    },
};
