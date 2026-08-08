import { getConfig } from '~/utils/config';
import { requireIdentity } from '~/utils/identity';
import { apiHandler } from '~/utils/response';

export default apiHandler(async (event) => {
  await requireIdentity(event);
  const config = getConfig();
  let provider: null | string = null;
  if (config.aiAssistantApiUrl) {
    provider = config.aiAssistantApiUrl.includes('geekai.')
      ? 'GeekAI'
      : 'OpenAI 兼容服务';
  }
  return {
    configured: Boolean(config.aiAssistantApiUrl && config.aiAssistantApiKey),
    maxAttachmentBytes: config.aiAssistantMaxAttachmentBytes,
    model: config.aiAssistantModel,
    provider,
  };
});
