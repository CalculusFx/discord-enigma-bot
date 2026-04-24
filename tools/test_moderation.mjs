import { ModerationService } from '../src/services/moderation/moderationService.js';

(async () => {
  const svc = new ModerationService();
  const tests = [
    '55555',
    '5555555555',
    'โนอา ม่ายยยยยยยยยนะ',
    'ควย',
    'สัสสสส',
    'Okkkkkk',
    'hello there',
  ];

  for (const t of tests) {
    const res = await svc.checkMessage(t);
    console.log(JSON.stringify({ input: t, result: res }, null, 2));
  }
})();
