import { TTSService } from '../src/services/tts/ttsService.js';

(async () => {
  const t = new TTSService();
  try {
    await t.generateTTS('ทดสอบเสียง OpenAI', './temp/tts_local_test.mp3');
    console.log('done');
  } catch (e) {
    console.error('generateTTS error:', e);
    process.exit(1);
  }
})();
