import { checkReadiness, isReady } from '~/utils/health';
import { ApiError, apiHandler } from '~/utils/response';

export default apiHandler(async () => {
  const dependencies = await checkReadiness();
  if (!isReady(dependencies)) {
    throw new ApiError(
      503,
      'SERVICE_NOT_READY',
      '服务依赖尚未就绪',
      dependencies,
    );
  }
  return {
    dependencies,
    service: 'platform-api',
    status: 'up',
    timestamp: new Date().toISOString(),
  };
});
