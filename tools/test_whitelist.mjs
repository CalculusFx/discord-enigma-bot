import { ModerationService } from '../src/services/moderation/moderationService.js';
import { addModerationWhitelistItem, getModerationWhitelist, removeModerationWhitelistItem } from '../src/services/database.js';

(async () => {
  const svc = new ModerationService();
  console.log('Initial check for 55555: ', await svc.checkMessage('55555'));

  const added = addModerationWhitelistItem('55555');
  console.log('Added whitelist:', added);
  svc.reloadLearnedData();

  console.log('After whitelist, check for 55555: ', await svc.checkMessage('55555'));

  // cleanup
  console.log('Removing whitelist id=', added.id, 'result=', removeModerationWhitelistItem(added.id));
  svc.reloadLearnedData();
  console.log('After removal, check for 55555: ', await svc.checkMessage('55555'));
})();
