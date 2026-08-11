import { z } from 'zod';
import { useDatabase } from '~/utils/database';
import { requireIdentity } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { apiHandler } from '~/utils/response';
import { parseQuery } from '~/utils/validation';

const querySchema = z.object({ projectId: z.string().uuid() });

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const { projectId } = parseQuery(event, querySchema);
  await requireProjectAccess(identity, projectId);
  const sql = useDatabase();
  const jobs = await sql<
    {
      appKey: string;
      completedAt: Date | null;
      createdAt: Date;
      createdBy: string;
      errorCode: null | string;
      errorMessage: null | string;
      externalReference: null | string;
      id: string;
      inputAssetIds: null | string[];
      inputs: Array<{
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
      parameters: Record<string, unknown>;
      progress: number;
      projectId: string;
      stage: string;
      startedAt: Date | null;
      status: string;
      workflowVersion: null | number;
      workspaceInstanceId: string;
      workspaceInstanceTitle: string;
    }[]
  >`
    SELECT
      j.id,
      j.project_id AS "projectId",
      j.app_key AS "appKey",
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
      j.error ->> 'code' AS "errorCode",
      j.error ->> 'message' AS "errorMessage",
      wv.version AS "workflowVersion",
      u.real_name AS owner,
      COALESCE((
        SELECT array_agg(input_link.asset_id::text ORDER BY input_link.position)
        FROM job_inputs input_link
        WHERE input_link.job_id = j.id
      ), '{}') AS "inputAssetIds",
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'assetId', input_asset.id,
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
    JOIN workflow_workspace_instances workspace_instance
      ON workspace_instance.id = j.workspace_instance_id
    LEFT JOIN workflow_versions wv ON wv.id = j.workflow_version_id
    WHERE j.project_id = ${projectId}
    ORDER BY j.created_at DESC
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
