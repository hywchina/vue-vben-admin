import type {
  DesignConversation,
  WorkflowWorkspaceDraft,
} from '#/modules/platform/types';

import { requestClient } from '#/api/request';

export function getDesignConversationsApi(projectId: string) {
  return requestClient.get<DesignConversation[]>('/design-conversations', {
    params: { projectId },
  });
}

export function createDesignConversationApi(input: {
  projectId: string;
  title?: string;
}) {
  return requestClient.post<DesignConversation>('/design-conversations', input);
}

export function renameDesignConversationApi(
  conversationId: string,
  input: { projectId: string; title: string },
) {
  return requestClient.request<{
    id: string;
    title: string;
    updatedAt: string;
  }>(`/design-conversations/${conversationId}`, {
    data: input,
    method: 'PATCH',
  });
}

export function archiveDesignConversationApi(
  conversationId: string,
  projectId: string,
) {
  return requestClient.delete<{ archived: boolean; id: string }>(
    `/design-conversations/${conversationId}`,
    { params: { projectId } },
  );
}

export function getDesignConversationDraftApi(
  conversationId: string,
  projectId: string,
  appKey: string,
) {
  return requestClient.get<WorkflowWorkspaceDraft>(
    `/design-conversations/${conversationId}/drafts/${encodeURIComponent(appKey)}`,
    { params: { projectId } },
  );
}

export function saveDesignConversationDraftApi(input: {
  appKey: string;
  conversationId: string;
  inputAssetIds: Record<string, string>;
  parameterValues: Record<string, unknown>;
  projectId: string;
}) {
  return requestClient.put<WorkflowWorkspaceDraft>(
    `/design-conversations/${input.conversationId}/drafts/${encodeURIComponent(input.appKey)}`,
    {
      inputAssetIds: input.inputAssetIds,
      parameterValues: input.parameterValues,
      projectId: input.projectId,
    },
  );
}
