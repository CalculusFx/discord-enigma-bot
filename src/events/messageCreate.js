import { Events, EmbedBuilder } from 'discord.js';
import config from '../config.js';
import { getReply, isOnCooldown, isChatAllowed } from '../services/chat/chatService.js';

const SAKURA_LOG_CHANNEL = 'ห้องประชุมซากุระ🌸';

export default {
    name: Events.MessageCreate,
    async execute(message, client) {
        // Ignore bot messages
        if (message.author.bot) return;

        // Detect if the bot is mentioned (e.g. @Enigma Bot มีแฟนยัง)
        const isMentioned = message.mentions.has(client.user);
        const mentionText = isMentioned
            ? message.content.replace(/<@!?\d+>/g, '').trim()
            : null;

        // Skip moderation if disabled — but still handle mentions
        if (!config.moderation.enabled) {
            if (isMentioned && mentionText && isChatAllowed(message.member) && !isOnCooldown(message.author.id)) {
                try {
                    const VIP_ROLES = ['⁺₊✧ CEO ✧⁺₊', 'admin'];
                    const isCEO = message.member?.roles?.cache?.some(r => VIP_ROLES.includes(r.name)) ?? false;
                    const reply = await getReply(message.channel.id, message.author.username, mentionText || 'ทักทาย', isCEO);
                    if (reply) await message.reply(reply);
                } catch (e) { console.error('[Chat] Error:', e); }
            }
            return;
        }

        try {
            // Check message content
            const result = await client.moderationService.checkMessage(message.content, message.guild?.id);
            if (!result || typeof result.isViolation === 'undefined') {
                console.error('Moderation API error: Invalid response', result);
                return;
            }
            if (result.isViolation) {
                // Identify repetition violations
                const isRepetition = result.type === 'repetition' || result.rule === 'char_run' || result.rule === 'digit_run' || result.rule === 'digit_run_extreme';

                // If violation is repetition, make it non-punitive: just log and optionally notify.
                // Profanity and other types will continue to follow the existing punitive flow.
                if (isRepetition) {
                    const { logModeration } = await import('../services/database.js');
                    const logEntry = {
                        userId: message.author.id,
                        userTag: message.author.tag,
                        username: message.author.username,
                        guildId: message.guild?.id || null,
                        guildName: message.guild?.name || null,
                        channelId: message.channel?.id || null,
                        channelName: message.channel?.name || null,
                        content: message.content,
                        violationType: result.type,
                        reason: result.reason,
                        actionTaken: 'logged'
                    };
                    try { logModeration(logEntry); } catch (e) { /* ignore DB errors */ }

                    // Do not delete/timeout/ban for repetition violations
                    return;
                }
                // Check violation count for user
                const { getModerationLogsByUser } = await import('../services/database.js');
                const decayHours = (config.moderation && Number(config.moderation.decayHours)) ? Number(config.moderation.decayHours) : 24;
                const cutoff = Date.now() - (decayHours * 60 * 60 * 1000);
                // fetch recent logs (limit 100 to give enough history) then filter by decay window
                const userLogs = getModerationLogsByUser(message.author.id, 100);
                const recentViolations = userLogs
                    .filter(log => log.violationType === result.type && log.actionTaken === 'deleted')
                    .filter(log => {
                        const ts = new Date(log.timestamp).getTime();
                        return ts >= cutoff;
                    });

                // occurrences includes the current violation
                const occurrences = recentViolations.length + 1;
                // Each group of 3 violations escalates: 1-3 -> 10, 4-6 -> 20, 7-9 -> 40
                const step = Math.ceil(occurrences / 3); // 1 => first group (1-3), 2 => second group (4-6), ...
                // Compute escalation timeout in minutes (10 * 2^(step-1)), but only apply when step >= 1 and occurrences >= 3
                let timeoutMinutes = 0;
                if (occurrences >= 3 && step >= 1) {
                    timeoutMinutes = 10 * Math.pow(2, Math.max(0, step - 1));
                }
                // Clamp timeout to Discord's maximum (28 days in minutes) and ensure non-negative
                const DISCORD_MAX_MINUTES = 28 * 24 * 60; // 28 days
                if (!Number.isFinite(timeoutMinutes) || timeoutMinutes < 0) timeoutMinutes = 0;
                timeoutMinutes = Math.min(timeoutMinutes, DISCORD_MAX_MINUTES);
                const timeoutMs = Math.max(0, Math.floor(timeoutMinutes) * 60 * 1000);

        if (occurrences >= 3 && timeoutMinutes > 0) {
                    try {
            // Discord expects a duration in milliseconds but the library may accept minutes; ensure we pass a safe number
            // use timeout in milliseconds; clamp to safe integer range
            const safeTimeout = Math.min(timeoutMs, Number.MAX_SAFE_INTEGER);
            await message.member.timeout(safeTimeout, `ละเมิดกฎซ้ำ ${occurrences} ครั้ง`);
                        const banEmbed = new EmbedBuilder()
                            .setColor(config.colors.error)
                            .setTitle('⛔ ผู้ใช้ถูกแบนชั่วคราว')
                            .setDescription(
                                `${message.author} ถูกแบน ${timeoutMinutes} นาที เนื่องจากละเมิดกฎซ้ำ ${occurrences} ครั้ง\n\n` +
                                `• ประเภทการละเมิด: ${result.type}\n` +
                                `• เหตุผล: ${result.reason}\n` +
                                `• ครั้งที่: ${occurrences}\n` +
                                `• ระยะเวลารวม (นาที): ${timeoutMinutes}\n` +
                                `• เวลา: ${new Date().toLocaleString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                            )
                            .setFooter({ text: 'ระบบ moderation อัตโนมัติ' })
                            .setTimestamp();
                        const sentBan = await message.channel.send({ embeds: [banEmbed] });
                        // include a reference to moderation history command in the ban embed (helpful link)
                        try {
                            sentBan.edit({ embeds: [banEmbed.setFooter({ text: `ดูประวัติ: /moderation history ${message.author.id}` })] }).catch(() => {});
                        } catch {}
                    } catch (err) {
                        // ไม่สามารถแบนได้ (เช่น bot ไม่มีสิทธิ์)
                        await message.channel.send(`⛔ ไม่สามารถแบน ${message.author} ได้ (bot ไม่มีสิทธิ์หรือ role สูงกว่า)`);
                    }
                }
                // Delete the message if auto-delete is enabled
                if (config.moderation.autoDelete && message.deletable) {
                    try {
                        await message.delete();
                        console.log(`[Moderation] Deleted message from ${message.author.tag} (${message.author.id}) in #${message.channel.name}`);
                    } catch (err) {
                        console.error(`[Moderation] Failed to delete message:`, err);
                        await message.channel.send(`❌ ไม่สามารถลบข้อความของ ${message.author} ได้ (อาจเกิดจาก Discord API หรือข้อจำกัดอื่น)`);
                    }
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
                        `• ประเภทการละเมิด: ${result.type}\n` +
                        `• ครั้งที่: ${occurrences}\n` +
                        `• ระยะเวลารวมที่ถูกแบน (นาที): ${timeoutMinutes}`
                    )
                    .setFooter({ text: 'กรุณาปฏิบัติตามกฎของชุมชน' })
                    .setTimestamp();

                try {
                    await message.author.send({ embeds: [warningEmbed] });
                } catch (dmErr) {
                    // User has DMs disabled or sending failed - log and continue
                    console.warn('[Moderation] Failed to send DM warning to', message.author.id, dmErr?.message || dmErr);
                    // continue without throwing
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
                    .addFields(
                        { name: '🔢 ครั้งที่', value: String(occurrences), inline: true },
                        { name: '⏱️ เวลาที่จะถูกแบน (นาที)', value: timeoutMinutes > 0 ? String(timeoutMinutes) : '—', inline: true },
                        { name: '🧾 ระยะเวลารวม (นาที)', value: timeoutMinutes > 0 ? String(timeoutMinutes) : '—', inline: true }
                    )
                    .setFooter({ text: 'กรุณาปฏิบัติตามกฎของชุมชน' })
                    .setTimestamp();

                let channelWarning = null;
                try {
                    channelWarning = await message.channel.send({ embeds: [publicWarningEmbed] });
                } catch (chErr) {
                    console.error('[Moderation] Failed to send public warning in channel', message.channel.id, chErr?.message || chErr);
                    // fallback: attempt to send to configured mod log channel if available
                    try {
                        if (config.moderation.logChannelId && message.guild) {
                            const fallbackCh = message.guild.channels.cache.get(config.moderation.logChannelId) || await message.guild.channels.fetch(config.moderation.logChannelId).catch(() => null);
                            if (fallbackCh && fallbackCh.send) {
                                channelWarning = await fallbackCh.send({ embeds: [publicWarningEmbed] });
                            }
                        }
                    } catch (fallbackErr) {
                        console.error('[Moderation] Failed to send fallback log to mod channel', fallbackErr?.message || fallbackErr);
                    }
                }

                // Delete warning after 15 seconds (clamped)
                if (channelWarning) setTimeout(() => channelWarning.delete().catch((e) => console.warn('Failed to delete channel warning:', e?.message || e)), Math.max(1, 15000));

                // Log to database with full details
                const { logModeration } = await import('../services/database.js');
                const logEntry = {
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
                };
                logModeration(logEntry);
                // retrieve most recent moderation log for this user to obtain id
                try {
                    const { getModerationLogsByUser } = await import('../services/database.js');
                    const latest = getModerationLogsByUser(message.author.id, 1)[0] || null;
                    const logId = latest?.id || null;

                    // If we have channelWarning (the public warning), append footer with history command and log id
                    if (channelWarning) {
                        try {
                            const foot = `ดูประวัติ: /moderation history ${message.author.id}` + (logId ? ` | log#${logId}` : '');
                            await channelWarning.edit({ embeds: [publicWarningEmbed.setFooter({ text: foot })] }).catch(() => {});
                        } catch {}
                    }

                    // Also, if we sent the moderation log to mod channel earlier, attempt to append the log id in that embed
                    if (config.moderation.logChannelId) {
                        try {
                            let logChannel = message.guild?.channels.cache.get(config.moderation.logChannelId) || null;
                            if (!logChannel && message.guild) logChannel = await message.guild.channels.fetch(config.moderation.logChannelId).catch(() => null);
                            if (!logChannel && client) logChannel = await client.channels.fetch(config.moderation.logChannelId).catch(() => null);
                            if (logChannel && typeof logChannel.send === 'function') {
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
                                    .setFooter({ text: `log#${logId ? logId : '[pending]'} • ดู: /moderation history ${message.author.id}` })
                                    .setTimestamp();

                                await logChannel.send({ embeds: [logEmbed] }).catch(err => console.warn('[Moderation] Failed to send to log channel:', err?.message || err));
                            }
                        } catch (err) {
                            // ignore
                        }
                    }
                } catch (e) {
                    // ignore DB read errors
                }

                // Log to mod channel (try cache -> guild.fetch -> client.fetch)
                if (config.moderation.logChannelId) {
                    let logChannel = null;
                    try {
                        // Prefer guild-local channel cache
                        logChannel = message.guild?.channels.cache.get(config.moderation.logChannelId) || null;
                        // If not found in cache, try to fetch from the guild
                        if (!logChannel && message.guild) {
                            logChannel = await message.guild.channels.fetch(config.moderation.logChannelId).catch(() => null);
                        }
                        // As a last resort try global client fetch (useful if the configured channel is in another guild)
                        if (!logChannel && client) {
                            logChannel = await client.channels.fetch(config.moderation.logChannelId).catch(() => null);
                        }
                    } catch (fetchErr) {
                        console.warn('[Moderation] Error fetching log channel:', fetchErr?.message || fetchErr);
                        logChannel = null;
                    }

                    if (logChannel && typeof logChannel.send === 'function') {
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

                        await logChannel.send({ embeds: [logEmbed] }).catch(err => console.warn('[Moderation] Failed to send to log channel:', err?.message || err));
                    } else {
                        // Helpful debug log to indicate why mod logs may not appear
                        console.warn('[Moderation] No valid log channel found for ID:', config.moderation.logChannelId);
                    }
                }

                // Log to ห้องประชุมซากุระ🌸
                try {
                    const now = new Date();
                    const thaiDate = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
                    const thaiTime = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                    const allChannels = await message.guild?.channels.fetch().catch(() => null);
                    const sakuraChannel = allChannels?.find(c => c?.name === SAKURA_LOG_CHANNEL && c.isTextBased?.());
                    if (sakuraChannel) {
                        const sakuraEmbed = new EmbedBuilder()
                            .setColor(config.colors.error)
                            .setTitle('🚨 ตรวจพบการละเมิดกฎ')
                            .setThumbnail(message.author.displayAvatarURL())
                            .addFields(
                                { name: '👤 ผู้ละเมิด', value: `${message.author.tag}\n<@${message.author.id}>`, inline: true },
                                { name: '📢 ช่อง', value: `<#${message.channel.id}>`, inline: true },
                                { name: '​', value: '​', inline: true },
                                { name: '⚠️ ประเภทการละเมิด', value: result.type, inline: true },
                                { name: '📋 เหตุผล', value: result.reason, inline: true },
                                { name: '🔢 ครั้งที่', value: String(occurrences), inline: true },
                                { name: '🗑️ การดำเนินการ', value: config.moderation.autoDelete ? 'ลบข้อความ' : 'เตือน', inline: true },
                                { name: '⏱️ โทษ (timeout)', value: timeoutMinutes > 0 ? `${timeoutMinutes} นาที` : '—', inline: true },
                                { name: '​', value: '​', inline: true },
                                { name: '💬 เนื้อหา', value: `\`\`\`${message.content.substring(0, 500)}\`\`\``, inline: false },
                                { name: '📅 วันที่', value: thaiDate, inline: true },
                                { name: '🕐 เวลา', value: thaiTime, inline: true },
                            )
                            .setFooter({ text: `User ID: ${message.author.id}` })
                            .setTimestamp();
                        await sakuraChannel.send({ embeds: [sakuraEmbed] });
                    }
                } catch (err) {
                    console.error('[Moderation] ไม่สามารถส่ง log ไปที่ห้องประชุมซากุระ🌸:', err.message);
                }

                // Learn from this violation (include meta for guild and source)
                await client.moderationService.learn(message.content, result.type, { guildId: message.guild?.id, source: message.author.id });
            }

            // Reply to mentions (only if no violation was found and chat is allowed for this member)
            if (isMentioned && mentionText && !result.isViolation && isChatAllowed(message.member) && !isOnCooldown(message.author.id)) {
                try {
                    const VIP_ROLES = ['⁺₊✧ CEO ✧⁺₊', 'admin'];
                    const isCEO = message.member?.roles?.cache?.some(r => VIP_ROLES.includes(r.name)) ?? false;
                    const reply = await getReply(message.channel.id, message.author.username, mentionText || 'ทักทาย', isCEO);
                    if (reply) await message.reply(reply);
                } catch (e) {
                    console.error('[Chat] Error generating reply:', e?.message || e);
                }
            }

            // Check attachments (images, videos)
            if (message.attachments.size > 0) {
                // Guard in case moderationService.checkAttachment is not available on the running instance
                const checkAttachmentFn = client.moderationService && client.moderationService.checkAttachment;
                if (typeof checkAttachmentFn !== 'function') {
                    console.warn('[Moderation] checkAttachment not available on moderationService, skipping attachment checks');
                } else {
                    for (const attachment of message.attachments.values()) {
                        const attachmentResult = await checkAttachmentFn.call(client.moderationService, attachment);

                        if (attachmentResult && attachmentResult.isViolation) {
                            if (config.moderation.autoDelete && message.deletable) {
                                await message.delete();
                            }

                            console.log(`[MODERATION] Attachment violation from ${message.author.tag}: ${attachmentResult.reason}`);
                            break;
                        }
                    }
                }
            }

        } catch (error) {
            console.error('Error in message moderation:', error);
        }
    },
};
