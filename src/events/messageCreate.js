import { Events, EmbedBuilder } from 'discord.js';
import config from '../config.js';

export default {
    name: Events.MessageCreate,
    async execute(message, client) {
        // Ignore bot messages
        if (message.author.bot) return;
        
        // Skip if moderation is disabled
        if (!config.moderation.enabled) return;

        try {
            // Check message content
            const result = await client.moderationService.checkMessage(message);
            
            if (result.isViolation) {
                // Check violation count for user
                const { getModerationLogsByUser } = await import('../services/database.js');
                const userLogs = getModerationLogsByUser(message.author.id, 10);
                const recentViolations = userLogs.filter(log => log.violationType === result.type && log.actionTaken === 'deleted');
                if (recentViolations.length >= 3) {
                    // Ban user for 10 minutes
                    try {
                        await message.member.timeout(10 * 60 * 1000, 'ละเมิดกฎครบ 3 ครั้ง');
                        const banEmbed = new EmbedBuilder()
                            .setColor(config.colors.error)
                            .setTitle('⛔ ผู้ใช้ถูกแบนชั่วคราว')
                            .setDescription(
                                `${message.author} ถูกแบน 10 นาที เนื่องจากละเมิดกฎครบ 3 ครั้ง\n\n` +
                                `• ประเภทการละเมิด: ${result.type}\n` +
                                `• เหตุผล: ${result.reason}\n` +
                                `• เวลา: ${new Date().toLocaleString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                            )
                            .setFooter({ text: 'ระบบ moderation อัตโนมัติ' })
                            .setTimestamp();
                        await message.channel.send({ embeds: [banEmbed] });
                    } catch (err) {
                        // ไม่สามารถแบนได้ (เช่น bot ไม่มีสิทธิ์)
                        await message.channel.send(`⛔ ไม่สามารถแบน ${message.author} ได้ (bot ไม่มีสิทธิ์หรือ role สูงกว่า)`);
                    }
                }
                // Delete the message if auto-delete is enabled
                if (config.moderation.autoDelete && message.deletable) {
                    await message.delete();
                }

                // Send warning to user via DM (with details)
                const warningEmbed = new EmbedBuilder()
                    .setColor(config.colors.warning)
                    .setTitle('⚠️ เนื้อหาไม่เหมาะสม')
                    .setDescription(
                        `ข้อความของคุณถูกลบเนื่องจาก: ${result.reason}\n\n` +
                        `**รายละเอียดการละเมิด:**\n` +
                        `• ผู้ส่ง: ${message.author.tag} (${message.author.id})\n` +
                        `• เนื้อหา: "${message.content.substring(0, 200)}"\n` +
                        `• ช่อง: #${message.channel.name}\n` +
                        `• เวลา: ${new Date().toLocaleString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}\n` +
                        `• ประเภทการละเมิด: ${result.type}`
                    )
                    .setFooter({ text: 'กรุณาปฏิบัติตามกฎของชุมชน' })
                    .setTimestamp();

                try {
                    await message.author.send({ embeds: [warningEmbed] });
                } catch {
                    // User has DMs disabled - skip DM
                }

                // Send public warning in the channel (with details)
                const publicWarningEmbed = new EmbedBuilder()
                    .setColor(config.colors.error)
                    .setTitle('⚠️ การแจ้งเตือน')
                    .setDescription(
                        `${message.author} **ข้อความของคุณละเมิดกฎของชุมชน**\n\n` +
                        `**รายละเอียดการละเมิด:**\n` +
                        `• เนื้อหา: "${message.content.substring(0, 200)}"\n` +
                        `• ช่อง: #${message.channel.name}\n` +
                        `• เวลา: ${new Date().toLocaleString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}\n` +
                        `• ประเภทการละเมิด: ${result.type}\n\n` +
                        `**เหตุผล:** ${result.reason}\n\n` +
                        `⚠️ หากพบการกระทำผิดซ้ำอีก ทางเรามีความจำเป็นต้องลงโทษตามกฎต่อไป`
                    )
                    .setFooter({ text: 'กรุณาปฏิบัติตามกฎของชุมชน' })
                    .setTimestamp();

                const channelWarning = await message.channel.send({ embeds: [publicWarningEmbed] });
                
                // Delete warning after 15 seconds
                setTimeout(() => channelWarning.delete().catch(() => {}), 15000);

                // Log to database with full details
                const { logModeration } = await import('../services/database.js');
                logModeration({
                    userId: message.author.id,
                    userTag: message.author.tag,
                    username: message.author.username,
                    guildId: message.guild.id,
                    guildName: message.guild.name,
                    channelId: message.channel.id,
                    channelName: message.channel.name,
                    content: message.content,
                    violationType: result.type,
                    reason: result.reason,
                    actionTaken: config.moderation.autoDelete ? 'deleted' : 'warned'
                });

                // Log to mod channel
                if (config.moderation.logChannelId) {
                    const logChannel = message.guild.channels.cache.get(config.moderation.logChannelId);
                    
                    if (logChannel) {
                        const now = new Date();
                        const logEmbed = new EmbedBuilder()
                            .setColor(config.colors.error)
                            .setTitle('🛡️ Content Moderation Log')
                            .addFields(
                                { name: 'ผู้ใช้', value: `${message.author.tag} (${message.author.id})`, inline: true },
                                { name: 'ช่อง', value: `${message.channel.name}`, inline: true },
                                { name: 'ประเภทการละเมิด', value: result.type, inline: true },
                                { name: 'เหตุผล', value: result.reason },
                                { name: 'เนื้อหา', value: message.content.substring(0, 1000) || 'N/A' },
                                { name: 'เวลา', value: now.toLocaleString('th-TH', { 
                                    year: 'numeric', 
                                    month: 'long', 
                                    day: 'numeric',
                                    hour: '2-digit', 
                                    minute: '2-digit' 
                                }), inline: true },
                                { name: 'การดำเนินการ', value: config.moderation.autoDelete ? '🗑️ ลบข้อความ' : '⚠️ เตือน', inline: true }
                            )
                            .setTimestamp();

                        await logChannel.send({ embeds: [logEmbed] });
                    }
                }

                // Learn from this violation
                await client.moderationService.learn(message.content, result.type);
            }

            // Check attachments (images, videos)
            if (message.attachments.size > 0) {
                for (const attachment of message.attachments.values()) {
                    const attachmentResult = await client.moderationService.checkAttachment(attachment);
                    
                    if (attachmentResult.isViolation) {
                        if (config.moderation.autoDelete && message.deletable) {
                            await message.delete();
                        }
                        
                        // Similar logging as above...
                        console.log(`[MODERATION] Attachment violation from ${message.author.tag}: ${attachmentResult.reason}`);
                        break;
                    }
                }
            }

        } catch (error) {
            console.error('Error in message moderation:', error);
        }
    },
};
