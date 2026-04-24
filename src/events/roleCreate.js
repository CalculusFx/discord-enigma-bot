import { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AuditLogEvent } from 'discord.js';
import { addRequest } from '../services/roleApprovalService.js';

const VIP_ROLES = ['⁺₊✧ CEO ✧⁺₊', 'admin'];
const APPROVAL_CHANNEL_NAME = 'ห้องประชุมซากุระ';

export default {
    name: Events.GuildRoleCreate,
    async execute(role, client) {
        try {
            // รอ audit log อัปเดต
            await new Promise(r => setTimeout(r, 1500));

            // ดึง audit log เพื่อหาว่าใครสร้าง
            const logs = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleCreate, limit: 5 }).catch(() => null);
            const entry = logs?.entries.find(e => e.target?.id === role.id);
            const executor = entry?.executor ?? null;

            // ถ้าบอทสร้างเอง (ตอน approve) → ข้ามได้เลย
            if (!executor || executor.id === client.user.id) return;

            // ดึง member เพื่อตรวจ role
            const member = await role.guild.members.fetch(executor.id).catch(() => null);
            const isVIP = member?.roles?.cache?.some(r => VIP_ROLES.includes(r.name)) ?? false;
            if (isVIP) return;

            // เก็บข้อมูล role ก่อนลบ
            const requestId = `${Date.now()}-${executor.id}`;
            const roleData = {
                requestId,
                roleName: role.name,
                roleColor: role.color,
                roleHoist: role.hoist,
                roleMentionable: role.mentionable,
                rolePermissions: role.permissions.bitfield.toString(),
                requesterId: executor.id,
                requesterTag: executor.tag,
                guildId: role.guild.id,
            };

            // ลบ role ทันที
            await role.delete('รอการอนุมัติจาก CEO').catch(() => null);

            // บันทึก pending
            addRequest(requestId, roleData);

            // หาห้องประชุมซากุระ
            const approvalChannel = role.guild.channels.cache.find(c => c.name === APPROVAL_CHANNEL_NAME && c.isTextBased());
            if (!approvalChannel) {
                console.warn('[RoleApproval] ไม่พบช่อง:', APPROVAL_CHANNEL_NAME);
                return;
            }

            // หา CEO/admin role เพื่อ ping
            const pingRoles = role.guild.roles.cache.filter(r => VIP_ROLES.includes(r.name));
            const pingText = pingRoles.map(r => `<@&${r.id}>`).join(' ');

            const colorHex = role.color ? `#${role.color.toString(16).padStart(6, '0')}` : null;

            const embed = new EmbedBuilder()
                .setColor(role.color || 0x4c8ef7)
                .setTitle('📋 คำขอสร้าง Role ใหม่')
                .setDescription(`${pingText}\nมีการสร้าง role ใหม่ กรุณาอนุมัติหรือปฏิเสธ`)
                .addFields(
                    { name: '👤 ผู้ขอ', value: `<@${executor.id}> (${executor.tag})`, inline: true },
                    { name: '🏷️ ชื่อ Role', value: `\`${role.name}\``, inline: true },
                    { name: '🎨 สี', value: colorHex ? `\`${colorHex}\`` : '—', inline: true },
                    { name: '📌 Hoist', value: role.hoist ? 'ใช่' : 'ไม่', inline: true },
                    { name: '🔔 Mentionable', value: role.mentionable ? 'ใช่' : 'ไม่', inline: true },
                )
                .setFooter({ text: `Request ID: ${requestId}` })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`role_approve:${requestId}`)
                    .setLabel('✅ อนุมัติ')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`role_deny:${requestId}`)
                    .setLabel('❌ ปฏิเสธ')
                    .setStyle(ButtonStyle.Danger),
            );

            await approvalChannel.send({ embeds: [embed], components: [row] });

            // แจ้งผู้ขอทาง DM
            const requester = await client.users.fetch(executor.id).catch(() => null);
            if (requester) {
                await requester.send(`⏳ Role **${role.name}** ที่คุณสร้างถูกพักไว้รอการอนุมัติจาก CEO ครับ`).catch(() => null);
            }

        } catch (err) {
            console.error('[RoleApproval] Error:', err);
        }
    },
};
