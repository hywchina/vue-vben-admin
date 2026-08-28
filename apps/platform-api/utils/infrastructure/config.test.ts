import { describe, expect, it } from 'vitest';

import { validateProductionEnvironment } from './config';

const validEnvironment = {
  APP_PUBLIC_URL: 'https://rail.example.internal',
  BOOTSTRAP_ADMIN_PASSWORD: 'A-unique-admin-password-2026',
  CORS_ALLOWED_ORIGINS: 'https://rail.example.internal',
  DATABASE_URL: 'postgresql://rail:unique@database.internal:5432/rail',
  JWT_SECRET: 'a-unique-high-entropy-signing-secret',
  S3_ACCESS_KEY: 'rail-production',
  S3_PUBLIC_ENDPOINT: 'https://objects.example.internal',
  S3_SECRET_KEY: 'a-unique-object-storage-secret',
} satisfies NodeJS.ProcessEnv;

describe('production configuration validation', () => {
  it('accepts explicit non-development settings', () => {
    expect(validateProductionEnvironment(validEnvironment)).toEqual([]);
  });

  it('rejects missing settings, defaults, wildcards and malformed origins', () => {
    const issues = validateProductionEnvironment({
      ...validEnvironment,
      BOOTSTRAP_ADMIN_PASSWORD: 'RailAdmin123!',
      BOOTSTRAP_DEMO_USERS: 'true',
      CORS_ALLOWED_ORIGINS: '*,not-an-origin',
      DATABASE_URL:
        'postgresql://rail_platform:rail_platform_dev@localhost:5432/rail_platform',
      JWT_SECRET: 'development-only-secret',
      S3_ACCESS_KEY: 'railminio',
      S3_SECRET_KEY: 'railminio-dev-secret',
    });
    expect(issues).toEqual(
      expect.arrayContaining([
        'JWT_SECRET 仍为开发默认值',
        'BOOTSTRAP_ADMIN_PASSWORD 仍为开发默认值',
        'DATABASE_URL 仍使用开发默认密码',
        'S3_ACCESS_KEY 仍为开发默认值',
        'S3_SECRET_KEY 仍为开发默认值',
        '生产环境禁止启用 BOOTSTRAP_DEMO_USERS',
        'CORS_ALLOWED_ORIGINS 不允许使用通配符',
        'CORS_ALLOWED_ORIGINS 包含无效来源：not-an-origin',
      ]),
    );
  });

  it('requires an API URL whenever an assistant key is configured', () => {
    expect(
      validateProductionEnvironment({
        ...validEnvironment,
        AI_ASSISTANT_API_KEY: 'secret',
      }),
    ).toContain(
      '配置 AI_ASSISTANT_API_KEY 时必须同时配置 AI_ASSISTANT_API_URL',
    );
    expect(
      validateProductionEnvironment({
        ...validEnvironment,
        AI_ASSISTANT_API_URL: 'https://geekai.co/api/v1/chat/completions',
      }),
    ).toContain(
      '配置 AI_ASSISTANT_API_URL 时必须同时配置 AI_ASSISTANT_API_KEY',
    );
    expect(
      validateProductionEnvironment({
        ...validEnvironment,
        AI_ASSISTANT_API_KEY: 'CHANGE_ME_GEEKAI_KEY',
        AI_ASSISTANT_API_URL: 'https://geekai.co/api/v1/chat/completions',
      }),
    ).toContain('AI_ASSISTANT_API_KEY 仍包含 CHANGE_ME 占位值');
  });

  it('validates ComfyUI URL and token pairing', () => {
    expect(
      validateProductionEnvironment({
        ...validEnvironment,
        COMFYUI_API_TOKEN: 'secret',
      }),
    ).toContain('配置 COMFYUI_API_TOKEN 时必须同时配置 COMFYUI_API_URL');
    expect(
      validateProductionEnvironment({
        ...validEnvironment,
        COMFYUI_API_URL: 'file:///tmp/comfyui',
      }),
    ).toContain('COMFYUI_API_URL 必须使用 http 或 https');
  });

  it('validates the LoRA adapter URL and token', () => {
    expect(
      validateProductionEnvironment({
        ...validEnvironment,
        LORA_API_TOKEN: 'secret',
      }),
    ).toContain('配置 LORA_API_TOKEN 时必须同时配置 LORA_API_URL');
    expect(
      validateProductionEnvironment({
        ...validEnvironment,
        LORA_API_URL: 'file:///srv/ai-toolkit',
      }),
    ).toContain('LORA_API_URL 必须使用 http 或 https');
    expect(
      validateProductionEnvironment({
        ...validEnvironment,
        LORA_API_TOKEN: 'CHANGE_ME_LORA_TOKEN',
        LORA_API_URL: 'https://training.example.internal',
      }),
    ).toContain('LORA_API_TOKEN 仍包含 CHANGE_ME 占位值');
  });

  it('validates the AI report adapter URL', () => {
    expect(
      validateProductionEnvironment({
        ...validEnvironment,
        REPORT_AI_API_URL: 'file:///srv/report-generator',
      }),
    ).toContain('REPORT_AI_API_URL 必须使用 http 或 https');
    expect(
      validateProductionEnvironment({
        ...validEnvironment,
        REPORT_AI_API_URL: 'not-a-url',
      }),
    ).toContain('REPORT_AI_API_URL 不是有效地址');
  });

  it('rejects deployment template placeholders', () => {
    expect(
      validateProductionEnvironment({
        ...validEnvironment,
        JWT_SECRET: 'CHANGE_ME_64_CHARACTER_RANDOM_SECRET',
      }),
    ).toContain('JWT_SECRET 仍包含 CHANGE_ME 占位值');
  });
});
