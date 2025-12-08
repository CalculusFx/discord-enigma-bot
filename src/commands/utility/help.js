import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import config from '../../config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('แสดงคำสั่งทั้งหมดของบอท'),

    async execute(interaction, client) {
        const embed = new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle('📖 คำสั่งทั้งหมด')
            .setDescription('รายการคำสั่งที่สามารถใช้งานได้')
            .addFields(
                {
                    name: '🎵 เพลง',
                    value: [
                        '`/play` - เล่นเพลงจาก YouTube, Spotify, SoundCloud',
                        '`/queue` - แสดงคิวเพลง',
                        '`/skip` - ข้ามเพลง',
                        '`/stop` - หยุดเล่นเพลง',
                        '`/pause` - หยุดชั่วคราว',
                        '`/resume` - เล่นต่อ',
                        '`/volume` - ปรับระดับเสียง',
                        '`/nowplaying` - แสดงเพลงที่กำลังเล่น',
                        '`/loop` - เปิด/ปิดการเล่นซ้ำ',
                        '`/shuffle` - สลับลำดับเพลง',
                    ].join('\n'),
                },
                {
                    name: '🛡️ การจัดการ (Admin)',
                    value: [
                        '`/moderation status` - ดูสถานะระบบกรอง',
                        '`/moderation block-domain` - บล็อกโดเมน',
                        '`/moderation list-domains` - ดูโดเมนที่บล็อก',
                        '`/settings` - ตั้งค่าบอท',
                    ].join('\n'),
                },
                {
                    name: '⚙️ อื่นๆ',
                    value: [
                        '`/help` - แสดงคำสั่งทั้งหมด',
                        '`/ping` - ตรวจสอบการตอบสนอง',
                    ].join('\n'),
                },
            )
            .setFooter({ text: 'Bot created with ❤️' })
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    },
};
