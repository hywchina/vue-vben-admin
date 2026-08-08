export const PLATFORM_ROLE_CODES = ['admin', 'user'] as const;

export function hasAdministratorRole(roles: readonly string[]) {
  return roles.includes('admin');
}
