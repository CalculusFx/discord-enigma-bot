import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import config from '../../config.js';
import { setGlobalSetting, getGlobalSettings } from '../../services/database.js';
import { promises as fs } from 'fs';
import { join } from 'path';

export default {
    data: new SlashCommandBuilder()
        .setName('tts-admin')
        .setDescription('จัดการการตั้งค่า TTS (สำหรับผู้ดูแล)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sc => sc
            .setName('clear-cache')
            .setDescription('ล้างไฟล์ cache ของ TTS'))
        .addSubcommand(sc => sc
            .setName('set-provider')
            .setDescription('ตั้ง provider สำหรับ TTS')
            .addStringOption(o => o.setName('provider').setDescription('openai | google | auto').setRequired(true)
                .addChoices(
                    { name: 'auto', value: 'auto' },
                    { name: 'openai', value: 'openai' },
                    { name: 'google', value: 'google' },
                )
            ))
        .addSubcommand(sc => sc
            .setName('view')
            .setDescription('แสดงการตั้งค่า TTS ปัจจุบัน'))
        .addSubcommand(sc => sc
            .setName('set-rate')
            .setDescription('ตั้ง rate limit ของ TTS (requests per minute)')
            .addIntegerOption(o => o.setName('per_minute').setDescription('คำร้องต่อนาที').setRequired(true))
            .addBooleanOption(o => o.setName('enabled').setDescription('เปิด/ปิด rate limit'))),

    async execute(interaction) {
        await interaction.deferReply({ flags: 64 });

        const sub = interaction.options.getSubcommand();

        try {
            if (sub === 'clear-cache') {
                const cacheDir = config.tts.cache?.dir || './temp/tts_cache';
                const abs = cacheDir;
                let removed = 0;
                try {
                    const files = await fs.readdir(abs).catch(() => []);
                    for (const f of files) {
                        const p = join(abs, f);
                        await fs.unlink(p).catch(() => null);
                        removed++;
                    }
                } catch (err) {
                    return interaction.editReply({ content: `ล้าง cache ล้มเหลว: ${err.message}` });
                }

                return interaction.editReply({ content: `ล้าง cache เสร็จ: ลบ ${removed} ไฟล์ จาก ${abs}` });
            }

            if (sub === 'set-provider') {
                const provider = interaction.options.getString('provider', true);
                // persist
                setGlobalSetting('tts.provider', provider);
                // update runtime config
                config.tts = config.tts || {};
                config.tts.provider = provider;
                return interaction.editReply({ content: `ตั้งค่า provider เป็น: ${provider}` });
            }

            if (sub === 'view') {
                const globals = getGlobalSettings() || {};
                const ttsCfg = globals.tts || config.tts || {};
                const embed = new EmbedBuilder()
                    .setTitle('TTS Configuration')
                    .addFields(
                        { name: 'Provider', value: String(ttsCfg.provider || config.tts.provider || 'auto'), inline: true },
                        { name: 'Cache Enabled', value: String(ttsCfg.cache?.enabled ?? config.tts.cache?.enabled ?? false), inline: true },
                        { name: 'Cache Dir', value: String(ttsCfg.cache?.dir ?? config.tts.cache?.dir ?? 'n/a'), inline: false },
                        { name: 'Rate Limit Enabled', value: String(ttsCfg.rateLimit?.enabled ?? config.tts.rateLimit?.enabled ?? false), inline: true },
                        { name: 'Per Minute', value: String(ttsCfg.rateLimit?.perMinute ?? config.tts.rateLimit?.perMinute ?? 0), inline: true },
                    )
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            if (sub === 'set-rate') {
                const per = interaction.options.getInteger('per_minute', true);
                const enabled = interaction.options.getBoolean('enabled');
                const obj = { enabled: typeof enabled === 'boolean' ? enabled : true, perMinute: per };
                setGlobalSetting('tts.rateLimit', obj);
                config.tts = config.tts || {};
                config.tts.rateLimit = obj;
                return interaction.editReply({ content: `ตั้ง rate limit: ${obj.perMinute} ต่อ минутา (enabled=${obj.enabled})` });
            }

            return interaction.editReply({ content: 'คำสั่งไม่ถูกต้อง' });
        } catch (err) {
            console.error('tts-admin error', err);
            return interaction.editReply({ content: `เกิดข้อผิดพลาด: ${err.message || err}` });
        }
    }
};
