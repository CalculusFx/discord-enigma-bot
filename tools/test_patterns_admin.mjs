import { ModerationService } from '../src/services/moderation/moderationService.js';
import { listLearnedPatterns, removeLearnedPattern, updateLearnedPatternConfidence } from '../src/services/database.js';

(async () => {
  const svc = new ModerationService();
  console.log('Initial patterns (top 5):', listLearnedPatterns(5));

  console.log('Removing id=1');
  console.log('remove result:', removeLearnedPattern(1));
  svc.reloadLearnedData();

  console.log('After remove, top 5:', listLearnedPatterns(5));

  // promote id 2 by 0.2
  console.log('Promote id=2 by 0.2');
  const current = listLearnedPatterns().find(p => p.id === 2);
  console.log('current:', current);
  updateLearnedPatternConfidence(2, (current?.confidence || 0) + 0.2);
  svc.reloadLearnedData();
  console.log('After promote id=2:', listLearnedPatterns().find(p => p.id === 2));

})();
