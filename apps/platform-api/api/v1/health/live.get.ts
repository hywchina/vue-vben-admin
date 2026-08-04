import { apiHandler } from '~/utils/response';

export default apiHandler(() => ({
  service: 'platform-api',
  status: 'up',
  timestamp: new Date().toISOString(),
}));
