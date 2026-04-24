import { ModerationService } from '../src/services/moderation/moderationService.js';

(async () => {
  const svc = new ModerationService();
  // no client is set; notifyAdmins should return early without throwing
  await svc.notifyAdmins('ทดสอบ55555', 'repetition', { guildId: null, patternId: 9999 });
  console.log('notifyAdmins ran without throwing');
})();
