import { detectAssistantProvider } from '~/utils/assistant-provider';
import { getConfig } from '~/utils/config';
import { requireIdentity } from '~/utils/identity';
import { apiHandler } from '~/utils/response';

export default apiHandler(async (event) => {
  await requireIdentity(event);
  const config = getConfig();
  return {
    configured: Boolean(config.aiAssistantApiUrl && config.aiAssistantApiKey),
    maxAttachmentBytes: config.aiAssistantMaxAttachmentBytes,
    maxImagesPerMessage: config.aiAssistantMaxImagesPerMessage,
    model: config.aiAssistantModel,
    provider: detectAssistantProvider(config.aiAssistantApiUrl),
  };
});
