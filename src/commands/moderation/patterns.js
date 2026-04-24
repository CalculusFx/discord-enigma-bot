import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { listLearnedPatterns, removeLearnedPattern, updateLearnedPatternConfidence, getModerationWhitelist, addModerationWhitelistItem, removeModerationWhitelistItem, addAdminLog } from '../../services/database.js';
import config from '../../config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('patterns')
        .setDescription('จัดการ learned patterns (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sc => sc.setName('list').setDescription('แสดง learned patterns').addIntegerOption(o => o.setName('limit').setDescription('จำนวนรายการ').setRequired(false)))
        .addSubcommand(sc => sc.setName('remove').setDescription('ลบ pattern ตาม id').addIntegerOption(o => o.setName('id').setDescription('id ของ pattern').setRequired(true)).addStringOption(o => o.setName('password').setDescription('รหัสผ่าน Admin').setRequired(true)))
        .addSubcommand(sc => sc.setName('promote').setDescription('เพิ่ม confidence ของ pattern').addIntegerOption(o => o.setName('id').setDescription('id ของ pattern').setRequired(true)).addNumberOption(o => o.setName('by').setDescription('เพิ่มขึ้นทีละ').setRequired(true)).addStringOption(o => o.setName('password').setDescription('รหัสผ่าน Admin').setRequired(true)))
        .addSubcommand(sc => sc.setName('demote').setDescription('ลด confidence ของ pattern').addIntegerOption(o => o.setName('id').setDescription('id ของ pattern').setRequired(true)).addNumberOption(o => o.setName('by').setDescription('ลดลงทีละ').setRequired(true)).addStringOption(o => o.setName('password').setDescription('รหัสผ่าน Admin').setRequired(true)))
    .addSubcommandGroup(g => g.setName('whitelist').setDescription('จัดการ whitelist').addSubcommand(sc => sc.setName('list').setDescription('แสดง whitelist')).addSubcommand(sc => sc.setName('add').setDescription('เพิ่ม whitelist').addStringOption(o => o.setName('item').setDescription('ข้อความหรือคำที่ต้องการ whitelist').setRequired(true)).addStringOption(o => o.setName('password').setDescription('รหัสผ่าน Admin').setRequired(true))).addSubcommand(sc => sc.setName('remove').setDescription('ลบ whitelist item').addIntegerOption(o => o.setName('id').setDescription('id ของ whitelist').setRequired(true)).addStringOption(o => o.setName('password').setDescription('รหัสผ่าน Admin').setRequired(true))))
    ,

    async execute(interaction, client) {
        // support subcommand groups for whitelist
        const sub = interaction.options.getSubcommand();
        const group = interaction.options.getSubcommandGroup(false);

        if (group === 'whitelist') {
            const wsub = sub;
            switch (wsub) {
                case 'list': {
                    const items = getModerationWhitelist();
                    if (!items || items.length === 0) return interaction.reply({ content: 'ไม่มี whitelist items', flags: MessageFlags.Ephemeral });
                    const embed = new EmbedBuilder().setTitle(`Moderation Whitelist (${items.length})`).setColor(config.colors.primary).setDescription(items.map(i => `**#${i.id}** - ${i.item}`).join('\n'));
                    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                }
                case 'add': {
                    const password = interaction.options.getString('password');
                    if (password !== config.admin.password) return interaction.reply({ content: '❌ รหัสผ่านไม่ถูกต้อง', flags: MessageFlags.Ephemeral });
                    const item = interaction.options.getString('item');
                    const added = addModerationWhitelistItem(item);
                    try { addAdminLog({ action: 'add_whitelist', performedBy: interaction.user.id, details: { item: added.item, id: added.id } }); } catch {}
                    try { client.moderationService.reloadLearnedData(); } catch {}
                    return interaction.reply({ content: `✅ เพิ่ม whitelist: ${added.item} (id=${added.id})`, flags: MessageFlags.Ephemeral });
                }
                case 'remove': {
                    const password = interaction.options.getString('password');
                    if (password !== config.admin.password) return interaction.reply({ content: '❌ รหัสผ่านไม่ถูกต้อง', flags: MessageFlags.Ephemeral });
                    const id = interaction.options.getInteger('id');
                    const ok = removeModerationWhitelistItem(id);
                    if (!ok) return interaction.reply({ content: `ไม่พบ whitelist id=${id}`, flags: MessageFlags.Ephemeral });
                    try { addAdminLog({ action: 'remove_whitelist', performedBy: interaction.user.id, details: { id } }); } catch {}
                    try { client.moderationService.reloadLearnedData(); } catch {}
                    return interaction.reply({ content: `✅ ลบ whitelist id=${id}`, flags: MessageFlags.Ephemeral });
                }
                default:
                    return interaction.reply({ content: 'คำสั่ง whitelist ไม่ถูกต้อง', flags: MessageFlags.Ephemeral });
            }
        }

        switch (sub) {
            case 'list': {
                const limit = interaction.options.getInteger('limit') || 50;
                const patterns = listLearnedPatterns(limit);
                if (!patterns || patterns.length === 0) return interaction.reply({ content: 'ไม่มี learned patterns', flags: MessageFlags.Ephemeral });

                const embed = new EmbedBuilder()
                    .setTitle(`Learned Patterns (${patterns.length})`)
                    .setColor(config.colors.primary)
                    .setTimestamp();

                const description = patterns.map(p => `**#${p.id}** (${p.type}) [${p.confidence.toFixed(2)}] - ${p.pattern}`).join('\n');
                embed.setDescription(description.slice(0, 4096));

                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            case 'remove': {
                const password = interaction.options.getString('password');
                if (password !== config.admin.password) return interaction.reply({ content: '❌ รหัสผ่านไม่ถูกต้อง', flags: MessageFlags.Ephemeral });
                const id = interaction.options.getInteger('id');
                const ok = removeLearnedPattern(id);
                if (!ok) return interaction.reply({ content: `ไม่พบ pattern ที่มี id=${id}`, flags: MessageFlags.Ephemeral });
                try { addAdminLog({ action: 'remove_pattern', performedBy: interaction.user.id, details: { id } }); } catch {}
                // reload service patterns
                try { client.moderationService.reloadLearnedData(); } catch {}
                return interaction.reply({ content: `✅ ลบ pattern id=${id}`, flags: MessageFlags.Ephemeral });
            }

            case 'promote': {
                const password = interaction.options.getString('password');
                if (password !== config.admin.password) return interaction.reply({ content: '❌ รหัสผ่านไม่ถูกต้อง', flags: MessageFlags.Ephemeral });
                const id = interaction.options.getInteger('id');
                const by = Number(interaction.options.getNumber('by')) || 0.1;
                const updated = updateLearnedPatternConfidence(id, ( ( (listLearnedPatterns().find(p=>p.id===id)?.confidence||0) + by ) ));
                if (!updated) return interaction.reply({ content: `ไม่พบ pattern id=${id}`, flags: MessageFlags.Ephemeral });
                try { addAdminLog({ action: 'promote_pattern', performedBy: interaction.user.id, details: { id, by } }); } catch {}
                try { client.moderationService.reloadLearnedData(); } catch {}
                return interaction.reply({ content: `✅ ปรับ confidence ของ id=${id} เป็น ${updated.confidence}`, flags: MessageFlags.Ephemeral });
            }

            case 'demote': {
                const password = interaction.options.getString('password');
                if (password !== config.admin.password) return interaction.reply({ content: '❌ รหัสผ่านไม่ถูกต้อง', flags: MessageFlags.Ephemeral });
                const id = interaction.options.getInteger('id');
                const by = Number(interaction.options.getNumber('by')) || 0.1;
                const current = listLearnedPatterns().find(p => p.id === id);
                if (!current) return interaction.reply({ content: `ไม่พบ pattern id=${id}`, flags: MessageFlags.Ephemeral });
                const updated = updateLearnedPatternConfidence(id, current.confidence - by);
                try { addAdminLog({ action: 'demote_pattern', performedBy: interaction.user.id, details: { id, by } }); } catch {}
                try { client.moderationService.reloadLearnedData(); } catch {}
                return interaction.reply({ content: `✅ ปรับ confidence ของ id=${id} เป็น ${updated.confidence}`, flags: MessageFlags.Ephemeral });
            }

            default:
                return interaction.reply({ content: 'คำสั่งไม่ถูกต้อง', flags: MessageFlags.Ephemeral });
        }
    }
};
