import config from '../src/config.js';
import * as openaiProvider from '../src/services/moderation/providers/openaiProvider.js';

async function run() {
    console.log('OpenAI API key configured?', !!config.openai?.apiKey);

    const samples = [
        'Hello this is a normal message',
        'I will kill you',
        'ควย นี่คือคำหยาบ',
    ];

    for (const s of samples) {
        try {
            const res = await openaiProvider.check(s, config);
            console.log('INPUT:', s);
            console.log('RESULT:', res);
        } catch (err) {
            console.error('Provider error:', err);
        }
    }
}

run();
