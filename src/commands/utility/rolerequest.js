import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { addRequest } from '../../services/roleApprovalService.js';
import crypto from 'crypto';
import config from '../../config.js';

const LOG_CHANNEL_NAME = 'ห้องประชุมซากุระ';
const APPROVER_ROLES = ['⁺₊✧ CEO ✧⁺₊', 'admin ⁺₊✧', '✩‧₊˚ แม่บ้าน ✩‧₊˚'];

export default {
    data: new SlashCommandBuilder()
        .setName('rolerequest')
        .setDescription('ขอรับยศในเซิร์ฟเวอร์ (ต้องรอ admin อนุมัติ)')
        .addRoleOption(opt =>
            opt.setName('role')
                .setDescription('ยศที่ต้องการขอ')
                .setRequired(true)
        ),

    async execute(interaction) {
        const targetRole = interaction.options.getRole('role');
        const guild = interaction.guild;
        const member = interaction.member;
        const botMember = guild.members.me;
        const botHighestPos = botMember.roles.highest.position;

        // ห้ามขอ @everyone
        if (targetRole.id === guild.id) {
            return interaction.reply({ content: '❌ ไม่สามารถขอยศ @everyone ได้', flags: MessageFlags.Ephemeral });
        }

        // ห้ามขอยศที่สูงกว่าหรือเท่ากับยศสูงสุดของบอท
        if (targetRole.position >= botHighestPos) {
            return interaction.reply({
                content: `❌ ไม่สามารถขอยศ **${targetRole.name}** ได้ เนื่องจากยศนี้สูงกว่าหรือเท่ากับยศของบอท`,
                flags: MessageFlags.Ephemeral,
            });
        }

        // มียศนี้อยู่แล้ว
        if (member.roles.cache.has(targetRole.id)) {
            return interaction.reply({ content: `❌ คุณมียศ **${targetRole.name}** อยู่แล้ว`, flags: MessageFlags.Ephemeral });
        }

        // หาช่องส่งคำขอ
        const channels = await guild.channels.fetch().catch(() => null);
        const logChannel = channels?.find(c => c?.name === LOG_CHANNEL_NAME && c.isTextBased?.());
        if (!logChannel) {
            return interaction.reply({ content: '❌ ไม่พบช่องสำหรับส่งคำขอ กรุณาแจ้ง admin', flags: MessageFlags.Ephemeral });
        }

        const requestId = crypto.randomUUID();

        addRequest(requestId, {
            type: 'assign',
            roleId: targetRole.id,
            roleName: targetRole.name,
            requesterId: interaction.user.id,
            requesterTag: interaction.user.tag,
            guildId: guild.id,
        });

        const now = new Date();
        const thaiDate = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
        const thaiTime = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

        const embed = new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle('📋 คำขอรับยศ')
            .setThumbnail(interaction.user.displayAvatarURL())
            .addFields(
                { name: '👤 ผู้ขอ', value: `${interaction.user.tag}\n<@${interaction.user.id}>`, inline: true },
                { name: '🏷️ ยศที่ขอ', value: `<@&${targetRole.id}>\n${targetRole.name}`, inline: true },
                { name: '📅 เวลา', value: `${thaiDate} ${thaiTime}`, inline: false },
            )
            .setFooter({ text: `Request ID: ${requestId}` })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`assign_approve:${requestId}`)
                .setLabel('✅ อนุมัติ')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`assign_deny:${requestId}`)
                .setLabel('❌ ปฏิเสธ')
                .setStyle(ButtonStyle.Danger),
        );

        await logChannel.send({
            content: `📢 มีคำขอรับยศใหม่ — ${APPROVER_ROLES.map(r => `**${r}**`).join(' / ')} กรุณาตรวจสอบ`,
            embeds: [embed],
            components: [row],
        });

        return interaction.reply({
            content: `✅ ส่งคำขอรับยศ **${targetRole.name}** เรียบร้อยแล้ว กรุณารอ admin อนุมัติ`,
            flags: MessageFlags.Ephemeral,
        });
    },
};
