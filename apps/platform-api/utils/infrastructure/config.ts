import process from 'node:process';

export interface PlatformConfig {
  accessTokenTtlSeconds: number;
  aiAssistantApiKey: null | string;
  aiAssistantApiUrl: null | string;
  aiAssistantMaxAttachmentBytes: number;
  aiAssistantMaxImageBytesPerRequest: number;
  aiAssistantMaxImagesPerMessage: number;
  aiAssistantModel: string;
  aiAssistantTimeoutMs: number;
  allowSelfRegistration: boolean;
  appPublicUrl: string;
  bootstrapAdminEmail: string;
  bootstrapAdminName: string;
  bootstrapAdminPassword: string;
  bootstrapAdminUsername: string;
  bootstrapUser1Email: string;
  bootstrapUser1Name: string;
  bootstrapUser1Password: string;
  bootstrapUser1Username: string;
  bootstrapUser2Email: string;
  bootstrapUser2Name: string;
  bootstrapUser2Password: string;
  bootstrapUser2Username: string;
  bootstrapDemoUsers: boolean;
  comfyuiApiToken: null | string;
  comfyuiApiUrl: null | string;
  comfyuiLeaseSeconds: number;
  comfyuiMaxOutputBytes: number;
  comfyuiPollIntervalMs: number;
  comfyuiTimeoutMs: number;
  corsAllowedOrigins: string[];
  databaseUrl: string;
  isProduction: boolean;
  jwtSecret: string;
  loraApiToken: null | string;
  loraApiUrl: null | string;
  loraDatasetsRoot: string;
  loraGpuIds: string;
  loraMaxDatasetBytes: number;
  loraMaxOutputBytes: number;
  loraModelPath: string;
  loraPollIntervalMs: number;
  loraTimeoutMs: number;
  loraVaePath: string;
  loraWorkerLeaseSeconds: number;
  maxInlineTextBytes: number;
  maxUploadBytes: number;
  passwordResetTtlMinutes: number;
  refreshTokenTtlDays: number;
  reportAiApiUrl: null | string;
  reportAiMaxOutputBytes: number;
  reportAiTemplate: string;
  reportAiTimeoutMs: number;
  s3AccessKey: string;
  s3Bucket: string;
  s3CorsOrigins: string[];
  s3Endpoint: string;
  s3ForcePathStyle: boolean;
  s3PresignTtlSeconds: number;
  s3PublicEndpoint: string;
  s3Region: string;
  s3SecretKey: string;
  smtpFromAddress: string;
  smtpFromName: string;
  smtpHost: string;
  smtpPassword: null | string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpTlsRejectUnauthorized: boolean;
  smtpUser: null | string;
}

let cachedConfig: null | PlatformConfig = null;

function booleanValue(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  return value.toLowerCase() === 'true';
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function commaSeparatedValues(value: string | undefined, fallback: string) {
  return (value ?? fallback)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function isValidOrigin(value: string) {
  try {
    const url = new URL(value);
    return url.origin === value && ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

export function validateProductionEnvironment(environment: NodeJS.ProcessEnv) {
  const issues: string[] = [];
  const requiredVariables = [
    'APP_PUBLIC_URL',
    'BOOTSTRAP_ADMIN_PASSWORD',
    'CORS_ALLOWED_ORIGINS',
    'DATABASE_URL',
    'JWT_SECRET',
    'S3_ACCESS_KEY',
    'S3_PUBLIC_ENDPOINT',
    'S3_SECRET_KEY',
  ] as const;

  for (const variable of requiredVariables) {
    const value = environment[variable]?.trim();
    if (!value) issues.push(`${variable} 未配置`);
    else if (value.includes('CHANGE_ME')) {
      issues.push(`${variable} 仍包含 CHANGE_ME 占位值`);
    }
  }

  if (environment.JWT_SECRET?.startsWith('development-only-')) {
    issues.push('JWT_SECRET 仍为开发默认值');
  } else if ((environment.JWT_SECRET?.length ?? 0) < 32) {
    issues.push('JWT_SECRET 长度至少需要 32 个字符');
  }
  if (environment.BOOTSTRAP_ADMIN_PASSWORD === 'RailAdmin123!') {
    issues.push('BOOTSTRAP_ADMIN_PASSWORD 仍为开发默认值');
  } else if ((environment.BOOTSTRAP_ADMIN_PASSWORD?.length ?? 0) < 12) {
    issues.push('BOOTSTRAP_ADMIN_PASSWORD 长度至少需要 12 个字符');
  }
  if (environment.DATABASE_URL?.includes('rail_platform_dev@')) {
    issues.push('DATABASE_URL 仍使用开发默认密码');
  }
  if (environment.S3_ACCESS_KEY === 'railminio') {
    issues.push('S3_ACCESS_KEY 仍为开发默认值');
  }
  if (environment.S3_SECRET_KEY === 'railminio-dev-secret') {
    issues.push('S3_SECRET_KEY 仍为开发默认值');
  }
  if (environment.BOOTSTRAP_DEMO_USERS?.toLowerCase() === 'true') {
    issues.push('生产环境禁止启用 BOOTSTRAP_DEMO_USERS');
  }

  const origins = commaSeparatedValues(environment.CORS_ALLOWED_ORIGINS, '');
  if (origins.includes('*'))
    issues.push('CORS_ALLOWED_ORIGINS 不允许使用通配符');
  for (const origin of origins) {
    if (!isValidOrigin(origin)) {
      issues.push(`CORS_ALLOWED_ORIGINS 包含无效来源：${origin}`);
    }
  }

  if (
    environment.AI_ASSISTANT_API_KEY?.trim() &&
    !environment.AI_ASSISTANT_API_URL?.trim()
  ) {
    issues.push(
      '配置 AI_ASSISTANT_API_KEY 时必须同时配置 AI_ASSISTANT_API_URL',
    );
  }
  if (
    environment.AI_ASSISTANT_API_URL?.trim() &&
    !environment.AI_ASSISTANT_API_KEY?.trim()
  ) {
    issues.push(
      '配置 AI_ASSISTANT_API_URL 时必须同时配置 AI_ASSISTANT_API_KEY',
    );
  }
  if (environment.AI_ASSISTANT_API_KEY?.includes('CHANGE_ME')) {
    issues.push('AI_ASSISTANT_API_KEY 仍包含 CHANGE_ME 占位值');
  }
  if (environment.AI_ASSISTANT_API_URL?.trim()) {
    try {
      const url = new URL(environment.AI_ASSISTANT_API_URL);
      if (!['http:', 'https:'].includes(url.protocol)) {
        issues.push('AI_ASSISTANT_API_URL 必须使用 http 或 https');
      }
    } catch {
      issues.push('AI_ASSISTANT_API_URL 不是有效地址');
    }
  }
  if (
    environment.COMFYUI_API_TOKEN?.trim() &&
    !environment.COMFYUI_API_URL?.trim()
  ) {
    issues.push('配置 COMFYUI_API_TOKEN 时必须同时配置 COMFYUI_API_URL');
  }
  if (environment.COMFYUI_API_URL?.trim()) {
    try {
      const url = new URL(environment.COMFYUI_API_URL);
      if (!['http:', 'https:'].includes(url.protocol)) {
        issues.push('COMFYUI_API_URL 必须使用 http 或 https');
      }
    } catch {
      issues.push('COMFYUI_API_URL 不是有效地址');
    }
  }
  if (environment.LORA_API_TOKEN?.trim() && !environment.LORA_API_URL?.trim()) {
    issues.push('配置 LORA_API_TOKEN 时必须同时配置 LORA_API_URL');
  }
  if (environment.LORA_API_TOKEN?.includes('CHANGE_ME')) {
    issues.push('LORA_API_TOKEN 仍包含 CHANGE_ME 占位值');
  }
  if (environment.LORA_API_URL?.trim()) {
    try {
      const url = new URL(environment.LORA_API_URL);
      if (!['http:', 'https:'].includes(url.protocol)) {
        issues.push('LORA_API_URL 必须使用 http 或 https');
      }
    } catch {
      issues.push('LORA_API_URL 不是有效地址');
    }
  }
  if (environment.REPORT_AI_API_URL?.trim()) {
    try {
      const url = new URL(environment.REPORT_AI_API_URL);
      if (!['http:', 'https:'].includes(url.protocol)) {
        issues.push('REPORT_AI_API_URL 必须使用 http 或 https');
      }
    } catch {
      issues.push('REPORT_AI_API_URL 不是有效地址');
    }
  }

  return issues;
}

export function getConfig(): PlatformConfig {
  if (cachedConfig) return cachedConfig;

  const isProduction = process.env.NODE_ENV === 'production';
  const jwtSecret =
    process.env.JWT_SECRET ??
    'development-only-change-this-secret-before-production';

  if (isProduction) {
    const issues = validateProductionEnvironment(process.env);
    if (issues.length > 0) {
      throw new Error(`生产环境配置无效：${issues.join('；')}。`);
    }
  }

  const s3Endpoint = process.env.S3_ENDPOINT ?? 'http://localhost:9000';
  const smtpUser = process.env.SMTP_USER?.trim() || null;
  const smtpPassword = process.env.SMTP_PASSWORD || null;
  if (Boolean(smtpUser) !== Boolean(smtpPassword)) {
    throw new Error('SMTP_USER 与 SMTP_PASSWORD 必须同时配置或同时留空。');
  }

  cachedConfig = {
    accessTokenTtlSeconds: positiveInteger(
      process.env.ACCESS_TOKEN_TTL_SECONDS,
      900,
    ),
    aiAssistantApiKey: process.env.AI_ASSISTANT_API_KEY?.trim() || null,
    aiAssistantApiUrl: process.env.AI_ASSISTANT_API_URL?.trim() || null,
    aiAssistantMaxAttachmentBytes: positiveInteger(
      process.env.AI_ASSISTANT_MAX_ATTACHMENT_BYTES,
      50 * 1024 * 1024,
    ),
    aiAssistantMaxImageBytesPerRequest: positiveInteger(
      process.env.AI_ASSISTANT_MAX_IMAGE_BYTES_PER_REQUEST,
      20 * 1024 * 1024,
    ),
    aiAssistantMaxImagesPerMessage: positiveInteger(
      process.env.AI_ASSISTANT_MAX_IMAGES_PER_MESSAGE,
      4,
    ),
    aiAssistantModel:
      process.env.AI_ASSISTANT_MODEL?.trim() || 'qwen3-vl-8b-instruct',
    aiAssistantTimeoutMs: positiveInteger(
      process.env.AI_ASSISTANT_TIMEOUT_MS,
      60_000,
    ),
    allowSelfRegistration: booleanValue(
      process.env.ALLOW_SELF_REGISTRATION,
      true,
    ),
    appPublicUrl: process.env.APP_PUBLIC_URL ?? 'http://localhost:5666',
    bootstrapAdminEmail:
      process.env.BOOTSTRAP_ADMIN_EMAIL ?? 'admin@rail.local',
    bootstrapAdminName: process.env.BOOTSTRAP_ADMIN_NAME ?? '平台管理员',
    bootstrapAdminPassword:
      process.env.BOOTSTRAP_ADMIN_PASSWORD ?? 'RailAdmin123!',
    bootstrapAdminUsername: process.env.BOOTSTRAP_ADMIN_USERNAME ?? 'admin',
    bootstrapUser1Email:
      process.env.BOOTSTRAP_USER1_EMAIL ?? 'user1@rail.local',
    bootstrapUser1Name: process.env.BOOTSTRAP_USER1_NAME ?? '普通用户一',
    bootstrapUser1Password:
      process.env.BOOTSTRAP_USER1_PASSWORD ?? 'RailUser1!2026',
    bootstrapUser1Username: process.env.BOOTSTRAP_USER1_USERNAME ?? 'user1',
    bootstrapUser2Email:
      process.env.BOOTSTRAP_USER2_EMAIL ?? 'user2@rail.local',
    bootstrapUser2Name: process.env.BOOTSTRAP_USER2_NAME ?? '普通用户二',
    bootstrapUser2Password:
      process.env.BOOTSTRAP_USER2_PASSWORD ?? 'RailUser2!2026',
    bootstrapUser2Username: process.env.BOOTSTRAP_USER2_USERNAME ?? 'user2',
    bootstrapDemoUsers: booleanValue(
      process.env.BOOTSTRAP_DEMO_USERS,
      !isProduction,
    ),
    comfyuiApiToken: process.env.COMFYUI_API_TOKEN?.trim() || null,
    comfyuiApiUrl: process.env.COMFYUI_API_URL?.trim() || null,
    comfyuiLeaseSeconds: positiveInteger(
      process.env.COMFYUI_WORKER_LEASE_SECONDS,
      90,
    ),
    comfyuiMaxOutputBytes: positiveInteger(
      process.env.COMFYUI_MAX_OUTPUT_BYTES,
      100 * 1024 * 1024,
    ),
    comfyuiPollIntervalMs: positiveInteger(
      process.env.COMFYUI_POLL_INTERVAL_MS,
      1500,
    ),
    comfyuiTimeoutMs: positiveInteger(
      process.env.COMFYUI_API_TIMEOUT_MS,
      30_000,
    ),
    corsAllowedOrigins: commaSeparatedValues(
      process.env.CORS_ALLOWED_ORIGINS,
      process.env.APP_PUBLIC_URL ?? 'http://localhost:5666',
    ),
    databaseUrl:
      process.env.DATABASE_URL ??
      'postgresql://rail_platform:rail_platform_dev@localhost:5432/rail_platform',
    isProduction,
    jwtSecret,
    loraApiToken: process.env.LORA_API_TOKEN?.trim() || null,
    loraApiUrl: process.env.LORA_API_URL?.trim() || null,
    loraDatasetsRoot:
      process.env.LORA_DATASETS_ROOT?.trim() ||
      '/opt/ai-toolkit/data/ai-toolkit-lora-datasets',
    loraGpuIds: process.env.LORA_GPU_IDS?.trim() || '0',
    loraMaxDatasetBytes: positiveInteger(
      process.env.LORA_MAX_DATASET_BYTES,
      2 * 1024 * 1024 * 1024,
    ),
    loraMaxOutputBytes: positiveInteger(
      process.env.LORA_MAX_OUTPUT_BYTES,
      1024 * 1024 * 1024,
    ),
    loraModelPath:
      process.env.LORA_MODEL_PATH?.trim() ||
      '/data_hdd/data/models/Flux2Klein/unet/flux-2-klein-9b.safetensors',
    loraPollIntervalMs: positiveInteger(
      process.env.LORA_POLL_INTERVAL_MS,
      5000,
    ),
    loraTimeoutMs: positiveInteger(process.env.LORA_API_TIMEOUT_MS, 120_000),
    loraVaePath:
      process.env.LORA_VAE_PATH?.trim() ||
      '/data_hdd/data/models/flux2-klein-9B/split_files/vae/flux2-vae.safetensors',
    loraWorkerLeaseSeconds: positiveInteger(
      process.env.LORA_WORKER_LEASE_SECONDS,
      180,
    ),
    maxInlineTextBytes: positiveInteger(
      process.env.MAX_INLINE_TEXT_BYTES,
      5 * 1024 * 1024,
    ),
    maxUploadBytes: positiveInteger(
      process.env.MAX_UPLOAD_BYTES,
      2 * 1024 * 1024 * 1024,
    ),
    passwordResetTtlMinutes: positiveInteger(
      process.env.PASSWORD_RESET_TTL_MINUTES,
      30,
    ),
    refreshTokenTtlDays: positiveInteger(
      process.env.REFRESH_TOKEN_TTL_DAYS,
      30,
    ),
    reportAiApiUrl: process.env.REPORT_AI_API_URL?.trim() || null,
    reportAiMaxOutputBytes: positiveInteger(
      process.env.REPORT_AI_MAX_OUTPUT_BYTES,
      100 * 1024 * 1024,
    ),
    reportAiTemplate: process.env.REPORT_AI_TEMPLATE?.trim() || 'general',
    reportAiTimeoutMs: positiveInteger(
      process.env.REPORT_AI_TIMEOUT_MS,
      10 * 60 * 1000,
    ),
    s3AccessKey: process.env.S3_ACCESS_KEY ?? 'railminio',
    s3Bucket: process.env.S3_BUCKET ?? 'rail-platform-assets',
    s3CorsOrigins: commaSeparatedValues(
      process.env.S3_CORS_ORIGINS,
      'http://localhost:5666',
    ),
    s3Endpoint,
    s3ForcePathStyle: booleanValue(process.env.S3_FORCE_PATH_STYLE, true),
    s3PresignTtlSeconds: positiveInteger(
      process.env.S3_PRESIGN_TTL_SECONDS,
      900,
    ),
    s3PublicEndpoint: process.env.S3_PUBLIC_ENDPOINT ?? s3Endpoint,
    s3Region: process.env.S3_REGION ?? 'us-east-1',
    s3SecretKey: process.env.S3_SECRET_KEY ?? 'railminio-dev-secret',
    smtpFromAddress: process.env.SMTP_FROM_ADDRESS ?? 'no-reply@rail.local',
    smtpFromName: process.env.SMTP_FROM_NAME ?? '轨道客室智能设计平台',
    smtpHost: process.env.SMTP_HOST ?? 'localhost',
    smtpPassword,
    smtpPort: positiveInteger(process.env.SMTP_PORT, 1025),
    smtpSecure: booleanValue(process.env.SMTP_SECURE, false),
    smtpTlsRejectUnauthorized: booleanValue(
      process.env.SMTP_TLS_REJECT_UNAUTHORIZED,
      true,
    ),
    smtpUser,
  };

  return cachedConfig;
}

export function resetConfigForTests() {
  cachedConfig = null;
}
