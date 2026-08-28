import { getConfig } from '~/utils/config';
import { AiToolkitClient } from '~/utils/domain/capabilities/lora/client';
import {
  DEFAULT_LORA_BASE_MODEL,
  LORA_BASE_MODELS,
} from '~/utils/domain/capabilities/lora/template';
import { requireIdentity } from '~/utils/identity';
import { apiHandler } from '~/utils/response';

export default apiHandler(async (event) => {
  await requireIdentity(event);
  const config = getConfig();
  if (!config.loraApiUrl) {
    return {
      configured: false,
      model: DEFAULT_LORA_BASE_MODEL,
      models: LORA_BASE_MODELS,
      reachable: false,
      reason: '平台 API 尚未配置 LORA_API_URL',
    };
  }
  try {
    await new AiToolkitClient({
      apiUrl: config.loraApiUrl,
      timeoutMs: Math.min(config.loraTimeoutMs, 10_000),
      token: config.loraApiToken,
    }).healthCheck();
    return {
      configured: true,
      gpuIds: config.loraGpuIds,
      model: DEFAULT_LORA_BASE_MODEL,
      models: LORA_BASE_MODELS,
      reachable: true,
    };
  } catch {
    return {
      configured: true,
      gpuIds: config.loraGpuIds,
      model: DEFAULT_LORA_BASE_MODEL,
      models: LORA_BASE_MODELS,
      reachable: false,
      reason: 'AI Toolkit 当前不可达，请检查训练服务和网络',
    };
  }
});
