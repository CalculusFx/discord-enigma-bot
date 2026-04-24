import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
} from '@discordjs/voice';
import OpenAI from 'openai';
import { createWriteStream, unlinkSync, existsSync, mkdirSync } from 'fs';
import { promises as fsPromises } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import config from '../../config.js';
import crypto from 'crypto';


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const tempDir = join(__dirname, '../../../temp');
if (!existsSync(tempDir)) {
  mkdirSync(tempDir, { recursive: true });
}

export class TTSService {
  constructor() {
    console.log("===== DEBUG OPENAI KEY CHECK =====");
    console.log("ENV OPENAI_API_KEY:", process.env.OPENAI_API_KEY);
    console.log("CONFIG OPENAI:", config.openai.apiKey);
    console.log("==================================");

    // initialize runtime state
    this.connections = new Map();
    this.queues = new Map();
    this.language = config.tts.language || 'th';
    this.isSpeaking = new Map();

    // runtime-openai client holder (per-call)
    this.openai = null;

    // voice selection
    const allowedVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
    const gender = (config.tts.gender || 'male').toLowerCase();
    if (config.tts.voice && allowedVoices.includes(config.tts.voice)) {
      this.voice = config.tts.voice;
    } else if (gender === 'female') {
      this.voice = 'nova';
    } else if (gender === 'male') {
      this.voice = 'onyx';
    } else {
      this.voice = 'onyx';
    }

    console.log('[TTS] selected voice =', this.voice, ' gender preference =', gender);
    this.model = config.tts.model || 'gpt-4o-mini-tts';

    this._ttsInstructions = config.tts.instructions || `พูดแบบเป็นกันเอง สดใส มีชีวิตชีวา โทนอบอุ่นเหมือนเพื่อนคุยกัน ไม่แข็งทื่อ ออกเสียงลื่นไหลเป็นธรรมชาติ มีน้ำเสียงขึ้นลงนิดหน่อยให้ฟังสบาย ไม่ราบเรียบเกินไป`;

    this.rateState = {
      lastRefill: Date.now(),
      tokens: config.tts.rateLimit?.perMinute || 30,
    };

    if (config.tts.cache?.enabled) {
      try { mkdirSync(config.tts.cache.dir, { recursive: true }); } catch {}
    }

    this.stats = { cacheHits: 0, cacheMisses: 0, lastOpenAIResponse: null };
  }

  _getRuntimeOpenAIKey() {
    const raw = process.env.OPENAI_API_KEY || config.openai.apiKey || '';
    if (!raw) return null;
    const cleaned = String(raw).trim().replace(/^['"]|['"]$/g, '');
    return cleaned.length > 0 ? cleaned : null;
  }

  _preprocessTextForTTS(text) {
    if (!text || typeof text !== 'string') return '';
    let t = text.trim();
    // Ensure sentence ends with punctuation for better prosody
    if (!/[.!?؟｡。]$/.test(t)) t = t + '.';
    // Collapse excessive whitespace
    t = t.replace(/\s+/g, ' ');
    return t;
  }

  cleanUsername(username) {
    if (!username) return 'ผู้ใช้';
    const s = String(username).normalize('NFKC');
    let out = '';
    for (const ch of s) {
      const code = ch.codePointAt(0);
      if (!code) continue;
      // allow ASCII printable (includes common punctuation)
      if (code >= 0x20 && code <= 0x7e) {
        out += ch;
        continue;
      }
      // allow Thai block
      if (code >= 0x0e00 && code <= 0x0e7f) {
        out += ch;
        continue;
      }
      // allow letters/numbers/punctuation from other scripts
      try {
        if (/\p{L}/u.test(ch) || /\p{N}/u.test(ch) || /\p{P}/u.test(ch)) {
          out += ch;
          continue;
        }
      } catch (e) {
        // fallback: skip character on any regex issue
        continue;
      }
    }
    out = out.trim();
    return out.length > 0 ? out : 'ผู้ใช้';
  }

  // Remove surrounding decorative characters and fallback to username when needed
  sanitizeDisplayName(displayName, usernameFallback) {
    let name = String(displayName || '').trim();
    if (!name) name = String(usernameFallback || '').trim();

    // Strip decorative characters + surrounding spaces from both ends (loop until stable)
    const decorations = '◈◇◆★☆•●▫▪◦○◎◇✦✧✩✪꙳ꕀ«»"' + "'" + '[](){}<>—-–·';
    const escaped = decorations.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const decRegex = new RegExp(`^[\\s${escaped}]+|[\\s${escaped}]+$`, 'g');
    let prev;
    do { prev = name; name = name.replace(decRegex, '').trim(); } while (name !== prev);

    // If after stripping decorations it's empty, fallback to usernameFallback trimmed
    if (!name && usernameFallback) name = String(usernameFallback).trim();

    // final safety: if still empty return generic
    if (!name) return 'ผู้ใช้';
    return name;
  }

  async announceJoin(channel, username) {
    if (!channel) { console.log('[TTS] announceJoin: no channel'); return; }
    const member = channel.guild?.members?.cache?.find(m => this.cleanUsername(m.displayName) === this.cleanUsername(username)) || null;
    const fallback = member?.user?.username || null;
    const cleanName = this.sanitizeDisplayName(username, fallback);
    const text = `ยินดีต้อนรับ! ${cleanName} เข้าร่วมห้องเสียงครับ`;
    console.log('[TTS] announceJoin → speak:', JSON.stringify(text), 'channel:', channel.id);
    await this.speak(channel, text);
  }

  async announceLeave(channel, username) {
    if (!channel) { console.log('[TTS] announceLeave: no channel'); return; }
    const member = channel.guild?.members?.cache?.find(m => this.cleanUsername(m.displayName) === this.cleanUsername(username)) || null;
    const fallback = member?.user?.username || null;
    const cleanName = this.sanitizeDisplayName(username, fallback);
    const text = `${cleanName} ออกจากห้องเสียงแล้วครับ`;
    console.log('[TTS] announceLeave → speak:', JSON.stringify(text), 'channel:', channel.id);
    await this.speak(channel, text);
  }

  async speak(channel, text) {
    if (!channel || !channel.guild) { console.log('[TTS] speak: invalid channel'); return; }
    const channelId = channel.id;

    if (!this.queues.has(channelId)) this.queues.set(channelId, []);
    const q = this.queues.get(channelId);
    // ถ้า queue เต็มแล้ว (> 2) ตัดทิ้ง — ไม่งั้นจะค้างอ่านประกาศเก่าเป็นชั่วโมง
    if (q.length >= 2) { console.log('[TTS] queue full, dropping:', text); return; }
    q.push(String(text || ''));

    console.log('[TTS] speak() queued, isSpeaking=', this.isSpeaking.get(channelId), 'queueLen=', q.length);

    // ถ้ากำลังพูดอยู่แล้ว ข้อความจะถูก process ต่อโดย while loop ที่กำลังทำงานอยู่
    if (this.isSpeaking.get(channelId)) return;

    // lock ก่อน เพื่อป้องกัน race condition จากการเรียกพร้อมกัน
    this.isSpeaking.set(channelId, true);

    while ((this.queues.get(channelId) || []).length > 0) {
      const next = this.queues.get(channelId).shift();
      try {
        await this._playTTSOnce(channel, next);
      } catch (err) {
        console.error('[TTS] Error playing TTS:', err?.message || err);
      }
    }

    this.isSpeaking.set(channelId, false);
  }

  // Ensure voice connection is ready — reuse existing if still alive
  async _ensureConnection(channel) {
    const channelId = channel.id;
    const guildId = channel.guild.id;
    const joinTimeout = Number(config.tts.joinTimeoutMs) || 10000;
    const maxRetries = Number(config.tts.joinRetries) || 3;

    let connection = this.connections.get(channelId);
    let lastErr = null;

    const BAD_STATES = [VoiceConnectionStatus.Destroyed, VoiceConnectionStatus.Disconnected];

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      if (!connection || BAD_STATES.includes(connection.state.status)) {
        try {
          connection = joinVoiceChannel({
            channelId: channel.id,
            guildId,
            adapterCreator: channel.guild.voiceAdapterCreator,
            selfDeaf: false,
          });
          this.connections.set(channelId, connection);
        } catch (err) {
          lastErr = err;
          console.error('[TTS] joinVoiceChannel failed attempt', attempt, err?.message);
          await new Promise(r => setTimeout(r, Math.max(1, 400 * attempt)));
          continue;
        }
      }

      try {
        await entersState(connection, VoiceConnectionStatus.Ready, joinTimeout);
        return connection;
      } catch (err) {
        lastErr = err;
        console.error('[TTS] entersState failed attempt', attempt, err?.message);
        try { connection.destroy(); } catch {}
        this.connections.delete(channelId);
        connection = null;
        await new Promise(r => setTimeout(r, Math.max(1, 400 * attempt)));
      }
    }

    throw lastErr || new Error('Could not establish voice connection');
  }

  // Schedule auto-disconnect after idle (30s) — cancels if new speech starts
  _scheduleDisconnect(channelId, guildId, client) {
    if (this._disconnectTimers) clearTimeout(this._disconnectTimers.get(channelId));
    if (!this._disconnectTimers) this._disconnectTimers = new Map();
    const timer = setTimeout(() => {
      const hasMusic = client?.player?.nodes?.cache?.get(guildId)?.isPlaying();
      if (hasMusic) return;
      const conn = this.connections.get(channelId);
      if (conn && conn.state.status !== VoiceConnectionStatus.Destroyed) {
        conn.destroy();
        this.connections.delete(channelId);
        console.log('[TTS] Auto-disconnected from', channelId);
      }
    }, 30000);
    this._disconnectTimers.set(channelId, timer);
  }

  // Internal: play a single TTS text (used by the queue processor)
  async _playTTSOnce(channel, text) {
    try {
      const guildId = channel.guild.id;
      const channelId = channel.id;

      console.log('[TTS] ▶ _playTTSOnce start:', text, '| channel:', channelId);

      // Check per-guild/channel TTS settings before speaking
      try {
        const db = await import('../database.js');
        if (!db.isTtsEnabledForChannel(guildId, channelId)) {
          console.log('[TTS] ✗ TTS disabled for this channel/guild');
          return;
        }
      } catch (e) {
        console.log('[TTS] DB check skipped:', e?.message);
      }

      const musicQueue = channel.guild.client.player?.nodes?.cache?.get(guildId);
      const wasPlaying = musicQueue?.isPlaying();
      if (wasPlaying) {
        musicQueue.node.pause();
        console.log('[TTS] Paused music for announcement');
      }

      const filename = `tts_${Date.now()}.mp3`;
      const filepath = join(tempDir, filename);

      console.log('[TTS] Generating audio + connecting VC in parallel...');

      // Generate audio AND connect to VC in parallel — cuts latency significantly
      const [connection] = await Promise.all([
        this._ensureConnection(channel),
        this.generateTTS(text, filepath),
      ]);

      // Cancel any pending auto-disconnect since we're about to speak
      if (this._disconnectTimers) clearTimeout(this._disconnectTimers.get(channelId));

      console.log('[TTS] Creating audio player, file exists:', existsSync(filepath));

      // Wrap player in Promise so we properly await playback completion
      await new Promise((resolve) => {
        const player = createAudioPlayer();
        const resource = createAudioResource(filepath);
        connection.subscribe(player);

        let resolved = false;
        const cleanup = (reason) => {
          if (resolved) return;
          resolved = true;
          player.removeAllListeners();
          console.log('[TTS] Player done, reason:', reason);
          try { if (existsSync(filepath)) unlinkSync(filepath); } catch {}
          if (wasPlaying && musicQueue) {
            setTimeout(() => {
              if (musicQueue.node.isPaused()) {
                musicQueue.node.resume();
                console.log('[TTS] Resumed music after announcement');
              }
            }, 300);
          } else {
            // ออกจาก voice channel ทันทีหลังอ่านจบ
            const conn = this.connections.get(channelId);
            if (conn && conn.state.status !== VoiceConnectionStatus.Destroyed) {
              conn.destroy();
              this.connections.delete(channelId);
            }
          }
          resolve();
        };

        player.on('stateChange', (oldState, newState) => {
          console.log('[TTS] Player state:', oldState.status, '→', newState.status);
          const done = newState.status === AudioPlayerStatus.Idle || newState.status === AudioPlayerStatus.AutoPaused;
          if (done && oldState.status !== AudioPlayerStatus.Idle) {
            cleanup(newState.status);
          }
        });

        player.once('error', error => {
          console.error('[TTS] Player error:', error?.message || error);
          if (wasPlaying && musicQueue) musicQueue.node.resume();
          cleanup('error');
        });

        try {
          player.play(resource);
          console.log('[TTS] player.play() called, current state:', player.state.status);
        } catch (playErr) {
          console.error('[TTS] player.play() threw:', playErr?.message || playErr);
          cleanup('play-error');
        }
      });

    } catch (error) {
      console.error('TTS _playTTSOnce error:', error);
    }
  }

  async generateTTS(text, filepath) {
    if (config.tts.rateLimit?.enabled) {
      const now = Date.now();
      const elapsed = now - this.rateState.lastRefill;
      const refill =
        Math.floor(elapsed / 60000) * (config.tts.rateLimit.perMinute || 30);
      if (refill > 0) {
        this.rateState.tokens = Math.min(
          config.tts.rateLimit.perMinute || 30,
          this.rateState.tokens + refill
        );
        this.rateState.lastRefill = now;
      }
      if (this.rateState.tokens <= 0) {
        console.warn('TTS rate limit exceeded; using fallback gTTS');
        return this.generateGoogleTTS(text, filepath);
      }
      this.rateState.tokens -= 1;
    }

    if (config.tts.cache?.enabled) {
      try {
        const hash = crypto
          .createHash('sha256')
          .update(text + '|' + this.language)
          .digest('hex');
        const cacheFile = join(config.tts.cache.dir, `${hash}.mp3`);
        const stat = await fsPromises.stat(cacheFile).catch(() => null);
        if (stat) {
          const age = (Date.now() - stat.mtimeMs) / 1000;
          if (age < (config.tts.cache.ttlSeconds || 86400)) {
            await fsPromises.copyFile(cacheFile, filepath);
            this.stats.cacheHits++;
            return;
          }
        }
        this.stats.cacheMisses++;
      } catch (err) {
        console.warn('TTS cache check failed:', err?.message || err);
      }
    }

    const runtimeKey = this._getRuntimeOpenAIKey();
    const provider =
      config.tts.provider === 'auto' ? (runtimeKey ? 'openai' : 'google') : config.tts.provider;

    if (provider === 'openai') {
      if (!runtimeKey) {
        console.warn('[TTS] OpenAI provider selected but no runtime key found; using Google gTTS');
        await this.generateGoogleTTS(text, filepath);
      } else {
        // create a short-lived OpenAI client with explicit 12s timeout (default is 10 minutes!)
        this.openai = new OpenAI({ apiKey: runtimeKey, timeout: 12000, maxRetries: 0 });
        if (config.tts.debug) console.log('[TTS] Using OpenAI key (masked):', (runtimeKey || '').slice(0, 8) + '...');
        try {
          await this.generateOpenAITTS(text, filepath);
        } catch (err) {
          console.error('OpenAI TTS failed, falling back to Google gTTS:', err?.message || err);
          await this.generateGoogleTTS(text, filepath);
        } finally {
          // avoid retaining client/key
          this.openai = null;
        }
      }
    } else {
      await this.generateGoogleTTS(text, filepath);
    }

    if (config.tts.cache?.enabled) {
      try {
        const hash = crypto
          .createHash('sha256')
          .update(text + '|' + this.language)
          .digest('hex');
        const cacheFile = join(config.tts.cache.dir, `${hash}.mp3`);
        await fsPromises.copyFile(filepath, cacheFile).catch(() => null);
      } catch (err) {
        console.warn('TTS cache write failed:', err?.message || err);
      }
    }
  }

  async generateOpenAITTS(text, filepath) {
    if (!this.openai) throw new Error('OpenAI client not configured');
    const voice = this.voice || 'coral';
    const model = this.model || 'gpt-4o-mini-tts';

    const prepared = this._preprocessTextForTTS(text);

    try {
      const payload = { model, voice, input: prepared };
      if (this._ttsInstructions) payload.instructions = this._ttsInstructions;

      const mp3 = await this.openai.audio.speech.create(payload);

      let arrayBuffer = null;
      try {
        if (typeof mp3.arrayBuffer === 'function') {
          arrayBuffer = await mp3.arrayBuffer();
        } else if (mp3.data && typeof mp3.data.arrayBuffer === 'function') {
          arrayBuffer = await mp3.data.arrayBuffer();
        }
      } catch {}

      const fs = await import('fs');

      if (arrayBuffer) {
        const buffer = Buffer.from(arrayBuffer);
        await fs.promises.writeFile(filepath, buffer);
      } else if (mp3.data && Buffer.isBuffer(mp3.data)) {
        await fs.promises.writeFile(filepath, mp3.data);
      } else {
        if (config.tts.debug) {
          this.stats.lastOpenAIResponse = {
            status: mp3.status || 200,
            body: '[non-binary response]',
          };
        }
        throw new Error('OpenAI TTS returned unexpected payload');
      }

      if (config.tts.debug) {
        try {
          this.stats.lastOpenAIResponse = {
            status: mp3.status || 200,
            body: '[binary audio]',
          };
        } catch {}
      }

      return;
    } catch (err) {
      console.warn('OpenAI SDK TTS attempt failed:', err?.message || err);
    }

    const fetch = (await import('node-fetch')).default;
    const apiKey =
      this.openai.apiKey ||
      this.openai?.configuration?.apiKey ||
      process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OpenAI API key not found for TTS');

    const url = 'https://api.openai.com/v1/audio/speech';
    const body = JSON.stringify({ model, voice, input: prepared });

    const abortCtrl = new AbortController();
    const abortTimer = setTimeout(() => abortCtrl.abort(), 12000);
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body,
      signal: abortCtrl.signal,
    }).finally(() => clearTimeout(abortTimer));

    const respBodyText = await resp.clone().text().catch(() => '[binary]');
    if (config.tts.debug) {
      this.stats.lastOpenAIResponse = { status: resp.status, body: respBodyText };
      console.debug('[TTS][OpenAI HTTP] status=', resp.status, 'body=', respBodyText);
    }
    if (!resp.ok) {
      throw new Error(`OpenAI TTS HTTP ${resp.status} ${respBodyText || ''}`);
    }

    const stream = (await import('fs')).createWriteStream(filepath);
    return new Promise((resolve, reject) => {
      resp.body.pipe(stream);
      resp.body.on('error', reject);
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
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

  // Disconnect can accept a channelId (preferred) or a guildId (will close all channel connections in that guild)
  disconnect(id) {
    if (!id) return;
    // If there's a direct channel connection matching id, remove it
    const channelConn = this.connections.get(id);
    if (channelConn) {
      try { channelConn.destroy(); } catch {}
      this.connections.delete(id);
      return;
    }

    // Otherwise treat id as a guildId and destroy any connections that belong to that guild
    for (const [chanId, conn] of Array.from(this.connections.entries())) {
      try {
        if (conn && conn.joinConfig && String(conn.joinConfig.guildId) === String(id)) {
          try { conn.destroy(); } catch {}
          this.connections.delete(chanId);
        }
      } catch {}
    }
  }
}