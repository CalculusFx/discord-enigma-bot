import { MessageFlags } from 'discord.js';
import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { updateGuildSettings, getGuildSettings } from '../../services/database.js';
import config from '../../config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('settings')
        .setDescription('ตั้งค่าบอท')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('ดูการตั้งค่าปัจจุบัน')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('tts')
                .setDescription('เปิด/ปิดการอ่านชื่อเวลาเข้า-ออกช่องเสียง')
                .addBooleanOption(option =>
                    option.setName('enabled')
                        .setDescription('เปิด/ปิด TTS')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('moderation')
                .setDescription('เปิด/ปิดระบบกรองเนื้อหา')
                .addBooleanOption(option =>
                    option.setName('enabled')
                        .setDescription('เปิด/ปิด Moderation')
                        .setRequired(true)
                )
                .addBooleanOption(option =>
                    option.setName('repetition_enabled')
                        .setDescription('เปิด/ปิดการบังคับใช้กฎการพิมพ์ซ้ำ (repetition)')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('log-channel')
                .setDescription('ตั้งค่าช่องแจ้งเตือน')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('ช่องสำหรับแจ้งเตือน')
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildText)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('tts-language')
                .setDescription('ตั้งค่าภาษา TTS')
                .addStringOption(option =>
                    option.setName('language')
                        .setDescription('ภาษา')
                        .setRequired(true)
                        .addChoices(
                            { name: 'ไทย', value: 'th' },
                            { name: 'English', value: 'en' },
                            { name: '日本語', value: 'ja' },
                            { name: '한국어', value: 'ko' },
                            { name: '中文', value: 'zh' },
                        )
                )
        ),

    async execute(interaction, client) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;
        
        // Get current settings or use defaults
        let settings = getGuildSettings(guildId) || {
            ttsEnabled: config.tts.enabled,
            moderationEnabled: config.moderation.enabled,
            logChannelId: config.moderation.logChannelId,
            ttsLanguage: config.tts.language,
        };

        switch (subcommand) {
            case 'view': {
                const embed = new EmbedBuilder()
                    .setColor(config.colors.primary)
                    .setTitle('⚙️ การตั้งค่าปัจจุบัน')
                    .addFields(
                        { name: '🔊 TTS (อ่านชื่อ)', value: settings.tts_enabled ? '✅ เปิด' : '❌ ปิด', inline: true },
                        { name: '🌐 ภาษา TTS', value: settings.tts_language || 'th', inline: true },
                        { name: '🛡️ Moderation', value: settings.moderation_enabled ? '✅ เปิด' : '❌ ปิด', inline: true },
                        { name: '📝 Log Channel', value: settings.log_channel_id ? `<#${settings.log_channel_id}>` : 'ไม่ได้ตั้งค่า', inline: true },
                    );

                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            case 'tts': {
                const enabled = interaction.options.getBoolean('enabled');
                updateGuildSettings(guildId, {
                    ttsEnabled: enabled,
                    moderationEnabled: settings.moderation_enabled ?? true,
                    logChannelId: settings.log_channel_id,
                    ttsLanguage: settings.tts_language || 'th',
                });

                return interaction.reply({
                    content: `🔊 TTS ${enabled ? 'เปิด' : 'ปิด'}แล้ว`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            case 'moderation': {
                const enabled = interaction.options.getBoolean('enabled');
                const repetitionEnabled = interaction.options.getBoolean('repetition_enabled');
                updateGuildSettings(guildId, {
                    ttsEnabled: settings.tts_enabled ?? true,
                    moderationEnabled: enabled,
                    repetitionEnabled: typeof repetitionEnabled === 'boolean' ? repetitionEnabled : (settings.moderation_repetition === 1 || settings.moderation_repetition === true),
                    logChannelId: settings.log_channel_id,
                    ttsLanguage: settings.tts_language || 'th',
                });

                return interaction.reply({
                    content: `🛡️ Moderation ${enabled ? 'เปิด' : 'ปิด'}แล้ว`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            case 'log-channel': {
                const channel = interaction.options.getChannel('channel');
                updateGuildSettings(guildId, {
                    ttsEnabled: settings.tts_enabled ?? true,
                    moderationEnabled: settings.moderation_enabled ?? true,
                    logChannelId: channel.id,
                    ttsLanguage: settings.tts_language || 'th',
                });

                return interaction.reply({
                    content: `📝 ตั้งค่าช่องแจ้งเตือนเป็น ${channel}`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            case 'tts-language': {
                const language = interaction.options.getString('language');
                updateGuildSettings(guildId, {
                    ttsEnabled: settings.tts_enabled ?? true,
                    moderationEnabled: settings.moderation_enabled ?? true,
                    logChannelId: settings.log_channel_id,
                    ttsLanguage: language,
                });

                client.ttsService.language = language;

                return interaction.reply({
                    content: `🌐 ตั้งค่าภาษา TTS เป็น **${language}**`,
                    flags: MessageFlags.Ephemeral,
                });
            }
        }
    },
};
