import type {
  DesignDraftPayload,
  DraftWriteToken,
} from '#/modules/platform/design-draft-save';
import type {
  DesignConversation,
  PlatformAsset,
  WorkflowWorkspaceDraft,
} from '#/modules/platform/types';

import { useAppConfig } from '@vben/hooks';
import { useAccessStore } from '@vben/stores';

import { requestClient } from '#/api/request';

export function referenceDesignConversationInputApi(
  conversationId: string,
  projectId: string,
  assetId: string,
) {
  return requestClient.post<PlatformAsset>(
    `/design-conversations/${conversationId}/input-assets/${assetId}`,
    { projectId },
  );
}

export function getWorkflowInstanceInputAssetApi(
  instanceId: string,
  projectId: string,
  assetId: string,
) {
  return requestClient.get<PlatformAsset>(
    `/workflow-instances/${instanceId}/input-assets/${assetId}`,
    { params: { projectId } },
  );
}

export function getDesignConversationInputAssetApi(
  conversationId: string,
  projectId: string,
  assetId: string,
) {
  return requestClient.get<PlatformAsset>(
    `/design-conversations/${conversationId}/input-assets/${assetId}`,
    { params: { projectId } },
  );
}

export function getDesignConversationApi(id: string) {
  return requestClient.get<{ id: string; projectId: string; title: string }>(
    `/design-conversations/${id}`,
  );
}

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

export function archiveDesignRoundApi(
  conversationId: string,
  jobId: string,
  projectId: string,
) {
  return requestClient.delete<{ archived: boolean; id: string }>(
    `/design-conversations/${conversationId}/rounds/${jobId}`,
    { params: { projectId } },
  );
}

export function getDesignConversationDraftApi(
  conversationId: string,
  projectId: string,
  appKey: string,
  designMode: 'cabin' | 'cmf' | 'component' = 'cabin',
) {
  return requestClient.get<WorkflowWorkspaceDraft>(
    `/design-conversations/${conversationId}/drafts/${encodeURIComponent(appKey)}`,
    { params: { projectId, designMode } },
  );
}

export function saveDesignConversationDraftApi(
  input: DesignDraftPayload & { writeToken?: DraftWriteToken },
) {
  return requestClient.put<WorkflowWorkspaceDraft>(
    `/design-conversations/${input.conversationId}/drafts/${encodeURIComponent(input.appKey)}`,
    {
      designMode: input.designMode,
      inputAssetIds: input.inputAssetIds,
      parameterValues: input.parameterValues,
      projectId: input.projectId,
      writeToken: input.writeToken,
    },
    { showErrorMessage: false },
  );
}

export async function saveDesignConversationDraftOnUnloadApi(
  input: DesignDraftPayload & { writeToken: DraftWriteToken },
) {
  const { apiURL } = useAppConfig(import.meta.env, import.meta.env.PROD);
  const token = useAccessStore().accessToken;
  const response = await fetch(
    `${apiURL.replace(/\/$/, '')}/design-conversations/${input.conversationId}/drafts/${encodeURIComponent(input.appKey)}`,
    {
      method: 'PUT',
      credentials: 'include',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token ?? ''}`,
      },
      body: JSON.stringify({
        projectId: input.projectId,
        designMode: input.designMode,
        parameterValues: input.parameterValues,
        inputAssetIds: input.inputAssetIds,
        writeToken: input.writeToken,
      }),
    },
  );
  const result = await response.json();
  if (!response.ok || result.code !== 0)
    throw new Error(result.message ?? '草稿保存失败，请重试');
  return result.data as WorkflowWorkspaceDraft;
}
