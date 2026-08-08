import type { CurrentIdentity } from '../../identity';

import { extname } from 'node:path';

import { useDatabase } from '../../database';
import { ApiError } from '../../response';

const SUPPORTED_MIME_TYPES = new Set([
  'application/json',
  'application/msword',
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/webm',
  'audio/x-m4a',
  'audio/x-wav',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/csv',
  'text/markdown',
  'text/plain',
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);

const FALLBACK_EXTENSIONS = new Set([
  '.csv',
  '.doc',
  '.docx',
  '.gif',
  '.jpeg',
  '.jpg',
  '.json',
  '.m4a',
  '.md',
  '.mov',
  '.mp3',
  '.mp4',
  '.pdf',
  '.png',
  '.ppt',
  '.pptx',
  '.txt',
  '.wav',
  '.webm',
  '.webp',
  '.xls',
  '.xlsx',
  '.zip',
]);

export interface AssistantConversationRecord {
  id: string;
  projectId: null | string;
  projectName: null | string;
  title: string;
  userId: string;
}

export function assistantAttachmentExtension(filename: string) {
  return extname(filename)
    .toLowerCase()
    .replaceAll(/[^.\da-z]/g, '')
    .slice(0, 16);
}

export function isAssistantAttachmentSupported(
  filename: string,
  mimeType: string,
) {
  const normalizedMime = mimeType.trim().toLowerCase();
  if (SUPPORTED_MIME_TYPES.has(normalizedMime)) return true;
  return (
    (!normalizedMime || normalizedMime === 'application/octet-stream') &&
    FALLBACK_EXTENSIONS.has(assistantAttachmentExtension(filename))
  );
}

export function deriveAssistantConversationTitle(
  content: string,
  fallbackFilename?: string,
) {
  const source = content.trim() || fallbackFilename?.trim() || '新对话';
  const normalized = source.replaceAll(/\s+/g, ' ');
  return normalized.length > 32 ? `${normalized.slice(0, 32)}…` : normalized;
}

export async function requireAssistantConversation(
  identity: Pick<CurrentIdentity, 'id'>,
  conversationId: string,
) {
  const sql = useDatabase();
  const [conversation] = await sql<AssistantConversationRecord[]>`
    SELECT
      conversation.id,
      conversation.user_id AS "userId",
      conversation.project_id AS "projectId",
      project.name AS "projectName",
      conversation.title
    FROM ai_conversations conversation
    LEFT JOIN projects project ON project.id = conversation.project_id
    WHERE conversation.id = ${conversationId}
      AND conversation.user_id = ${identity.id}
  `;
  if (!conversation) {
    throw new ApiError(404, 'AI_CONVERSATION_NOT_FOUND', '对话不存在');
  }
  return conversation;
}
