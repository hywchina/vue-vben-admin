import { getConfig } from '~/utils/config';
import { requireIdentity } from '~/utils/identity';
import { apiHandler } from '~/utils/response';

export default apiHandler(async (event) => {
  await requireIdentity(event);
  const config = getConfig();
  return {
    configured: Boolean(config.aiAssistantApiUrl),
    maxAttachmentBytes: config.aiAssistantMaxAttachmentBytes,
    model: config.aiAssistantModel,
  };
});
