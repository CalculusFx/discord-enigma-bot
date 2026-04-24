import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags, ChannelType } from 'discord.js';
import { addAdminLog } from '../../services/database.js';
import config from '../../config.js';
// no TTS for regular announce

export default {
    data: new SlashCommandBuilder()
        .setName('announce')
        .setDescription('ส่งประกาศโดยบอทไปที่ช่องที่กำหนด (เฉพาะ Admin)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(opt => opt.setName('channel').setDescription('ช่องที่จะส่งประกาศ').setRequired(true))
    .addStringOption(opt => opt.setName('message').setDescription('ข้อความที่จะประกาศ').setRequired(true))
    .addChannelOption(opt => opt.setName('voice_channel').setDescription('ช่องเสียงที่จะให้บอทพูด (ถ้าว่างจะเลือกอัตโนมัติ)').addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice))
    .addBooleanOption(opt => opt.setName('mention_here').setDescription('Mention @here เมื่อส่ง'))
    .addBooleanOption(opt => opt.setName('mention_everyone').setDescription('Mention @everyone เมื่อส่ง'))
    .addRoleOption(opt => opt.setName('mention_role').setDescription('Mention บทบาท (role) เมื่อส่ง')),

    async execute(interaction, client) {
        const channel = interaction.options.getChannel('channel');
        const text = interaction.options.getString('message');
    const mentionHere = interaction.options.getBoolean('mention_here') || false;
    const mentionEveryone = interaction.options.getBoolean('mention_everyone') || false;
    const mentionRole = interaction.options.getRole('mention_role') || null;

        if (!channel || !channel.isTextBased()) return interaction.reply({ content: 'ช่องที่ระบุไม่รองรับข้อความ', flags: MessageFlags.Ephemeral });
        if (!channel.viewable || !channel.permissionsFor(interaction.guild.members.me).has('SendMessages')) {
            return interaction.reply({ content: 'บอทไม่มีสิทธิ์ส่งข้อความในช่องนั้น', flags: MessageFlags.Ephemeral });
        }

        const botUser = client.user;
        const embed = new EmbedBuilder()
            .setTitle('📢 ประกาศจาก Enigma Bot')
            // show the bot as the author so announcements appear to come from the bot itself
            .setAuthor({ name: botUser?.username || 'Enigma Bot', iconURL: botUser?.displayAvatarURL?.() })
            .setDescription(text)
            .setColor(config.colors.primary)
            .setTimestamp();

        try {
            const allowed = { parse: [] };
            const contents = [];
            if (mentionEveryone) {
                contents.push('@everyone');
                allowed.parse.push('everyone');
            }
            if (mentionHere) contents.push('@here');
            if (mentionRole) {
                contents.push(`<@&${mentionRole.id}>`);
                // mention roles must be allowed in allowedMentions
                allowed.roles = [mentionRole.id];
            }

            // Always send the announcement as text/embed for the normal announce command
            const sendPayload = { content: contents.length ? contents.join(' ') : undefined, embeds: [embed], allowedMentions: allowed };
            await channel.send(sendPayload);

            try { addAdminLog({ action: 'announce', performedBy: interaction.user.id, details: { channel: channel.id, message: text, tts: false } }); } catch {}
            return interaction.reply({ content: `✅ ประกาศถูกส่งไปยัง ${channel}`, flags: MessageFlags.Ephemeral });
        } catch (err) {
            console.error('Failed to send announce:', err);
            return interaction.reply({ content: '❌ ไม่สามารถส่งประกาศได้', flags: MessageFlags.Ephemeral });
        }
    }
};
