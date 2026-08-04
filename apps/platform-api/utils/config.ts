import process from 'node:process';

export interface PlatformConfig {
  accessTokenTtlSeconds: number;
  aiAssistantApiKey: null | string;
  aiAssistantApiUrl: null | string;
  aiAssistantMaxAttachmentBytes: number;
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
  databaseUrl: string;
  isProduction: boolean;
  jwtSecret: string;
  maxInlineTextBytes: number;
  maxUploadBytes: number;
  passwordResetTtlMinutes: number;
  refreshTokenTtlDays: number;
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

export function getConfig(): PlatformConfig {
  if (cachedConfig) return cachedConfig;

  const isProduction = process.env.NODE_ENV === 'production';
  const jwtSecret =
    process.env.JWT_SECRET ??
    'development-only-change-this-secret-before-production';

  if (isProduction && jwtSecret.startsWith('development-only-')) {
    throw new Error('生产环境必须通过 JWT_SECRET 配置独立的随机密钥。');
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
    aiAssistantModel:
      process.env.AI_ASSISTANT_MODEL?.trim() || 'rail-cabin-assistant',
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
    databaseUrl:
      process.env.DATABASE_URL ??
      'postgresql://rail_platform:rail_platform_dev@localhost:5432/rail_platform',
    isProduction,
    jwtSecret,
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
    s3AccessKey: process.env.S3_ACCESS_KEY ?? 'railminio',
    s3Bucket: process.env.S3_BUCKET ?? 'rail-platform-assets',
    s3CorsOrigins: (process.env.S3_CORS_ORIGINS ?? 'http://localhost:5666')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
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
