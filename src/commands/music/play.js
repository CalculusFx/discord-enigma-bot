import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { useMainPlayer } from 'discord-player';
import config from '../../config.js';
import { getYtAudioStream } from '../../utils/ytDlpAudio.js';
import { joinVoiceChannel, createAudioResource, StreamType, createAudioPlayer, AudioPlayerStatus, entersState, VoiceConnectionStatus } from '@discordjs/voice';

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
                flags: MessageFlags.Ephemeral,
            });
        }

        const permissions = channel.permissionsFor(interaction.client.user);
        if (!permissions.has('Connect') || !permissions.has('Speak')) {
            return interaction.reply({
                content: '❌ บอทไม่มีสิทธิ์เข้าร่วมหรือพูดในช่องเสียงนี้',
                flags: MessageFlags.Ephemeral,
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

            let track;
            if (result && result.tracks && result.tracks.length > 0) {
                // ปกติใช้ discord-player
                ({ track } = await player.play(channel, result, {
                    nodeOptions: {
                        metadata: {
                            channel: interaction.channel,
                            client: interaction.guild.members.me,
                            requestedBy: interaction.user,
                        },
                        volume: config.defaultVolume,
                        leaveOnEmpty: false,
                        leaveOnEmptyCooldown: config.music.leaveOnEmptyCooldown,
                        leaveOnEnd: false,
                        leaveOnEndCooldown: config.music.leaveOnEndCooldown,
                        bufferingTimeout: 60000,
                        selfDeaf: true,
                    },
                }));
            }

            // Fallback: ถ้า track ไม่มีเสียงหรือเล่นไม่ได้ (เฉพาะ YouTube)
            if (!track && (query.includes('youtube.com') || query.includes('youtu.be'))) {
                try {
                    // เชื่อมต่อ voice channel
                    const connection = joinVoiceChannel({
                        channelId: channel.id,
                        guildId: channel.guild.id,
                        adapterCreator: channel.guild.voiceAdapterCreator,
                    });

                    // รอ connection พร้อม
                    await entersState(connection, VoiceConnectionStatus.Ready, 30_000);

                    // สร้าง audio resource จาก yt-dlp stream
                    // Fallback: ทดสอบเล่นไฟล์ local ก่อน (test.mp3)
                    const fs = await import('fs');
                    const path = './test.mp3';
                    let resource;
                    if (fs.existsSync(path)) {
                        console.log('[Music Fallback Debug]: Playing local file test.mp3');
                        resource = createAudioResource(fs.createReadStream(path), { inputType: StreamType.Arbitrary });
                    } else {
                        // ถ้าไม่มีไฟล์ local ให้ใช้ yt-dlp/ffmpeg stream
                        const audioStream = getYtAudioStream(query);
                        console.log('[Music Fallback Debug]: audioStream typeof:', typeof audioStream);
                        if (!audioStream || typeof audioStream.read !== 'function') {
                            console.error('[Music Fallback Debug]: audioStream is not a readable stream!');
                        }
                        audioStream.on('error', (err) => {
                            console.error('[Music Fallback Debug]: audioStream error:', err);
                        });
                        audioStream.on('close', () => {
                            console.warn('[Music Fallback Debug]: audioStream closed!');
                        });
                        resource = createAudioResource(audioStream, { inputType: StreamType.Opus });
                        if (resource.playStream) {
                            resource.playStream.on('error', (err) => {
                                console.error('[Music Fallback Debug]: AudioResource playStream error:', err);
                            });
                            resource.playStream.on('close', () => {
                                console.warn('[Music Fallback Debug]: AudioResource playStream closed!');
                            });
                        }
                    }
                    const audioPlayer = createAudioPlayer();
                    audioPlayer.on('error', (err) => {
                        console.error('[Music Fallback Debug]: audioPlayer error:', err);
                    });
                    audioPlayer.play(resource);
                    connection.subscribe(audioPlayer);

                    // แจ้งเตือน fallback
                    await interaction.followUp({
                        content: `⚠️ ไม่สามารถเล่นเพลงนี้ด้วยระบบปกติ กำลังใช้ fallback yt-dlp stream...`,
                    });

                    // destroy connection เมื่อเล่นจบ
                    audioPlayer.on(AudioPlayerStatus.Idle, () => {
                        connection.destroy();
                    });
                } catch (err) {
                    return interaction.followUp({
                        content: `❌ ไม่สามารถเล่นเพลงนี้ได้: **${query}**\n\nสาเหตุที่เป็นไปได้:\n- เพลงถูกลิขสิทธิ์หรือ geo-block\n- เพลงเป็น official MV หรือมี DRM\n- ข้อจำกัดของ YouTube/Discord-player\n- หรือเพลงนี้ไม่รองรับ extractor ปัจจุบัน\n\nลองเลือกเพลงอื่นหรือใช้ลิงก์จากแหล่งอื่น เช่น SoundCloud, Spotify`,
                    });
                }
            } else if (!track) {
                return interaction.followUp({
                    content: `❌ ไม่สามารถเล่นเพลงนี้ได้: **${query}**\n\nสาเหตุที่เป็นไปได้:\n- เพลงถูกลิขสิทธิ์หรือ geo-block\n- เพลงเป็น official MV หรือมี DRM\n- ข้อจำกัดของ YouTube/Discord-player\n- หรือเพลงนี้ไม่รองรับ extractor ปัจจุบัน\n\nลองเลือกเพลงอื่นหรือใช้ลิงก์จากแหล่งอื่น เช่น SoundCloud, Spotify`,
                });
            } else {
                const isPlaylist = result.playlist && result.tracks.length > 1;
                const embed = new EmbedBuilder()
                    .setColor(config.colors.music)
                    .setFooter({ text: `ขอโดย ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

                if (isPlaylist) {
                    embed
                        .setTitle('🎶 เพิ่ม Playlist ในคิว')
                        .setDescription(`**[${result.playlist.title}](${result.playlist.url})**`)
                        .setThumbnail(result.playlist.thumbnail || track.thumbnail)
                        .addFields(
                            { name: '🎵 จำนวนเพลง', value: `${result.tracks.length} เพลง`, inline: true },
                            { name: '📝 แหล่งที่มา', value: track.source, inline: true },
                        );
                } else {
                    embed
                        .setTitle('🎵 เพิ่มในคิว')
                        .setDescription(`**[${track.title}](${track.url})**`)
                        .setThumbnail(track.thumbnail)
                        .addFields(
                            { name: '⏱️ ระยะเวลา', value: track.duration, inline: true },
                            { name: '👤 ศิลปิน', value: track.author, inline: true },
                            { name: '📝 แหล่งที่มา', value: track.source, inline: true },
                        );
                }

                return interaction.followUp({ embeds: [embed] });
            }

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
