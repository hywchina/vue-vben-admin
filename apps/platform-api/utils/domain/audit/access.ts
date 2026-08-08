import type { CurrentIdentity } from '../../identity';

import { hasAdministratorRole } from '../../roles';

export interface AuditVisibility {
  actorId: null | string;
  scope: 'all' | 'self';
}

export function resolveAuditVisibility(
  identity: Pick<CurrentIdentity, 'id' | 'roles'>,
  requestedActorId?: string,
): AuditVisibility {
  if (hasAdministratorRole(identity.roles)) {
    return {
      actorId: requestedActorId ?? null,
      scope: 'all',
    };
  }

  return {
    actorId: identity.id,
    scope: 'self',
  };
}
