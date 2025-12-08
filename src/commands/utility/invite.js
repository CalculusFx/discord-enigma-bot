import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import config from '../../config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('invite')
        .setDescription('รับลิงก์เชิญบอทไปยัง server อื่น'),

    async execute(interaction) {
        const clientId = config.clientId;
        const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=8&scope=bot%20applications.commands`;

        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('🔗 เชิญบอทไปยัง Server ของคุณ')
            .setDescription('คลิกลิงก์ด้านล่างเพื่อเชิญบอทไปยัง Discord server ของคุณ')
            .addFields(
                {
                    name: '📋 ลิงก์เชิญ',
                    value: `[คลิกที่นี่เพื่อเชิญบอท](${inviteUrl})`,
                },
                {
                    name: '✨ Features',
                    value: '• เล่นเพลงจาก YouTube, Spotify, SoundCloud\n• ประกาศเข้า-ออก Voice Channel ด้วย TTS\n• กรองเนื้อหาด้วย AI\n• บล็อกลิงก์การพนัน/ผิดกฎหมาย',
                },
                {
                    name: '🔑 Permissions',
                    value: 'บอทต้องการสิทธิ์ Administrator เพื่อใช้งานคุณสมบัติทั้งหมด',
                }
            )
            .setFooter({ text: 'ขอบคุณที่ใช้บอทของเรา!' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};
