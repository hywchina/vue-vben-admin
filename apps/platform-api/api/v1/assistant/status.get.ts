import { getConfig } from '~/utils/config';
import { requireIdentity } from '~/utils/identity';
import { apiHandler } from '~/utils/response';

export default apiHandler(async (event) => {
  await requireIdentity(event);
  const config = getConfig();
  return {
    configured: Boolean(config.aiAssistantApiUrl && config.aiAssistantApiKey),
    maxAttachmentBytes: config.aiAssistantMaxAttachmentBytes,
    model: config.aiAssistantModel,
    provider: config.aiAssistantApiUrl?.includes('geekai.')
      ? 'GeekAI'
      : config.aiAssistantApiUrl
        ? 'OpenAI 兼容服务'
        : null,
  };
});
