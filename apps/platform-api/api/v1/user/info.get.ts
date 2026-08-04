import { requireIdentity } from '~/utils/identity';
import { apiHandler } from '~/utils/response';

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  return {
    avatar: '/rail-logo.svg',
    department: identity.department,
    email: identity.email,
    homePath: identity.homePath,
    id: identity.id,
    introduction: identity.introduction,
    realName: identity.realName,
    roles: identity.roles,
    username: identity.username,
  };
});
