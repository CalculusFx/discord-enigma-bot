import { check } from '../src/services/moderation/providers/heuristicProvider.js';

const samples = [
  { text: 'สวัสดีทุกคน นี่คือข้อความปกติ', expect: false },
  { text: 'ควย นี่คือคำหยาบ', expect: true },
  { text: 'สัสสัสสัสสัสสัส', expect: true },
  { text: 'http://a.com http://b.com http://c.com', expect: true },
  { text: 'อยากเล่นสล็อต', expect: true }
];

for (const s of samples) {
  const res = check(s.text, {});
  console.log('INPUT:', s.text);
  console.log('RESULT:', res);
  console.log('EXPECTED VIOLATION:', s.expect, '\n');
}
