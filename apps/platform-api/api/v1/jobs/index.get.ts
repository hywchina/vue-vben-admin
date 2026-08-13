import { z } from 'zod';
import { useDatabase } from '~/utils/database';
import { requireDesignConversation } from '~/utils/domain/design-conversations';
import { requireIdentity } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { apiHandler } from '~/utils/response';
import { parseQuery } from '~/utils/validation';

const querySchema = z.object({
  designConversationId: z.string().uuid().optional(),
  ownerId: z.string().uuid().optional(),
  projectId: z.string().uuid(),
  search: z.string().trim().max(200).optional(),
  sortBy: z.enum(['createdAt', 'name', 'owner', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  status: z
    .enum(['active', 'cancelled', 'failed', 'queued', 'running', 'succeeded'])
    .optional(),
});

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const {
    designConversationId,
    ownerId,
    projectId,
    search,
    sortBy,
    sortOrder,
    status,
  } = parseQuery(event, querySchema);
  await requireProjectAccess(identity, projectId);
  if (designConversationId) {
    await requireDesignConversation({
      conversationId: designConversationId,
      projectId,
      userId: identity.id,
    });
  }
  const sql = useDatabase();
  const jobs = await sql<
    {
      appKey: string;
      completedAt: Date | null;
      createdAt: Date;
      createdBy: string;
      designConversationId: null | string;
      designConversationTitle: null | string;
      errorCode: null | string;
      errorMessage: null | string;
      externalExecution: boolean;
      externalReference: null | string;
      id: string;
      inputAssetIds: null | string[];
      inputs: Array<{
        annotationAssetId?: string;
        annotationMimeType?: string;
        annotationName?: string;
        assetId: string;
        derivedFromAssetId?: string;
        kind: string;
        mimeType: string;
        name: string;
        position: number;
      }>;
      name: string;
      outputAssetId: null | string;
      outputs: Array<{
        assetId: string;
        kind: string;
        mimeType: string;
        name: string;
        position: number;
        saved: boolean;
      }>;
      ownedByCurrentUser: boolean;
      owner: string;
      ownerPublicId: string;
      parameters: Record<string, unknown>;
      progress: number;
      projectId: string;
      publicId: string;
      stage: string;
      startedAt: Date | null;
      status: string;
      workflowVersion: null | number;
      workspaceInstanceId: null | string;
      workspaceInstanceTitle: null | string;
    }[]
  >`
    SELECT
      j.id,
      j.public_id AS "publicId",
      j.project_id AS "projectId",
      j.app_key AS "appKey",
      j.design_conversation_id AS "designConversationId",
      design_conversation.title AS "designConversationTitle",
      j.workspace_instance_id AS "workspaceInstanceId",
      workspace_instance.title AS "workspaceInstanceTitle",
      j.name,
      j.parameters,
      j.status,
      j.progress,
      j.stage,
      j.created_at AS "createdAt",
      j.started_at AS "startedAt",
      j.completed_at AS "completedAt",
      j.created_by AS "createdBy",
      (j.created_by = ${identity.id}) AS "ownedByCurrentUser",
      j.external_reference AS "externalReference",
      EXISTS(
        SELECT 1 FROM job_executions execution WHERE execution.job_id = j.id
      ) AS "externalExecution",
      j.error ->> 'code' AS "errorCode",
      j.error ->> 'message' AS "errorMessage",
      wv.version AS "workflowVersion",
      u.real_name AS owner,
      u.public_id AS "ownerPublicId",
      COALESCE((
        SELECT array_agg(input_link.asset_id::text ORDER BY input_link.position)
        FROM job_inputs input_link
        WHERE input_link.job_id = j.id
      ), '{}') AS "inputAssetIds",
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'assetId', input_asset.id,
            'annotationAssetId', annotation_asset.id,
            'annotationMimeType', annotation_version.mime_type,
            'annotationName', annotation_asset.name,
            'derivedFromAssetId', input_version.metadata ->> 'derivedFromAssetId',
            'kind', input_asset.kind,
            'mimeType', input_version.mime_type,
            'name', input_asset.name,
            'position', input_link.position
          )
          ORDER BY input_link.position
        )
        FROM job_inputs input_link
        JOIN assets input_asset ON input_asset.id = input_link.asset_id
        JOIN asset_versions input_version
          ON input_version.asset_id = input_asset.id
          AND input_version.version = input_asset.current_version
        LEFT JOIN assets annotation_asset
          ON annotation_asset.id = input_link.annotation_asset_id
          AND annotation_asset.deleted_at IS NULL
        LEFT JOIN asset_versions annotation_version
          ON annotation_version.asset_id = annotation_asset.id
          AND annotation_version.version = annotation_asset.current_version
        WHERE input_link.job_id = j.id
      ), '[]'::jsonb) AS inputs,
      (
        SELECT output_link.asset_id::text
        FROM job_outputs output_link
        WHERE output_link.job_id = j.id
        ORDER BY output_link.position
        LIMIT 1
      ) AS "outputAssetId",
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'assetId', output_asset.id,
            'kind', output_asset.kind,
            'mimeType', output_version.mime_type,
            'name', output_asset.name,
            'position', output_link.position,
            'saved', output_asset.saved_at IS NOT NULL
          )
          ORDER BY output_link.position
        )
        FROM job_outputs output_link
        JOIN assets output_asset
          ON output_asset.id = output_link.asset_id
          AND output_asset.deleted_at IS NULL
        JOIN asset_versions output_version
          ON output_version.asset_id = output_asset.id
          AND output_version.version = output_asset.current_version
        WHERE output_link.job_id = j.id
      ), '[]'::jsonb) AS outputs
    FROM jobs j
    JOIN users u ON u.id = j.created_by
    LEFT JOIN workflow_workspace_instances workspace_instance
      ON workspace_instance.id = j.workspace_instance_id
    LEFT JOIN design_conversations design_conversation
      ON design_conversation.id = j.design_conversation_id
    LEFT JOIN workflow_versions wv ON wv.id = j.workflow_version_id
    WHERE j.project_id = ${projectId}
      AND j.archived_at IS NULL
      AND (
        ${designConversationId ?? null}::uuid IS NULL
        OR j.design_conversation_id = ${designConversationId ?? null}
      )
      AND (${ownerId ?? null}::uuid IS NULL OR j.created_by = ${ownerId ?? null})
      AND (
        ${search ?? null}::text IS NULL
        OR j.name ILIKE ('%' || ${search ?? null} || '%')
        OR j.public_id ILIKE ('%' || ${search ?? null} || '%')
        OR u.real_name ILIKE ('%' || ${search ?? null} || '%')
      )
      AND (
        ${status ?? null}::text IS NULL
        OR (${status ?? null} = 'active' AND j.status IN ('queued', 'running', 'cancelling'))
        OR (${status ?? null} <> 'active' AND j.status = ${status ?? null})
      )
    ORDER BY
      CASE WHEN ${sortBy} = 'name' AND ${sortOrder} = 'asc' THEN lower(j.name) END ASC,
      CASE WHEN ${sortBy} = 'name' AND ${sortOrder} = 'desc' THEN lower(j.name) END DESC,
      CASE WHEN ${sortBy} = 'owner' AND ${sortOrder} = 'asc' THEN lower(u.real_name) END ASC,
      CASE WHEN ${sortBy} = 'owner' AND ${sortOrder} = 'desc' THEN lower(u.real_name) END DESC,
      CASE WHEN ${sortBy} = 'status' AND ${sortOrder} = 'asc' THEN j.status END ASC,
      CASE WHEN ${sortBy} = 'status' AND ${sortOrder} = 'desc' THEN j.status END DESC,
      CASE WHEN ${sortBy} = 'createdAt' AND ${sortOrder} = 'asc' THEN j.created_at END ASC,
      CASE WHEN ${sortBy} = 'createdAt' AND ${sortOrder} = 'desc' THEN j.created_at END DESC,
      j.id ASC
  `;

  return jobs.map(({ completedAt, startedAt, ...job }) => ({
    ...job,
    completedAt: completedAt?.toISOString(),
    createdAt: job.createdAt.toISOString(),
    duration:
      completedAt && startedAt
        ? Math.max(
            0,
            Math.round((completedAt.getTime() - startedAt.getTime()) / 1000),
          )
        : undefined,
    inputAssetIds: job.inputAssetIds ?? [],
    inputs: job.inputs ?? [],
    outputs: job.outputs ?? [],
    error:
      job.errorCode || job.errorMessage
        ? {
            code: job.errorCode ?? 'JOB_FAILED',
            message: job.errorMessage ?? '任务执行失败',
          }
        : undefined,
  }));
});
