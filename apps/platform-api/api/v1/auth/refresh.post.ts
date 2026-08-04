import {
  clearRefreshCookie,
  getRefreshCookie,
  setRefreshCookie,
} from '~/utils/cookies';
import { loadIdentity } from '~/utils/identity';
import { ApiError, apiHandler } from '~/utils/response';
import { rotateSession } from '~/utils/sessions';
import { createAccessToken } from '~/utils/tokens';

export default apiHandler(async (event) => {
  const currentToken = getRefreshCookie(event);
  if (!currentToken) {
    throw new ApiError(401, 'REFRESH_TOKEN_MISSING', '刷新会话不存在');
  }

  const rotated = await rotateSession(event, currentToken);
  if (!rotated) {
    clearRefreshCookie(event);
    throw new ApiError(401, 'REFRESH_TOKEN_INVALID', '刷新会话已失效');
  }

  const identity = await loadIdentity(rotated.userId);
  if (!identity) {
    clearRefreshCookie(event);
    throw new ApiError(401, 'USER_DISABLED', '账号已停用');
  }
  event.context.identity = identity;

  setRefreshCookie(event, rotated.refreshToken);
  return await createAccessToken(identity);
});
