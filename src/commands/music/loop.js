import { SlashCommandBuilder } from 'discord.js';
import { useQueue, QueueRepeatMode } from 'discord-player';

export default {
    data: new SlashCommandBuilder()
        .setName('loop')
        .setDescription('เปิด/ปิดการเล่นซ้ำ')
        .addStringOption(option =>
            option.setName('mode')
                .setDescription('โหมดการเล่นซ้ำ')
                .setRequired(true)
                .addChoices(
                    { name: '🔂 เล่นซ้ำเพลงนี้', value: 'track' },
                    { name: '🔁 เล่นซ้ำทั้งคิว', value: 'queue' },
                    { name: '🔀 สุ่มเพลง', value: 'autoplay' },
                    { name: '❌ ปิดการเล่นซ้ำ', value: 'off' },
                )
        ),

    async execute(interaction) {
        const queue = useQueue(interaction.guild.id);

        if (!queue || !queue || !queue.currentTrack) {
            return interaction.reply({
                content: '❌ ไม่มีเพลงกำลังเล่นอยู่',
                ephemeral: true,
            });
        }

        const mode = interaction.options.getString('mode');
        let message = '';

        switch (mode) {
            case 'track':
                queue.setRepeatMode(QueueRepeatMode.TRACK);
                message = '🔂 เปิดการเล่นซ้ำเพลงนี้';
                break;
            case 'queue':
                queue.setRepeatMode(QueueRepeatMode.QUEUE);
                message = '🔁 เปิดการเล่นซ้ำทั้งคิว';
                break;
            case 'autoplay':
                queue.setRepeatMode(QueueRepeatMode.AUTOPLAY);
                message = '🔀 เปิดโหมดสุ่มเพลง';
                break;
            case 'off':
                queue.setRepeatMode(QueueRepeatMode.OFF);
                message = '❌ ปิดการเล่นซ้ำ';
                break;
        }

        return interaction.reply({ content: message });
    },
};
