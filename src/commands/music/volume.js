import { MessageFlags } from 'discord.js';
import { SlashCommandBuilder } from 'discord.js';
import { useQueue } from 'discord-player';

export default {
    data: new SlashCommandBuilder()
        .setName('volume')
        .setDescription('ปรับระดับเสียง')
        .addIntegerOption(option =>
            option.setName('level')
                .setDescription('ระดับเสียง (0-100)')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(100)
        ),

    async execute(interaction) {
        const queue = useQueue(interaction.guild.id);

        if (!queue || !queue || !queue.currentTrack) {
            return interaction.reply({
                content: '❌ ไม่มีเพลงกำลังเล่นอยู่',
                flags: MessageFlags.Ephemeral,
            });
        }

        const volume = interaction.options.getInteger('level');
        queue.node.setVolume(volume);

        return interaction.reply({
            content: `🔊 ปรับระดับเสียงเป็น **${volume}%**`,
        });
    },
};
