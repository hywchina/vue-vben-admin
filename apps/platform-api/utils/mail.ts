import type { Transporter } from 'nodemailer';

import nodemailer from 'nodemailer';

import { getConfig } from './config';

let transporter: Transporter | undefined;
let verifiedUntil = 0;

function useTransporter() {
  if (transporter) return transporter;
  const config = getConfig();
  transporter = nodemailer.createTransport({
    auth:
      config.smtpUser && config.smtpPassword
        ? {
            pass: config.smtpPassword,
            user: config.smtpUser,
          }
        : undefined,
    connectionTimeout: 10_000,
    disableFileAccess: true,
    disableUrlAccess: true,
    greetingTimeout: 10_000,
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    socketTimeout: 20_000,
    tls: {
      rejectUnauthorized: config.smtpTlsRejectUnauthorized,
    },
  });
  return transporter;
}

function escapeHtml(value: string) {
  return value.replaceAll(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '"': '&quot;',
      '&': '&amp;',
      "'": '&#39;',
      '<': '&lt;',
      '>': '&gt;',
    };
    return entities[character] ?? character;
  });
}

export async function verifyMailTransport() {
  if (verifiedUntil > Date.now()) return;
  await useTransporter().verify();
  verifiedUntil = Date.now() + 60_000;
}

export async function sendPasswordResetEmail(input: {
  email: string;
  expiresInMinutes: number;
  realName: string;
  resetUrl: string;
}) {
  const config = getConfig();
  const name = escapeHtml(input.realName);
  const url = escapeHtml(input.resetUrl);
  await useTransporter().sendMail({
    from: {
      address: config.smtpFromAddress,
      name: config.smtpFromName,
    },
    html: `
      <div style="font-family:Arial,'Microsoft YaHei',sans-serif;color:#20252c;line-height:1.7">
        <h2 style="margin:0 0 16px;color:#b91c32">重置轨道客室智能设计平台密码</h2>
        <p>${name}，您好：</p>
        <p>平台收到了密码重置请求。请点击下面的链接设置新密码：</p>
        <p><a href="${url}">设置新密码</a></p>
        <p>链接将在 ${input.expiresInMinutes} 分钟后失效，并且只能使用一次。</p>
        <p>如果不是您本人发起，请忽略本邮件，原密码不会被修改。</p>
      </div>
    `,
    subject: '轨道客室智能设计平台 · 密码重置',
    text: [
      `${input.realName}，您好：`,
      '',
      '平台收到了密码重置请求，请打开以下链接设置新密码：',
      input.resetUrl,
      '',
      `链接将在 ${input.expiresInMinutes} 分钟后失效，并且只能使用一次。`,
      '如果不是您本人发起，请忽略本邮件，原密码不会被修改。',
    ].join('\n'),
    to: input.email,
  });
}

export function resetMailTransportForTests() {
  transporter = undefined;
  verifiedUntil = 0;
}
