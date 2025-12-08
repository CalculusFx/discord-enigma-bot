import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { addBlockedDomain, getBlockedDomains, getModerationLogs, getModerationLogsByUser, getLearnedPatterns } from '../../services/database.js';
import config from '../../config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('moderation')
        .setDescription('จัดการระบบกรองเนื้อหา (ต้องใส่รหัสผ่าน)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('block-domain')
                .setDescription('เพิ่มโดเมนที่ถูกบล็อก')
                .addStringOption(option =>
                    option.setName('password')
                        .setDescription('รหัสผ่าน Admin')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('domain')
                        .setDescription('โดเมนที่ต้องการบล็อก')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('category')
                        .setDescription('หมวดหมู่')
                        .setRequired(true)
                        .addChoices(
                            { name: 'การพนัน', value: 'gambling' },
                            { name: 'ผิดกฎหมาย', value: 'illegal' },
                            { name: 'เนื้อหาผู้ใหญ่', value: 'adult' },
                            { name: 'อื่นๆ', value: 'other' },
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list-domains')
                .setDescription('แสดงรายการโดเมนที่ถูกบล็อก')
                .addStringOption(option =>
                    option.setName('password')
                        .setDescription('รหัสผ่าน Admin')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('แสดงสถานะระบบกรองเนื้อหา')
                .addStringOption(option =>
                    option.setName('password')
                        .setDescription('รหัสผ่าน Admin')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('logs')
                .setDescription('ดู log การละเมิดล่าสุด')
                .addStringOption(option =>
                    option.setName('password')
                        .setDescription('รหัสผ่าน Admin')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option.setName('limit')
                        .setDescription('จำนวน logs ที่ต้องการดู (ค่าเริ่มต้น: 10)')
                        .setMinValue(1)
                        .setMaxValue(20)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('user-logs')
                .setDescription('ดู log การละเมิดของผู้ใช้คนใดคนหนึ่ง')
                .addStringOption(option =>
                    option.setName('password')
                        .setDescription('รหัสผ่าน Admin')
                        .setRequired(true)
                )
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('ผู้ใช้ที่ต้องการตรวจสอบ')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('learned-patterns')
                .setDescription('ดู patterns ที่บอทเรียนรู้จากการละเมิด')
                .addStringOption(option =>
                    option.setName('password')
                        .setDescription('รหัสผ่าน Admin')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('กรองตามประเภท')
                        .addChoices(
                            { name: 'ทั้งหมด', value: 'all' },
                            { name: 'คำหยาบคาย', value: 'profanity' },
                            { name: 'การพนัน', value: 'gambling' },
                            { name: 'ผิดกฎหมาย', value: 'illegal' },
                            { name: 'หลอกลวง', value: 'scam' }
                        )
                )
        ),

    async execute(interaction, client) {
        const subcommand = interaction.options.getSubcommand();
        const password = interaction.options.getString('password');

        // ตรวจสอบรหัสผ่าน
        if (password !== config.admin.password) {
            return interaction.reply({
                content: '❌ รหัสผ่านไม่ถูกต้อง!',
                ephemeral: true,
            });
        }

        switch (subcommand) {
            case 'block-domain': {
                const domain = interaction.options.getString('domain').toLowerCase();
                const category = interaction.options.getString('category');

                addBlockedDomain(domain, category, interaction.user.id);
                client.moderationService.blockedDomains.push(domain);

                return interaction.reply({
                    content: `✅ เพิ่มโดเมน **${domain}** ในรายการบล็อกแล้ว`,
                    ephemeral: true,
                });
            }

            case 'list-domains': {
                const domains = getBlockedDomains();
                
                if (domains.length === 0) {
                    return interaction.reply({
                        content: 'ไม่มีโดเมนที่ถูกบล็อก',
                        ephemeral: true,
                    });
                }

                const embed = new EmbedBuilder()
                    .setColor(config.colors.primary)
                    .setTitle('🚫 รายการโดเมนที่ถูกบล็อก')
                    .setDescription(domains.map(d => `• **${d.domain}** (${d.category})`).join('\n'));

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            case 'status': {
                const embed = new EmbedBuilder()
                    .setColor(config.colors.primary)
                    .setTitle('🛡️ สถานะระบบกรองเนื้อหา')
                    .addFields(
                        { name: 'สถานะ', value: config.moderation.enabled ? '✅ เปิดใช้งาน' : '❌ ปิดใช้งาน', inline: true },
                        { name: 'ลบอัตโนมัติ', value: config.moderation.autoDelete ? '✅ เปิด' : '❌ ปิด', inline: true },
                        { name: 'AI Moderation', value: client.moderationService.openai ? '✅ เปิด' : '❌ ปิด', inline: true },
                        { name: 'โดเมนที่บล็อก', value: `${client.moderationService.blockedDomains.length} โดเมน`, inline: true },
                    );

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            case 'logs': {
                const limit = interaction.options.getInteger('limit') || 10;
                const logs = getModerationLogs(limit);

                if (logs.length === 0) {
                    return interaction.reply({
                        content: 'ไม่มี log การละเมิด',
                        ephemeral: true,
                    });
                }

                const embed = new EmbedBuilder()
                    .setColor(config.colors.error)
                    .setTitle(`📋 Log การละเมิดล่าสุด (${logs.length} รายการ)`)
                    .setDescription(logs.map(log => 
                        `**#${log.id}** | <@${log.userId}> (${log.userTag})\n` +
                        `📍 #${log.channelName} | 🏛️ ${log.guildName}\n` +
                        `⚠️ **${log.violationType}** - ${log.reason}\n` +
                        `💬 "${log.content.substring(0, 50)}${log.content.length > 50 ? '...' : ''}"\n` +
                        `🕐 ${log.time} | 📅 ${log.date}\n` +
                        `━━━━━━━━━━━━━━━━━━━━`
                    ).join('\n'))
                    .setFooter({ text: `ใช้ /moderation user-logs เพื่อดู log ของผู้ใช้เฉพาะคน` })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            case 'user-logs': {
                const user = interaction.options.getUser('user');
                const logs = getModerationLogsByUser(user.id);

                if (logs.length === 0) {
                    return interaction.reply({
                        content: `ไม่พบ log การละเมิดของ ${user.tag}`,
                        ephemeral: true,
                    });
                }

                const embed = new EmbedBuilder()
                    .setColor(config.colors.error)
                    .setTitle(`📋 Log การละเมิดของ ${user.tag}`)
                    .setThumbnail(user.displayAvatarURL())
                    .addFields(
                        { name: 'ผู้ใช้', value: `${user.tag} (${user.id})`, inline: true },
                        { name: 'จำนวนการละเมิด', value: `${logs.length} ครั้ง`, inline: true },
                        { name: '\u200B', value: '\u200B', inline: false }
                    );

                // แสดง 10 รายการล่าสุด
                logs.slice(0, 10).forEach((log, index) => {
                    embed.addFields({
                        name: `การละเมิดครั้งที่ ${logs.length - index}`,
                        value: 
                            `📍 ช่อง: #${log.channelName}\n` +
                            `⚠️ ประเภท: **${log.violationType}** - ${log.reason}\n` +
                            `💬 ข้อความ: "${log.content.substring(0, 100)}${log.content.length > 100 ? '...' : ''}"\n` +
                            `🕐 ${log.time} | 📅 ${log.date}`,
                        inline: false
                    });
                });

                if (logs.length > 10) {
                    embed.setFooter({ text: `แสดง 10 รายการล่าสุดจากทั้งหมด ${logs.length} รายการ` });
                }

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            case 'learned-patterns': {
                const filterType = interaction.options.getString('type') || 'all';
                const allPatterns = getLearnedPatterns();
                
                const patterns = filterType === 'all' 
                    ? allPatterns 
                    : allPatterns.filter(p => p.type === filterType);

                if (patterns.length === 0) {
                    return interaction.reply({
                        content: filterType === 'all' 
                            ? '📚 ยังไม่มี patterns ที่เรียนรู้\n\nระบบจะเริ่มเรียนรู้เมื่อมีการละเมิดเกิดขึ้น' 
                            : `📚 ไม่พบ patterns ประเภท "${filterType}"`,
                        ephemeral: true,
                    });
                }

                // จัดกลุ่มตาม type
                const groupedByType = {};
                patterns.forEach(p => {
                    if (!groupedByType[p.type]) {
                        groupedByType[p.type] = [];
                    }
                    groupedByType[p.type].push(p);
                });

                const embed = new EmbedBuilder()
                    .setColor(config.colors.primary)
                    .setTitle('🧠 Learned Patterns - ความรู้ที่บอทเรียนรู้')
                    .setDescription(
                        `บอทได้เรียนรู้ patterns จากการละเมิดที่เกิดขึ้น\n` +
                        `**จำนวนทั้งหมด:** ${patterns.length} patterns\n\n` +
                        `**การทำงาน:**\n` +
                        `• คำที่มี confidence ≥ 0.7 จะถูกใช้ตรวจจับอัตโนมัติ\n` +
                        `• ยิ่งพบคำเดิมบ่อย confidence จะยิ่งสูง (สูงสุด 1.0)\n\n` +
                        `**ประเภทที่เรียนรู้:**`
                    );

                // แสดงแต่ละประเภท
                Object.keys(groupedByType).forEach(type => {
                    const typePatterns = groupedByType[type];
                    const typeEmoji = {
                        'profanity': '🤬',
                        'gambling': '🎰',
                        'illegal': '⚠️',
                        'scam': '🎣',
                        'adult': '🔞'
                    }[type] || '📝';

                    // แสดงแค่ top 10 patterns ของแต่ละประเภท (เรียงตาม confidence)
                    const topPatterns = typePatterns
                        .sort((a, b) => b.confidence - a.confidence)
                        .slice(0, 10);

                    const patternList = topPatterns
                        .map(p => `• \`${p.pattern}\` (confidence: ${(p.confidence * 100).toFixed(0)}%)`)
                        .join('\n');

                    embed.addFields({
                        name: `${typeEmoji} ${type.toUpperCase()} (${typePatterns.length} patterns)`,
                        value: patternList || 'ไม่มีข้อมูล',
                        inline: false
                    });
                });

                embed.setFooter({ 
                    text: `💡 Tip: ใช้ option "type" เพื่อกรองตามประเภท | อัปเดต: ${new Date().toLocaleString('th-TH')}` 
                });

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }
        }
    },
};
