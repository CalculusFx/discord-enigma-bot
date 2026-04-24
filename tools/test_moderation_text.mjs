import { check } from '../src/services/moderation/providers/heuristicProvider.js';
import config from '../src/config.js';

async function run(text) {
  const res = await check(text, config, '1136020567158440086');
  console.log('Input:', text);
  console.log('Result:', res);
}

const arg = process.argv.slice(2).join(' ') || 'ควยบอท';
run(arg).catch(err => console.error(err));
