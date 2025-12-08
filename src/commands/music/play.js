import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { useMainPlayer } from 'discord-player';
import config from '../../config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('เล่นเพลงจาก YouTube, Spotify, SoundCloud และอื่นๆ')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('ชื่อเพลงหรือ URL')
                .setRequired(true)
        ),

    async execute(interaction, client) {
        const member = interaction.member;
        const channel = member.voice.channel;

        if (!channel) {
            return interaction.reply({
                content: '❌ คุณต้องอยู่ในช่องเสียงก่อน!',
                ephemeral: true,
            });
        }

        const permissions = channel.permissionsFor(interaction.client.user);
        if (!permissions.has('Connect') || !permissions.has('Speak')) {
            return interaction.reply({
                content: '❌ บอทไม่มีสิทธิ์เข้าร่วมหรือพูดในช่องเสียงนี้',
                ephemeral: true,
            });
        }

        await interaction.deferReply();

        const query = interaction.options.getString('query');
        const player = useMainPlayer();

        try {
            // v7 API
            const result = await player.search(query, {
                requestedBy: interaction.user,
            });

            if (!result || !result.tracks || result.tracks.length === 0) {
                return interaction.followUp({
                    content: `❌ ไม่พบเพลง: **${query}**`,
                });
            }

            const { track } = await player.play(channel, result, {
                nodeOptions: {
                    metadata: {
                        channel: interaction.channel,
                        client: interaction.guild.members.me,
                        requestedBy: interaction.user,
                    },
                    volume: config.defaultVolume,
                    leaveOnEmpty: config.music.leaveOnEmpty,
                    leaveOnEmptyCooldown: config.music.leaveOnEmptyCooldown,
                    leaveOnEnd: config.music.leaveOnEnd,
                    leaveOnEndCooldown: config.music.leaveOnEndCooldown,
                    selfDeaf: true,
                },
            });

            const embed = new EmbedBuilder()
                .setColor(config.colors.music)
                .setTitle('🎵 เพิ่มในคิว')
                .setDescription(`**[${track.title}](${track.url})**`)
                .setThumbnail(track.thumbnail)
                .addFields(
                    { name: '⏱️ ระยะเวลา', value: track.duration, inline: true },
                    { name: '👤 ศิลปิน', value: track.author, inline: true },
                    { name: '📝 แหล่งที่มา', value: track.source, inline: true },
                )
                .setFooter({ text: `ขอโดย ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

            return interaction.followUp({ embeds: [embed] });

        } catch (error) {
            console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.error('❌ PLAY COMMAND ERROR:');
            console.error('Error Message:', error.message);
            console.error('Error Name:', error.name);
            console.error('Error Code:', error.code);
            console.error('Stack Trace:', error.stack);
            console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            
            return interaction.followUp({
                content: `❌ เกิดข้อผิดพลาด: ${error.message}\n\`\`\`${error.stack?.split('\n').slice(0, 3).join('\n')}\`\`\``,
            }).catch(() => {
                interaction.followUp({
                    content: `❌ เกิดข้อผิดพลาด: ${error.message}`,
                });
            });
        }
    },
};
