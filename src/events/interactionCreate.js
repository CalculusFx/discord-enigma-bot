import { MessageFlags } from 'discord.js';
import { Events } from 'discord.js';
import { pending, removeRequest } from '../services/roleApprovalService.js';

const CEO_ROLES = ['⁺₊✧ CEO ✧⁺₊', 'admin'];
const APPROVER_ROLES = ['⁺₊✧ CEO ✧⁺₊', 'admin ⁺₊✧', '✩‧₊˚ แม่บ้าน ✩‧₊˚'];

export default {
    name: Events.InteractionCreate,
    async execute(interaction, client) {
        // handle button interactions for moderation approve/reject
        if (interaction.isButton && interaction.customId) {
            try {
                const idRaw = interaction.customId;

                // ── Role approval buttons ──────────────────────────────────
                if (idRaw.startsWith('role_approve:') || idRaw.startsWith('role_deny:')) {
                    const isVIP = interaction.member?.roles?.cache?.some(r => CEO_ROLES.includes(r.name)) ?? false;
                    if (!isVIP) {
                        return interaction.reply({ content: '❌ เฉพาะ CEO และ admin เท่านั้นที่อนุมัติได้ครับ', flags: MessageFlags.Ephemeral });
                    }

                    const [action, requestId] = idRaw.split(':');
                    const req = pending.get(requestId);

                    if (!req) {
                        return interaction.reply({ content: '⚠️ ไม่พบคำขอนี้ อาจถูกจัดการไปแล้วครับ', flags: MessageFlags.Ephemeral });
                    }

                    const guild = client.guilds.cache.get(req.guildId) || await client.guilds.fetch(req.guildId).catch(() => null);
                    const requester = await client.users.fetch(req.requesterId).catch(() => null);

                    if (action === 'role_approve') {
                        // สร้าง role จริง
                        const newRole = await guild.roles.create({
                            name: req.roleName,
                            color: req.roleColor || 0,
                            hoist: req.roleHoist,
                            mentionable: req.roleMentionable,
                            permissions: BigInt(req.rolePermissions),
                            reason: `อนุมัติโดย ${interaction.user.tag}`,
                        }).catch(err => { console.error('[RoleApproval] create error:', err); return null; });

                        removeRequest(requestId);

                        const disabledRow = interaction.message.components.map(r => ({
                            ...r.toJSON(), components: r.toJSON().components.map(c => ({ ...c, disabled: true }))
                        }));
                        await interaction.update({
                            embeds: [{ ...interaction.message.embeds[0].toJSON(), color: 0x57F287, footer: { text: `✅ อนุมัติโดย ${interaction.user.tag}` } }],
                            components: disabledRow,
                        });

                        if (requester) await requester.send(`✅ Role **${req.roleName}** ของคุณได้รับการอนุมัติจาก CEO แล้วครับ${newRole ? ` → ${newRole}` : ''}`).catch(() => null);

                    } else {
                        removeRequest(requestId);

                        const disabledRow = interaction.message.components.map(r => ({
                            ...r.toJSON(), components: r.toJSON().components.map(c => ({ ...c, disabled: true }))
                        }));
                        await interaction.update({
                            embeds: [{ ...interaction.message.embeds[0].toJSON(), color: 0xED4245, footer: { text: `❌ ปฏิเสธโดย ${interaction.user.tag}` } }],
                            components: disabledRow,
                        });

                        if (requester) await requester.send(`❌ คำขอสร้าง role **${req.roleName}** ถูกปฏิเสธโดย CEO ครับ`).catch(() => null);
                    }
                    return;
                }

                // ── Role assignment approval buttons ──────────────────────
                if (idRaw.startsWith('assign_approve:') || idRaw.startsWith('assign_deny:')) {
                    const isApprover = interaction.member?.roles?.cache?.some(r => APPROVER_ROLES.includes(r.name)) ?? false;
                    if (!isApprover) {
                        return interaction.reply({ content: '❌ เฉพาะ CEO / admin / แม่บ้าน เท่านั้นที่อนุมัติได้', flags: MessageFlags.Ephemeral });
                    }

                    const [action, requestId] = idRaw.split(':');
                    const req = pending.get(requestId);

                    if (!req) {
                        return interaction.reply({ content: '⚠️ ไม่พบคำขอนี้ อาจถูกจัดการไปแล้ว', flags: MessageFlags.Ephemeral });
                    }

                    const guild = client.guilds.cache.get(req.guildId) ?? await client.guilds.fetch(req.guildId).catch(() => null);
                    const requester = await client.users.fetch(req.requesterId).catch(() => null);

                    const disabledRow = interaction.message.components.map(r => ({
                        ...r.toJSON(), components: r.toJSON().components.map(c => ({ ...c, disabled: true }))
                    }));

                    if (action === 'assign_approve') {
                        let assignOk = false;
                        try {
                            const guildMember = await guild.members.fetch(req.requesterId);
                            await guildMember.roles.add(req.roleId, `อนุมัติโดย ${interaction.user.tag}`);
                            assignOk = true;
                        } catch (err) {
                            console.error('[RoleAssign] assign error:', err);
                        }

                        removeRequest(requestId);

                        await interaction.update({
                            embeds: [{ ...interaction.message.embeds[0].toJSON(), color: 0x57F287, footer: { text: `✅ อนุมัติโดย ${interaction.user.tag}` } }],
                            components: disabledRow,
                        });

                        if (requester) {
                            await requester.send(
                                assignOk
                                    ? `✅ คำขอยศ **${req.roleName}** ของคุณได้รับการอนุมัติแล้ว`
                                    : `⚠️ คำขอยศ **${req.roleName}** ได้รับการอนุมัติ แต่ไม่สามารถมอบยศให้ได้ กรุณาแจ้ง admin`
                            ).catch(() => null);
                        }

                    } else {
                        removeRequest(requestId);

                        await interaction.update({
                            embeds: [{ ...interaction.message.embeds[0].toJSON(), color: 0xED4245, footer: { text: `❌ ปฏิเสธโดย ${interaction.user.tag}` } }],
                            components: disabledRow,
                        });

                        if (requester) {
                            await requester.send(`❌ คำขอยศ **${req.roleName}** ถูกปฏิเสธโดย admin`).catch(() => null);
                        }
                    }
                    return;
                }

                // ── Moderation pattern buttons ─────────────────────────────
                if (idRaw.startsWith('mod_approve:') || idRaw.startsWith('mod_reject:')) {
                    const [action, encoded] = idRaw.split(':');
                    const patternId = decodeURIComponent(encoded || '');
                    // if patternId looks numeric, pass as number
                    const pid = (/^\d+$/.test(patternId) ? Number(patternId) : patternId);
                    if (action === 'mod_approve') {
                            const updated = await client.moderationService.approveLearnedPattern(pid, interaction.user.id);
                            // update original message embed: disable buttons and add approval note
                            try {
                                const orig = interaction.message;
                                const embed = orig.embeds?.[0];
                                const updatedEmbed = embed ? { ...embed.data } : { title: 'Pattern approved' };
                                const actor = `${interaction.user.tag}`;
                                const now = new Date().toISOString();
                                updatedEmbed.footer = { text: `Approved by ${actor} • ${now}` };
                                const disabledRow = orig.components?.map(r => ({ ...r, components: r.components.map(c => ({ ...c, disabled: true })) }));
                                await interaction.update({ embeds: [updatedEmbed], components: disabledRow });
                            } catch (err) {
                                // fallback to ephemeral reply
                                await interaction.reply({ content: updated ? '✅ Pattern approved' : '⚠️ ไม่สามารถยืนยัน pattern ได้', flags: MessageFlags.Ephemeral });
                            }
                        } else if (action === 'mod_reject') {
                            const result = await client.moderationService.rejectLearnedPattern(pid, interaction.user.id);
                            try {
                                const orig = interaction.message;
                                const embed = orig.embeds?.[0];
                                const updatedEmbed = embed ? { ...embed.data } : { title: 'Pattern rejected' };
                                const actor = `${interaction.user.tag}`;
                                const now = new Date().toISOString();
                                updatedEmbed.footer = { text: `Rejected by ${actor} • ${now}` };
                                const disabledRow = orig.components?.map(r => ({ ...r, components: r.components.map(c => ({ ...c, disabled: true })) }));
                                await interaction.update({ embeds: [updatedEmbed], components: disabledRow });
                            } catch (err) {
                                await interaction.reply({ content: result ? '🗑️ Pattern rejected and removed' : '⚠️ ไม่สามารถลบ pattern ได้', flags: MessageFlags.Ephemeral });
                            }
                        }
                    return;
                }
            } catch (err) {
                console.error('Button interaction error:', err);
            }
        }

        if (!interaction.isChatInputCommand()) return;

        const command = client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`Command ${interaction.commandName} not found`);
            return;
        }

        // Cooldown handling
        const { cooldowns } = client;

        if (!cooldowns.has(command.data.name)) {
            cooldowns.set(command.data.name, new Map());
        }

        const now = Date.now();
        const timestamps = cooldowns.get(command.data.name);
        const cooldownAmount = (command.cooldown ?? 3) * 1000;

        if (timestamps.has(interaction.user.id)) {
            const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;

            if (now < expirationTime) {
                // Ensure non-negative timeLeft (avoid tiny negative values due to timing)
                const timeLeft = Math.max(0, (expirationTime - now) / 1000);
                return interaction.reply({
                    content: `⏳ กรุณารอ ${timeLeft.toFixed(1)} วินาที ก่อนใช้คำสั่ง \`${command.data.name}\` อีกครั้ง`,
                    flags: MessageFlags.Ephemeral,
                });
            }
        }

        timestamps.set(interaction.user.id, now);
        // Clamp timeout to at least 1ms to avoid negative-duration warnings
        const timeoutDelay = Math.max(1, cooldownAmount);
        setTimeout(() => timestamps.delete(interaction.user.id), timeoutDelay);

        try {
            await command.execute(interaction, client);
        } catch (error) {
            console.error(`Error executing ${interaction.commandName}:`, error);
            
            const errorMessage = {
                content: '❌ เกิดข้อผิดพลาดในการทำงานคำสั่งนี้',
                flags: MessageFlags.Ephemeral,
            };

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        }
    },
};
