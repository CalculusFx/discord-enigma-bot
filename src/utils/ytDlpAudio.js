import { spawn } from 'child_process';

/**
 * ดึง audio stream จาก YouTube ด้วย yt-dlp
 * @param {string} url - YouTube URL
 * @returns {ReadableStream} - FFmpeg stream สำหรับ Discord
 */
export function getYtAudioStream(url) {
    // ใช้ yt-dlp ดึง audio-only stream แล้ว pipe เข้า ffmpeg แปลงเป็น opus
    // ต้องติดตั้ง yt-dlp และ ffmpeg ในระบบ
    const ytdlp = spawn('yt-dlp', [
        '-f', 'bestaudio', // ดึง stream audio ที่ดีที่สุด
        '-o', '-',        // output เป็น stdout
        url
    ]);

    ytdlp.on('error', (err) => {
        console.error('[ytDlpAudio Debug]: yt-dlp process error:', err);
    });
    ytdlp.on('close', (code, signal) => {
        console.warn(`[ytDlpAudio Debug]: yt-dlp process closed (code: ${code}, signal: ${signal})`);
    });

    // ffmpeg แปลง stream เป็น opus สำหรับ Discord
    const ffmpeg = spawn('ffmpeg', [
        '-i', 'pipe:0',
        '-f', 'opus',
        '-ar', '48000',
        '-ac', '2',
        '-application', 'audio',
        '-loglevel', 'quiet',
        'pipe:1'
    ]);

    ffmpeg.on('error', (err) => {
        console.error('[ytDlpAudio Debug]: ffmpeg process error:', err);
    });
    ffmpeg.on('close', (code, signal) => {
        console.warn(`[ytDlpAudio Debug]: ffmpeg process closed (code: ${code}, signal: ${signal})`);
    });

    // pipe yt-dlp -> ffmpeg
    ytdlp.stdout.pipe(ffmpeg.stdin);

    ytdlp.stderr.on('data', data => {
        console.error('[yt-dlp]', data.toString());
    });
    ffmpeg.stderr.on('data', data => {
        console.error('[ffmpeg]', data.toString());
    });

    ffmpeg.stdout.on('error', (err) => {
        console.error('[ytDlpAudio Debug]: ffmpeg.stdout error:', err);
    });
    ffmpeg.stdout.on('close', () => {
        console.warn('[ytDlpAudio Debug]: ffmpeg.stdout closed!');
    });

    return ffmpeg.stdout;
}
