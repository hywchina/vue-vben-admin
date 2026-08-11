import { useDatabase } from '~/utils/database';
import { ApiError } from '~/utils/response';

export interface WorkflowWorkspaceInstanceRecord {
  appKey: string;
  id: string;
  projectId: string;
  title: string;
  userId: string;
}

export async function requireWorkflowWorkspaceInstance(input: {
  appKey: string;
  instanceId: string;
  projectId: string;
  userId: string;
}) {
  const sql = useDatabase();
  const [instance] = await sql<WorkflowWorkspaceInstanceRecord[]>`
    SELECT
      id,
      user_id AS "userId",
      project_id AS "projectId",
      app_key AS "appKey",
      title
    FROM workflow_workspace_instances
    WHERE id = ${input.instanceId}
      AND user_id = ${input.userId}
      AND project_id = ${input.projectId}
      AND app_key = ${input.appKey}
  `;
  if (!instance) {
    throw new ApiError(
      404,
      'WORKSPACE_INSTANCE_NOT_FOUND',
      '应用会话不存在或不属于当前用户与项目',
    );
  }
  return instance;
}
