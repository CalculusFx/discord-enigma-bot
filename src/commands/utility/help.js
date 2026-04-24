import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import config from '../../config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('แสดงคำสั่งและฟีเจอร์ทั้งหมดของบอท'),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle('📘 Enigma Bot — คู่มือการใช้งาน')
            .setDescription('รายการคำสั่งและฟีเจอร์ทั้งหมด')
            .addFields(
                {
                    name: '🎵 เพลง',
                    value: [
                        '`/play` — เล่นเพลงจาก YouTube / URL',
                        '`/queue` — ดูคิวเพลงทั้งหมด',
                        '`/nowplaying` — เพลงที่กำลังเล่นอยู่',
                        '`/skip` — ข้ามเพลงปัจจุบัน',
                        '`/pause` / `/resume` — พัก / เล่นต่อ',
                        '`/stop` — หยุดเพลงและออกจากห้อง',
                        '`/volume` — ปรับระดับเสียง (0–100)',
                        '`/loop` — เปิด/ปิดวนซ้ำ',
                        '`/shuffle` — สุ่มลำดับเพลงในคิว',
                    ].join('\n'),
                    inline: false,
                },
                {
                    name: '🔊 TTS (อ่านชื่อเข้า-ออกห้องเสียง)',
                    value: [
                        'บอทจะอ่านชื่อสมาชิกอัตโนมัติเมื่อเข้า/ออกห้องเสียง',
                        '`/tts-admin` — เปิด/ปิด TTS หรือตั้งค่า (ต้องใส่รหัส)',
                        '`/tts-status` — ดูสถานะ TTS ปัจจุบัน',
                    ].join('\n'),
                    inline: false,
                },
                {
                    name: '🤖 AI Chat',
                    value: [
                        '@mention บอทในห้องแชทเพื่อให้ตอบกลับด้วย AI',
                        '`/chat enable/disable` — เปิด/ปิดการตอบ (แยกตาม role ได้)',
                        '`/chat status` — ดูสถานะปัจจุบัน',
                    ].join('\n'),
                    inline: false,
                },
                {
                    name: '🛡️ Moderation',
                    value: [
                        'บอทกรองข้อความอัตโนมัติ (คำหยาบ / ลิงก์ต้องห้าม / spam)',
                        '`/moderation` — ดู/จัดการการตั้งค่า moderation',
                        '`/patterns` — จัดการ pattern ที่ AI เรียนรู้',
                        '`/settings` — ตั้งค่าบอทใน server นี้',
                    ].join('\n'),
                    inline: false,
                },
                {
                    name: '👑 Admin (ต้องใส่รหัส)',
                    value: [
                        '`/dm` — ส่งข้อความถึงสมาชิกโดยตรงผ่านบอท',
                        '`/announce` — ประกาศข้อความในห้องที่กำหนด',
                        '`/restart` — รีสตาร์ทบอท',
                    ].join('\n'),
                    inline: false,
                },
                {
                    name: '✨ ฟีเจอร์อัตโนมัติ',
                    value: [
                        '📨 ต้อนรับสมาชิกใหม่พร้อมโจทย์คณิตระดับ ป.เอก',
                        '🔑 การสร้าง Role ต้องรอ CEO อนุมัติ (ยกเว้น CEO/admin)',
                    ].join('\n'),
                    inline: false,
                },
                {
                    name: '⚙️ ทั่วไป',
                    value: [
                        '`/ping` — ทดสอบการตอบสนองของบอท',
                        '`/help` — แสดงคู่มือนี้',
                        '`/invite` — ลิงก์เชิญบอทเข้า server',
                    ].join('\n'),
                    inline: false,
                },
            )
            .setFooter({ text: 'Enigma Bot • Made with ❤️' })
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    },
};
