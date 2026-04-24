import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { addBlockedDomain, getBlockedDomains, getModerationLogs, getModerationLogsByUser, getLearnedPatterns, addAdminLog, getAdminLogs } from '../../services/database.js';
import config from '../../config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('moderation')
        .setDescription('จัดการระบบกรองเนื้อหา (ต้องใส่รหัสผ่าน)')
        .addSubcommand(sc => sc
            .setName('block-domain')
            .setDescription('เพิ่มโดเมนที่ถูกบล็อก')
            .addStringOption(opt => opt.setName('password').setDescription('รหัสผ่าน Admin').setRequired(true))
            .addStringOption(opt => opt.setName('domain').setDescription('โดเมนที่ต้องการบล็อก').setRequired(true))
            .addStringOption(opt => opt.setName('category').setDescription('หมวดหมู่').setRequired(true)
                .addChoices(
                    { name: 'การพนัน', value: 'gambling' },
                    { name: 'ผิดกฎหมาย', value: 'illegal' },
                    { name: 'เนื้อหาผู้ใหญ่', value: 'adult' },
                    { name: 'อื่นๆ', value: 'other' },
                )
            )
        )
        .addSubcommand(sc => sc
            .setName('list-domains')
            .setDescription('แสดงรายการโดเมนที่ถูกบล็อก')
            .addStringOption(opt => opt.setName('password').setDescription('รหัสผ่าน Admin').setRequired(true))
        )
        .addSubcommand(sc => sc
            .setName('status')
            .setDescription('แสดงสถานะระบบกรองเนื้อหา')
            .addStringOption(opt => opt.setName('password').setDescription('รหัสผ่าน Admin').setRequired(true))
        )
        .addSubcommand(sc => sc
            .setName('logs')
            .setDescription('ดู log การละเมิดล่าสุด')
            .addStringOption(opt => opt.setName('password').setDescription('รหัสผ่าน Admin').setRequired(true))
            .addIntegerOption(opt => opt.setName('limit').setDescription('จำนวน logs ที่ต้องการดู (ค่าเริ่มต้น: 10)').setMinValue(1).setMaxValue(50))
        )
        .addSubcommand(sc => sc
            .setName('user-logs')
            .setDescription('ดู log การละเมิดของผู้ใช้คนใดคนหนึ่ง')
            .addStringOption(opt => opt.setName('password').setDescription('รหัสผ่าน Admin').setRequired(true))
            .addUserOption(opt => opt.setName('user').setDescription('ผู้ใช้ที่ต้องการตรวจสอบ').setRequired(true))
        )
        .addSubcommand(sc => sc
            .setName('history')
            .setDescription('ดูประวัติการละเมิดของผู้ใช้ (paged)')
            .addStringOption(opt => opt.setName('password').setDescription('รหัสผ่าน Admin').setRequired(true))
            .addUserOption(opt => opt.setName('user').setDescription('ผู้ใช้ที่ต้องการตรวจสอบ').setRequired(true))
            .addIntegerOption(opt => opt.setName('page').setDescription('หน้า (เริ่มที่ 1)').setRequired(false).setMinValue(1))
        )
        .addSubcommand(sc => sc
            .setName('learned-patterns')
            .setDescription('ดู patterns ที่บอทเรียนรู้จากการละเมิด')
            .addStringOption(opt => opt.setName('password').setDescription('รหัสผ่าน Admin').setRequired(true))
            .addStringOption(opt => opt.setName('type').setDescription('กรองตามประเภท')
                .addChoices(
                    { name: 'ทั้งหมด', value: 'all' },
                    { name: 'คำหยาบคาย', value: 'profanity' },
                    { name: 'การพนัน', value: 'gambling' },
                    { name: 'ผิดกฎหมาย', value: 'illegal' },
                    { name: 'หลอกลวง', value: 'scam' }
                )
            )
        )
        .addSubcommand(sc => sc
            .setName('set-provider')
            .setDescription('ตั้งค่า provider สำหรับ moderation (heuristic/openai/huggingface)')
            .addStringOption(opt => opt.setName('password').setDescription('รหัสผ่าน Admin').setRequired(true))
            .addStringOption(opt => opt.setName('provider').setDescription('ชื่อ provider').setRequired(true)
                .addChoices(
                    { name: 'heuristic', value: 'heuristic' },
                    { name: 'openai', value: 'openai' },
                    { name: 'huggingface', value: 'huggingface' }
                )
            )
        )
        .addSubcommand(sc => sc
            .setName('admin-logs')
            .setDescription('แสดงกิจกรรมแอดมินล่าสุด (audit)')
            .addStringOption(opt => opt.setName('password').setDescription('รหัสผ่าน Admin').setRequired(true))
            .addIntegerOption(opt => opt.setName('limit').setDescription('จำนวนรายการที่ต้องการดู').setRequired(false).setMinValue(1).setMaxValue(50))
        ),

    async execute(interaction, client) {
        const sub = interaction.options.getSubcommand();
        const password = interaction.options.getString('password');

        if (password !== config.admin.password) {
            return interaction.reply({ content: '❌ รหัสผ่านไม่ถูกต้อง', flags: MessageFlags.Ephemeral });
        }

        switch (sub) {
            case 'block-domain': {
                const domain = interaction.options.getString('domain');
                const category = interaction.options.getString('category');
                addBlockedDomain(domain, category, interaction.user.id);
                try { addAdminLog({ action: 'block_domain', performedBy: interaction.user.id, details: { domain, category } }); } catch {}

                const embed = new EmbedBuilder()
                    .setTitle('✅ บล็อกโดเมนเรียบร้อย')
                    .setColor(config.colors.success)
                    .setDescription('โดเมน ' + domain + ' ถูกเพิ่มในรายการบล็อก (category: ' + category + ')')
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            case 'list-domains': {
                const domains = getBlockedDomains();
                if (!domains || domains.length === 0) return interaction.reply({ content: 'ไม่มีโดเมนที่ถูกบล็อก', flags: MessageFlags.Ephemeral });

                const list = domains.map(d => `• ${d.domain} (${d.category || 'n/a'})`).join('\n');
                const embed = new EmbedBuilder().setTitle(`🔒 Blocked Domains (${domains.length})`).setColor(config.colors.primary).setDescription(list);
                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            case 'status': {
                const provider = client.moderationService?.provider || config.moderation.provider || 'heuristic';
                const openaiPresent = client.moderationService?.openai ? '✅' : '❌';
                const embed = new EmbedBuilder()
                    .setTitle('🛡️ Moderation Status')
                    .setColor(config.colors.primary)
                    .addFields(
                        { name: 'Provider', value: String(provider), inline: true },
                        { name: 'OpenAI Key', value: openaiPresent, inline: true },
                        { name: 'Enabled', value: String(!!config.moderation.enabled), inline: true }
                    )
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            case 'logs': {
                const limit = interaction.options.getInteger('limit') || 10;
                const logs = getModerationLogs(limit);
                if (!logs || logs.length === 0) return interaction.reply({ content: 'ไม่พบ logs', flags: MessageFlags.Ephemeral });

                const description = logs.map(l => `**#${l.id}** ${l.date} ${l.time} | <@${l.userId}> | ${l.violationType} | ${l.actionTaken || 'none'}\n> ${l.content?.substring(0, 120)}`).join('\n\n');
                const embed = new EmbedBuilder().setTitle(`📋 Recent Moderation Logs (${logs.length})`).setColor(config.colors.primary).setDescription(description);
                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            case 'user-logs': {
                const user = interaction.options.getUser('user');
                const logs = getModerationLogsByUser(user.id, 50);
                if (!logs || logs.length === 0) return interaction.reply({ content: 'ไม่พบ logs สำหรับผู้ใช้คนนี้', flags: MessageFlags.Ephemeral });

                const description = logs.map(l => `**#${l.id}** ${l.date} ${l.time} | ${l.violationType} | ${l.actionTaken || 'none'}\n> ${l.content?.substring(0, 120)}`).join('\n\n');
                const embed = new EmbedBuilder().setTitle(`📋 Moderation Logs for ${user.tag} (${logs.length})`).setColor(config.colors.primary).setDescription(description);
                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

                case 'history': {
                    const user = interaction.options.getUser('user');
                    const page = interaction.options.getInteger('page') || 1;
                    const perPage = 5;
                    const logs = getModerationLogsByUser(user.id, 200);
                    if (!logs || logs.length === 0) return interaction.reply({ content: 'ไม่พบ logs สำหรับผู้ใช้คนนี้', flags: MessageFlags.Ephemeral });

                    const total = logs.length;
                    const pages = Math.max(1, Math.ceil(total / perPage));
                    const p = Math.min(Math.max(1, page), pages);
                    const start = (p - 1) * perPage;
                    const slice = logs.slice(start, start + perPage);

                    const description = slice.map(l => `**#${l.id}** ${l.date} ${l.time} | ${l.violationType} | ${l.actionTaken || 'none'}\n> ${l.content?.substring(0, 200)}`).join('\n\n');
                    const embed = new EmbedBuilder()
                        .setTitle(`📋 Moderation History for ${user.tag} (page ${p}/${pages})`)
                        .setColor(config.colors.primary)
                        .setDescription(description)
                        .setFooter({ text: `Total: ${total} • Use /moderation history ${user.id} <page>` });

                    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                }

            case 'learned-patterns': {
                const type = interaction.options.getString('type') || 'all';
                const patterns = type === 'all' ? getLearnedPatterns() : getLearnedPatterns(type);
                if (!patterns || patterns.length === 0) return interaction.reply({ content: 'ไม่มี pattern ที่เรียนรู้', flags: MessageFlags.Ephemeral });

                const grouped = {};
                patterns.forEach(p => { (grouped[p.type] = grouped[p.type] || []).push(p); });
                const fields = Object.keys(grouped).map(t => ({ name: t, value: grouped[t].slice(0, 10).map(p => `• ${p.pattern} (${Math.round(p.confidence*100)}%)`).join('\n') || 'ไม่มีข้อมูล', inline: false }));
                const embed = new EmbedBuilder().setTitle('🧠 Learned Patterns').setColor(config.colors.primary).addFields(...fields);
                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            case 'set-provider': {
                const provider = interaction.options.getString('provider');
                try {
                    client.moderationService.setProvider(provider, interaction.guild?.id || null);
                    try { addAdminLog({ action: 'set_provider', performedBy: interaction.user.id, details: { provider, guildId: interaction.guild?.id || null } }); } catch {}

                    const embed = new EmbedBuilder().setTitle('✅ Provider Updated').setColor(config.colors.success).setDescription(`Provider ถูกตั้งค่าเป็น: ${provider}`);
                    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                } catch (err) {
                    console.error('Failed to set provider via command:', err);
                    return interaction.reply({ content: '❌ เกิดข้อผิดพลาดในการตั้งค่า provider', flags: MessageFlags.Ephemeral });
                }
            }

            case 'admin-logs': {
                const limit = interaction.options.getInteger('limit') || 10;
                const logs = getAdminLogs(limit);
                if (!logs || logs.length === 0) return interaction.reply({ content: 'ไม่พิจารณากิจกรรมแอดมิน', flags: MessageFlags.Ephemeral });

                const description = logs.map(l => `**#${l.id}** ${l.date} ${l.time} | ${l.action} | by <@${l.performedBy}>\n> ${JSON.stringify(l.details || {}).substring(0,200)}`).join('\n\n');
                const embed = new EmbedBuilder().setTitle(`🧾 Admin Audit Logs (${logs.length})`).setColor(config.colors.primary).setDescription(description);
                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            default:
                return interaction.reply({ content: 'คำสั่งไม่ถูกต้อง', flags: MessageFlags.Ephemeral });
        }
    },
};
