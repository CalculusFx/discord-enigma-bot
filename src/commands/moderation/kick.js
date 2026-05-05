import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import config from '../../config.js';
import { addAdminLog } from '../../services/database.js';

const LOG_CHANNEL_NAME = 'ห้องประชุมซากุระ';

export default {
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('ไล่สมาชิกออกจากเซิร์ฟเวอร์พร้อมส่งข้อความแจ้ง (ต้องใส่รหัส Admin)')
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
        .addUserOption(opt =>
            opt.setName('user')
                .setDescription('สมาชิกที่ต้องการไล่ออก')
                .setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('password')
                .setDescription('รหัสผ่าน Admin')
                .setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('message')
                .setDescription('ข้อความที่จะส่งหาสมาชิกก่อนไล่ออก')
                .setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('reason')
                .setDescription('เหตุผลที่ไล่ออก (สำหรับ log)')
                .setRequired(false)
        ),

    async execute(interaction) {
        const password = interaction.options.getString('password');
        if (password !== config.admin.password) {
            return interaction.reply({ content: '❌ รหัสผ่านไม่ถูกต้อง', flags: MessageFlags.Ephemeral });
        }

        const targetUser = interaction.options.getUser('user');
        const dmMessage = interaction.options.getString('message');
        const reason = interaction.options.getString('reason') || 'ไม่ระบุเหตุผล';

        const member = interaction.guild.members.cache.get(targetUser.id)
            ?? await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        if (!member) {
            return interaction.reply({ content: '❌ ไม่พบสมาชิกนี้ในเซิร์ฟเวอร์', flags: MessageFlags.Ephemeral });
        }

        if (!member.kickable) {
            return interaction.reply({ content: '❌ บอทไม่สามารถไล่สมาชิกคนนี้ออกได้ (บทบาทสูงกว่าหรือเท่ากับบอท)', flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const now = new Date();
        const thaiDate = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
        const thaiTime = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        // 1. ส่ง DM ก่อน kick
        let dmStatus = '✅ ส่งสำเร็จ';
        try {
            const dmEmbed = new EmbedBuilder()
                .setColor(config.colors.error)
                .setTitle(`📢 แจ้งจากเซิร์ฟเวอร์ ${interaction.guild.name}`)
                .setDescription(dmMessage)
                .addFields({ name: '📅 เวลา', value: `${thaiDate} เวลา ${thaiTime}`, inline: false })
                .setFooter({ text: `เซิร์ฟเวอร์: ${interaction.guild.name}` })
                .setTimestamp();
            await targetUser.send({ embeds: [dmEmbed] });
        } catch {
            dmStatus = '⚠️ ส่งไม่ได้ (ผู้ใช้ปิด DM)';
        }

        // 2. Kick สมาชิก
        try {
            await member.kick(`[สั่งโดย: ${interaction.user.tag}] ${reason}`);
        } catch (err) {
            return interaction.editReply({ content: `❌ ไม่สามารถไล่ออกได้: ${err.message}` });
        }

        // 3. Log ไปที่ ห้องประชุมซากุระ
        try {
            const channels = await interaction.guild.channels.fetch().catch(() => null);
            const logChannel = channels?.find(c => c?.name === LOG_CHANNEL_NAME && c.isTextBased?.());
            if (logChannel) {
                const logEmbed = new EmbedBuilder()
                    .setColor(config.colors.error)
                    .setTitle('🚪 สมาชิกถูกไล่ออก')
                    .setThumbnail(targetUser.displayAvatarURL())
                    .addFields(
                        { name: '👤 ผู้ถูกไล่ออก', value: `${targetUser.tag}\n<@${targetUser.id}>`, inline: true },
                        { name: '🛡️ ผู้สั่งไล่ออก', value: `${interaction.user.tag}\n<@${interaction.user.id}>`, inline: true },
                        { name: '​', value: '​', inline: true },
                        { name: '📋 เหตุผล', value: reason, inline: false },
                        { name: '💬 ข้อความที่ส่งให้ผู้ถูกไล่ออก', value: dmMessage, inline: false },
                        { name: '📨 สถานะ DM', value: dmStatus, inline: true },
                        { name: '📅 วันที่', value: `${thaiDate}`, inline: true },
                        { name: '🕐 เวลา', value: thaiTime, inline: true },
                    )
                    .setFooter({ text: `User ID: ${targetUser.id}` })
                    .setTimestamp();
                await logChannel.send({ embeds: [logEmbed] });
            }
        } catch (err) {
            console.error('[Kick] ไม่สามารถส่ง log ไปที่ห้องประชุมซากุระ:', err.message);
        }

        // 4. บันทึก admin log
        try {
            addAdminLog({
                action: 'kick_member',
                performedBy: interaction.user.id,
                details: {
                    targetId: targetUser.id,
                    targetTag: targetUser.tag,
                    reason,
                    dmMessage,
                    dmStatus,
                    guildId: interaction.guild.id,
                    guildName: interaction.guild.name,
                }
            });
        } catch {}

        // 5. ตอบกลับ admin แบบ ephemeral
        const replyEmbed = new EmbedBuilder()
            .setColor(config.colors.success)
            .setTitle('✅ ไล่ออกสำเร็จ')
            .addFields(
                { name: '👤 ผู้ถูกไล่ออก', value: `${targetUser.tag}`, inline: true },
                { name: '📨 สถานะ DM', value: dmStatus, inline: true },
                { name: '📋 เหตุผล', value: reason, inline: false },
            )
            .setTimestamp();

        return interaction.editReply({ embeds: [replyEmbed] });
    },
};
