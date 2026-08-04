import { writeAudit } from '~/utils/audit';
import { clearRefreshCookie, getRefreshCookie } from '~/utils/cookies';
import { loadIdentity, requireIdentity } from '~/utils/identity';
import { apiHandler } from '~/utils/response';
import { revokeSession } from '~/utils/sessions';

export default apiHandler(async (event) => {
  const token = getRefreshCookie(event);
  const sessionUserId = token ? await revokeSession(token) : null;
  clearRefreshCookie(event);

  const identity = sessionUserId
    ? await loadIdentity(sessionUserId)
    : await requireIdentity(event).catch(() => null);
  if (identity) {
    event.context.identity = identity;
    await writeAudit(event, {
      action: 'auth.logout',
      actor: identity,
      module: 'identity',
      targetId: identity.id,
      targetType: 'user',
    });
  }
  return null;
});
