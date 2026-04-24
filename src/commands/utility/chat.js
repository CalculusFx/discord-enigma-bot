import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import config from '../../config.js';
import { chatState, setChatGlobal, setChatRole } from '../../services/chat/chatService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('chat')
        .setDescription('จัดการการตอบสนองของ Enigma Bot (ต้องใส่รหัส admin)')
        .addSubcommand(sub =>
            sub.setName('enable')
                .setDescription('เปิดการตอบสนอง')
                .addStringOption(opt =>
                    opt.setName('password')
                        .setDescription('รหัส admin')
                        .setRequired(true)
                )
                .addRoleOption(opt =>
                    opt.setName('role')
                        .setDescription('เปิดเฉพาะ role นี้ (ถ้าไม่ระบุ = เปิดทั้งหมด)')
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName('disable')
                .setDescription('ปิดการตอบสนอง')
                .addStringOption(opt =>
                    opt.setName('password')
                        .setDescription('รหัส admin')
                        .setRequired(true)
                )
                .addRoleOption(opt =>
                    opt.setName('role')
                        .setDescription('ปิดเฉพาะ role นี้ (ถ้าไม่ระบุ = ปิดทั้งหมด)')
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName('status')
                .setDescription('ดูสถานะปัจจุบัน')
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        // Status doesn't need password
        if (sub === 'status') {
            const disabledList = [...chatState.disabledRoles];
            const embed = new EmbedBuilder()
                .setColor(chatState.globalEnabled ? config.colors.success : config.colors.error)
                .setTitle('💬 สถานะการตอบสนองของบอท')
                .addFields(
                    {
                        name: 'ภาพรวม',
                        value: chatState.globalEnabled ? '✅ เปิดอยู่' : '🔕 ปิดอยู่',
                        inline: true,
                    },
                    {
                        name: 'Roles ที่ถูกปิด',
                        value: disabledList.length > 0
                            ? disabledList.map(r => `• ${r}`).join('\n')
                            : '—',
                        inline: false,
                    }
                )
                .setTimestamp();
            return interaction.reply({ embeds: [embed], flags: 64 });
        }

        // Verify password for enable/disable
        const password = interaction.options.getString('password');
        if (password !== config.admin.password) {
            return interaction.reply({ content: '❌ รหัส admin ไม่ถูกต้อง', flags: 64 });
        }

        const role = interaction.options.getRole('role');

        if (sub === 'disable') {
            if (role) {
                setChatRole(role.name, false);
                return interaction.reply({
                    content: `🔕 ปิดการตอบสนองสำหรับ role **${role.name}** แล้ว`,
                    flags: 64,
                });
            } else {
                setChatGlobal(false);
                return interaction.reply({
                    content: '🔕 ปิดการตอบสนองทั้งหมดแล้ว',
                    flags: 64,
                });
            }
        }

        if (sub === 'enable') {
            if (role) {
                setChatRole(role.name, true);
                return interaction.reply({
                    content: `✅ เปิดการตอบสนองสำหรับ role **${role.name}** แล้ว`,
                    flags: 64,
                });
            } else {
                setChatGlobal(true);
                return interaction.reply({
                    content: '✅ เปิดการตอบสนองทั้งหมดแล้ว',
                    flags: 64,
                });
            }
        }
    },
};
