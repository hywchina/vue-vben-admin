import { requestClient } from '#/api/request';

import { uploadPresignedFile } from './uploads';

export interface AiAssistantStatus {
  configured: boolean;
  maxAttachmentBytes: number;
  model: string;
  provider: null | string;
}

export interface AiConversation {
  createdAt: string;
  id: string;
  lastMessageAt: null | string;
  messageCount: number;
  projectId: null | string;
  projectName: null | string;
  title: string;
  updatedAt: string;
}

export interface AiAttachment {
  createdAt: string;
  filename: string;
  id: string;
  isImage: boolean;
  messageId?: string;
  mimeType: string;
  sizeBytes: number;
  status?: 'available' | 'failed' | 'pending';
}

export interface AiMessage {
  attachments: AiAttachment[];
  content: string;
  createdAt: string;
  errorCode: null | string;
  id: string;
  role: 'assistant' | 'system' | 'user';
  status: 'completed' | 'failed';
}

interface PreparedAssistantAttachment {
  attachment: AiAttachment;
  upload: {
    expiresAt: string;
    headers: Record<string, string>;
    method: 'PUT';
    url: string;
  };
}

export function getAiAssistantStatusApi() {
  return requestClient.get<AiAssistantStatus>('/assistant/status');
}

export function getAiConversationsApi() {
  return requestClient.get<AiConversation[]>('/assistant/conversations');
}

export function createAiConversationApi(projectId?: string) {
  return requestClient.post<AiConversation>('/assistant/conversations', {
    projectId: projectId || undefined,
  });
}

export function getAiMessagesApi(conversationId: string) {
  return requestClient.get<AiMessage[]>(
    `/assistant/conversations/${conversationId}/messages`,
  );
}

export function sendAiMessageApi(
  conversationId: string,
  input: { attachmentIds: string[]; content: string },
) {
  return requestClient.post<{
    assistantMessage: AiMessage;
    serviceError: null | { code: string; message: string };
    userMessageId: string;
  }>(`/assistant/conversations/${conversationId}/messages`, input);
}

export function clearAiMessagesApi(conversationId: string) {
  return requestClient.delete<{
    deletedAttachments: number;
    deletedMessages: number;
  }>(`/assistant/conversations/${conversationId}/messages`);
}

export async function uploadAiAttachmentApi(
  conversationId: string,
  file: File,
) {
  const prepared = await requestClient.post<PreparedAssistantAttachment>(
    `/assistant/conversations/${conversationId}/attachments/uploads`,
    {
      filename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    },
  );
  await uploadPresignedFile(prepared.upload, file, '附件上传失败');
  await requestClient.post<{ id: string; status: 'available' }>(
    `/assistant/attachments/${prepared.attachment.id}/complete`,
  );
  return { ...prepared.attachment, status: 'available' as const };
}

export function removeAiAttachmentApi(attachmentId: string) {
  return requestClient.delete<{ deleted: boolean }>(
    `/assistant/attachments/${attachmentId}`,
  );
}

export function getAiAttachmentPreviewApi(attachmentId: string) {
  return requestClient.get<{ expiresAt: string; url: string }>(
    `/assistant/attachments/${attachmentId}/preview`,
  );
}

export function getAiAttachmentDownloadApi(attachmentId: string) {
  return requestClient.get<{ expiresAt: string; url: string }>(
    `/assistant/attachments/${attachmentId}/download`,
  );
}
