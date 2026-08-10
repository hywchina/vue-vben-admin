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
      errorCode: null | string;
      errorMessage: null | string;
      externalReference: null | string;
      id: string;
      inputAssetIds: null | string[];
      name: string;
      outputAssetId: null | string;
      outputs: Array<{
        assetId: string;
        kind: string;
        mimeType: string;
        name: string;
        saved: boolean;
      }>;
      owner: string;
      progress: number;
      projectId: string;
      stage: string;
      startedAt: Date | null;
      status: string;
      workflowVersion: null | number;
    }[]
  >`
    SELECT
      j.id,
      j.project_id AS "projectId",
      j.app_key AS "appKey",
      j.name,
      j.status,
      j.progress,
      j.stage,
      j.created_at AS "createdAt",
      j.started_at AS "startedAt",
      j.completed_at AS "completedAt",
      j.external_reference AS "externalReference",
      j.error ->> 'code' AS "errorCode",
      j.error ->> 'message' AS "errorMessage",
      wv.version AS "workflowVersion",
      u.real_name AS owner,
      COALESCE(array_agg(DISTINCT ji.asset_id::text)
        FILTER (WHERE ji.asset_id IS NOT NULL), '{}') AS "inputAssetIds",
      min(jo.asset_id::text) AS "outputAssetId",
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'assetId', output_asset.id,
            'kind', output_asset.kind,
            'mimeType', output_version.mime_type,
            'name', output_asset.name,
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
    LEFT JOIN job_inputs ji ON ji.job_id = j.id
    LEFT JOIN job_outputs jo ON jo.job_id = j.id
    LEFT JOIN workflow_versions wv ON wv.id = j.workflow_version_id
    WHERE j.project_id = ${projectId}
    GROUP BY j.id, u.real_name, wv.version
    ORDER BY j.created_at DESC
  `;

  return jobs.map(({ completedAt, startedAt, ...job }) => ({
    ...job,
    createdAt: job.createdAt.toISOString(),
    duration:
      completedAt && startedAt
        ? Math.max(
            0,
            Math.round((completedAt.getTime() - startedAt.getTime()) / 1000),
          )
        : undefined,
    inputAssetIds: job.inputAssetIds ?? [],
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
