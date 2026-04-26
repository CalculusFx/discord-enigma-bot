// Apply timer clamp polyfill early to avoid Node TimeoutNegativeWarning from negative timeouts
import './polyfills/timerClamp.js';

// Auto-detect yt-dlp path so youtube-dl-exec finds it on any platform (Railway/Linux/macOS)
if (!process.env.YOUTUBE_DL_DIR) {
    try {
        const { execSync } = await import('child_process');
        const ytdlpPath = execSync('which yt-dlp 2>/dev/null || command -v yt-dlp 2>/dev/null').toString().trim();
        if (ytdlpPath) {
            const { dirname } = await import('path');
            process.env.YOUTUBE_DL_DIR = dirname(ytdlpPath);
            console.log('[yt-dlp] Auto-detected path:', process.env.YOUTUBE_DL_DIR);
        }
    } catch { console.warn('[yt-dlp] Could not auto-detect path, using default'); }
}

// CRITICAL: Import encryption libraries BEFORE discord.js
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import '@discord-player/ffmpeg';

// Force load all encryption libraries
try { require('sodium-native'); } catch(e) {}
try { require('libsodium-wrappers'); } catch(e) {}
try { require('@stablelib/xchacha20poly1305'); } catch(e) {}
try { require('@noble/ciphers/chacha'); } catch(e) {}
try { require('@noble/ciphers/webcrypto'); } catch(e) {}
try { require('tweetnacl'); } catch(e) {}

import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import { Player } from 'discord-player';
import { YoutubeiExtractor } from 'discord-player-youtubei';
import { DefaultExtractors } from '@discord-player/extractor';
import { readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';
import { initDatabase } from './services/database.js';
import { ModerationService } from './services/moderation/moderationService.js';
import { TTSService } from './services/tts/ttsService.js';
import dotenv from 'dotenv';
dotenv.config();


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
    partials: [Partials.Message, Partials.Channel],
});

// Initialize collections
client.commands = new Collection();
client.cooldowns = new Collection();

// Initialize services
client.moderationService = new ModerationService();
// provide client reference for moderation notifications
if (client.moderationService && typeof client.moderationService.setClient === 'function') {
    client.moderationService.setClient(client);
}
client.ttsService = new TTSService();

// Initialize music player (v7)
const player = new Player(client, {
    skipFFmpeg: false,
    ytdlOptions: {
        quality: 'highestaudio',
        highWaterMark: 1 << 25,
    },
});

// Load extractors - v7 uses loadMulti
await player.extractors.register(YoutubeiExtractor, {
    useYoutubeDL: true,
});
await player.extractors.loadMulti(DefaultExtractors);

client.player = player;

// Load commands
async function loadCommands() {
    const commandsPath = join(__dirname, 'commands');
    const commandFolders = readdirSync(commandsPath).filter(item => {
        const fullPath = join(commandsPath, item);
        const stat = statSync(fullPath);
        return stat.isDirectory();
    });

    for (const folder of commandFolders) {
        const folderPath = join(commandsPath, folder);
        const commandFiles = readdirSync(folderPath).filter(file => file.endsWith('.js'));
        
        for (const file of commandFiles) {
            const filePath = join(folderPath, file);
            const command = await import(filePath);
            
            if ('data' in command.default && 'execute' in command.default) {
                client.commands.set(command.default.data.name, command.default);
                console.log(`✅ Loaded command: ${command.default.data.name}`);
            } else {
                console.log(`⚠️ Command at ${filePath} is missing required properties`);
            }
        }
    }
}

// Load events
async function loadEvents() {
    const eventsPath = join(__dirname, 'events');
    const eventFiles = readdirSync(eventsPath).filter(file => file.endsWith('.js'));

    for (const file of eventFiles) {
        const filePath = join(eventsPath, file);
        const event = await import(filePath);
        
        if (event.default.once) {
            client.once(event.default.name, (...args) => event.default.execute(...args, client));
        } else {
            client.on(event.default.name, (...args) => event.default.execute(...args, client));
        }
        console.log(`✅ Loaded event: ${event.default.name}`);
    }
}

// Player events
player.events.on('playerStart', (queue, track) => {
    const embed = {
        color: config.colors.music,
        title: '🎵 กำลังเล่น',
        description: `**[${track.title}](${track.url})**`,
        thumbnail: { url: track.thumbnail },
        fields: [
            { name: 'ระยะเวลา', value: track.duration, inline: true },
            { name: 'ขอโดย', value: track.requestedBy?.toString() || 'Unknown', inline: true },
        ],
    };
    queue.metadata.channel.send({ embeds: [embed] });
});

player.events.on('audioTrackAdd', (queue, track) => {
    if (queue.tracks.size > 0) {
        queue.metadata.channel.send(`✅ เพิ่ม **${track.title}** ในคิวแล้ว (ลำดับที่ ${queue.tracks.size})`);
    }
});

player.events.on('emptyQueue', (queue) => {
    queue.metadata.channel.send('🎵 คิวเพลงหมดแล้ว');
});

player.events.on('error', (queue, error) => {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ PLAYER ERROR EVENT:');
    console.error('Error Message:', error.message);
    console.error('Error Name:', error.name);
    console.error('Error Code:', error.code);
    console.error('Error Stack:', error.stack);
    console.error('Queue Guild:', queue?.guild?.name);
    console.error('Current Track:', queue?.currentTrack?.title);
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    if (queue?.metadata?.channel) {
        queue.metadata.channel.send(`❌ เกิดข้อผิดพลาด: ${error.message}`).catch(() => {});
    }
});

player.events.on('playerError', (queue, error) => {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ PLAYER ERROR (playerError event):');
    console.error('Error Message:', error.message);
    console.error('Error Name:', error.name);
    console.error('Error Code:', error.code);
    console.error('Error Stack:', error.stack);
    console.error('Queue Guild:', queue?.guild?.name);
    console.error('Current Track:', queue?.currentTrack?.title);
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    if (queue?.metadata?.channel) {
        queue.metadata.channel.send(`❌ เกิดข้อผิดพลาดในการเล่นเพลง: ${error.message}`).catch(() => {});
    }
});

player.events.on('debug', async (queue, message) => {
    console.log(`[Player Debug]: ${message}`);
});

player.events.on('connection', (queue) => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ VOICE CONNECTION ESTABLISHED:');
    console.log('Guild:', queue.guild.name);
    console.log('Channel:', queue.channel?.name);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});

player.events.on('disconnect', (queue) => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔌 VOICE DISCONNECTED:');
    console.log('Guild:', queue.guild.name);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});

// Initialize and start
async function start() {
    try {
        // Initialize database
        await initDatabase();
        console.log('✅ Database initialized');

        // Load commands and events
        await loadCommands();
        await loadEvents();

        // Login
        await client.login(config.token);
    } catch (error) {
        console.error('Failed to start bot:', error);
        process.exit(1);
    }
}

start();
