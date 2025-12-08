import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, entersState } from '@discordjs/voice';
import OpenAI from 'openai';
import { createWriteStream, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import config from '../../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const tempDir = join(__dirname, '../../../temp');
if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true });
}

export class TTSService {
    constructor() {
        this.connections = new Map();
        this.queues = new Map();
        this.language = config.tts.language || 'th';
        this.isSpeaking = new Map();
        
        // Initialize OpenAI for natural TTS
        this.openai = config.openai.apiKey ? new OpenAI({ apiKey: config.openai.apiKey }) : null;
        
        // OpenAI TTS voices: alloy, echo, fable, onyx, nova, shimmer
        this.voice = 'nova'; // nova sounds natural and friendly
    }

    /**
     * ลบอิโมจิและอักขระพิเศษออกจากชื่อ
     */
    cleanUsername(username) {
        if (!username) return 'ผู้ใช้';
        
        // ลบอิโมจิทั้งหมด (รองรับ Unicode emoji ranges)
        let cleaned = username
            // ลบ emoji ทั่วไป
            .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Emoticons, Symbols, Pictographs
            .replace(/[\u{1F600}-\u{1F64F}]/gu, '') // Emoticons
            .replace(/[\u{1F680}-\u{1F6FF}]/gu, '') // Transport & Map Symbols
            .replace(/[\u{2600}-\u{26FF}]/gu, '')   // Miscellaneous Symbols
            .replace(/[\u{2700}-\u{27BF}]/gu, '')   // Dingbats
            .replace(/[\u{1F900}-\u{1F9FF}]/gu, '') // Supplemental Symbols and Pictographs
            .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '') // Chess Symbols
            .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '') // Symbols and Pictographs Extended-A
            .replace(/[\u{FE00}-\u{FE0F}]/gu, '')   // Variation Selectors
            .replace(/[\u{200D}]/gu, '')            // Zero Width Joiner
            // ลบอักขระพิเศษอื่นๆ
            .replace(/[^\w\s\u0E00-\u0E7F]/g, '')   // เก็บเฉพาะตัวอักษร ตัวเลข และภาษาไทย
            .trim();
        
        // ถ้าลบแล้วไม่เหลืออะไร ใช้ชื่อสำรอง
        return cleaned.length > 0 ? cleaned : 'ผู้ใช้';
    }

    async announceJoin(channel, username) {
        if (!channel) return;
        
        const cleanName = this.cleanUsername(username);
        const text = `${cleanName} เข้าร่วมแชนแนล`;
        await this.speak(channel, text);
    }

    async announceLeave(channel, username) {
        if (!channel || channel.members.filter(m => !m.user.bot).size === 0) return;
        
        const cleanName = this.cleanUsername(username);
        const text = `${cleanName} ออกจากแชนแนล`;
        await this.speak(channel, text);
    }

    async speak(channel, text) {
        try {
            const guildId = channel.guild.id;
            
            // Get music queue if exists
            const musicQueue = channel.guild.client.player?.nodes?.cache?.get(guildId);
            const wasPlaying = musicQueue?.isPlaying();
            
            // Pause music if playing
            if (wasPlaying) {
                musicQueue.node.pause();
                console.log('[TTS] Paused music for announcement');
            }

            // Generate TTS audio file
            const filename = `tts_${Date.now()}.mp3`;
            const filepath = join(tempDir, filename);
            
            await this.generateTTS(text, filepath);
            
            // Get or create voice connection
            let connection = this.connections.get(guildId);
            
            if (!connection || connection.state.status === VoiceConnectionStatus.Destroyed) {
                connection = joinVoiceChannel({
                    channelId: channel.id,
                    guildId: guildId,
                    adapterCreator: channel.guild.voiceAdapterCreator,
                    selfDeaf: false,
                });
                this.connections.set(guildId, connection);
            }

            // Wait for connection to be ready
            try {
                await entersState(connection, VoiceConnectionStatus.Ready, 5000);
            } catch {
                console.error('Voice connection timeout');
                if (wasPlaying && musicQueue) {
                    musicQueue.node.resume();
                }
                return;
            }

            this.isSpeaking.set(guildId, true);

            // Create and play audio
            const player = createAudioPlayer();
            const resource = createAudioResource(filepath);
            
            connection.subscribe(player);
            player.play(resource);

            // Clean up after playback
            player.on(AudioPlayerStatus.Idle, () => {
                this.isSpeaking.set(guildId, false);
                
                try {
                    if (existsSync(filepath)) {
                        unlinkSync(filepath);
                    }
                    
                    if (wasPlaying && musicQueue) {
                        setTimeout(() => {
                            if (musicQueue.node.isPaused()) {
                                musicQueue.node.resume();
                                console.log('[TTS] Resumed music after announcement');
                            }
                        }, 500);
                    } else {
                        setTimeout(() => {
                            const conn = this.connections.get(guildId);
                            if (conn && conn.state.status !== VoiceConnectionStatus.Destroyed) {
                                const hasActiveQueue = channel.guild.client.player?.nodes?.cache?.get(guildId)?.isPlaying();
                                if (!hasActiveQueue) {
                                    conn.destroy();
                                    this.connections.delete(guildId);
                                }
                            }
                        }, 2000);
                    }
                } catch (err) {
                    console.error('Error in cleanup:', err);
                }
            });

            player.on('error', (error) => {
                this.isSpeaking.set(guildId, false);
                console.error('TTS player error:', error);
                
                if (wasPlaying && musicQueue) {
                    musicQueue.node.resume();
                }
                
                try {
                    if (existsSync(filepath)) {
                        unlinkSync(filepath);
                    }
                } catch (err) {
                    console.error('Error deleting temp file:', err);
                }
            });

        } catch (error) {
            console.error('TTS speak error:', error);
        }
    }

    async generateTTS(text, filepath) {
        // Use Google TTS (free and reliable)
        // OpenAI TTS requires paid quota
        return this.generateGoogleTTS(text, filepath);
    }

    async generateGoogleTTS(text, filepath) {
        const gTTS = (await import('gtts')).default;
        return new Promise((resolve, reject) => {
            const gtts = new gTTS(text, this.language);
            const writeStream = createWriteStream(filepath);
            
            gtts.stream().pipe(writeStream);
            
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
        });
    }

    disconnect(guildId) {
        const connection = this.connections.get(guildId);
        if (connection) {
            connection.destroy();
            this.connections.delete(guildId);
        }
    }
}
