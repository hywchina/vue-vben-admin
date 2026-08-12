import { useDatabase } from '~/utils/database';
import { hasAdministrativeRole, requireIdentity } from '~/utils/identity';
import { apiHandler } from '~/utils/response';

type AssetKind =
  | 'archive'
  | 'audio'
  | 'document'
  | 'image'
  | 'model3d'
  | 'model'
  | 'text'
  | 'video';

interface DashboardProject {
  activeJobCount: number;
  assetCount: number;
  code: string;
  id: string;
  isPinned: boolean;
  jobCount: number;
  members: number;
  name: string;
  updatedAt: Date;
}

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const sql = useDatabase();
  const isAdmin = hasAdministrativeRole(identity);

  const projects = await sql<DashboardProject[]>`
    SELECT
      project.id,
      project.code,
      project.name,
      project.updated_at AS "updatedAt",
      EXISTS (
        SELECT 1 FROM project_user_pins pin
        WHERE pin.project_id = project.id AND pin.user_id = ${identity.id}
      ) AS "isPinned",
      count(DISTINCT member.user_id)::integer AS members,
      count(DISTINCT asset.id)::integer AS "assetCount",
      count(DISTINCT job.id)::integer AS "jobCount",
      count(DISTINCT job.id) FILTER (
        WHERE job.status IN ('queued', 'running', 'cancelling')
      )::integer AS "activeJobCount"
    FROM projects project
    LEFT JOIN project_members member ON member.project_id = project.id
    LEFT JOIN assets asset
      ON asset.project_id = project.id
      AND asset.deleted_at IS NULL
      AND asset.saved_at IS NOT NULL
    LEFT JOIN jobs job
      ON job.project_id = project.id
      AND job.created_by = ${identity.id}
      AND job.archived_at IS NULL
    WHERE project.archived_at IS NULL
      AND (
        ${isAdmin}
        OR EXISTS (
          SELECT 1 FROM project_members visible_member
          WHERE visible_member.project_id = project.id
            AND visible_member.user_id = ${identity.id}
        )
      )
    GROUP BY project.id
    ORDER BY "isPinned" DESC, project.updated_at DESC, project.id
  `;

  const [preference] = await sql<{ currentProjectId: null | string }[]>`
    SELECT current_project_id AS "currentProjectId"
    FROM user_preferences
    WHERE user_id = ${identity.id}
  `;
  const currentProject =
    projects.find((project) => project.id === preference?.currentProjectId) ??
    projects[0] ??
    null;

  const [
    [accountSummary],
    [workspaceSummary],
    applicationCountRows,
    assetTypes,
    projectAssetTypes,
    jobStatuses,
    jobTrend,
    recentConversations,
    recentJobs,
    recentAssets,
  ] = await Promise.all([
    sql<
      Array<{
        activeJobCount: number;
        failedJobCount: number;
        unreadNotificationCount: number;
      }>
    >`
      SELECT
        count(*) FILTER (
          WHERE job.status IN ('queued', 'running', 'cancelling')
        )::integer AS "activeJobCount",
        count(*) FILTER (WHERE job.status = 'failed')::integer AS "failedJobCount",
        (
          SELECT count(*)::integer FROM notifications notification
          WHERE notification.user_id = ${identity.id}
            AND notification.read_at IS NULL
        ) AS "unreadNotificationCount"
      FROM jobs job
      JOIN projects project ON project.id = job.project_id
      WHERE job.created_by = ${identity.id}
        AND job.archived_at IS NULL
        AND project.archived_at IS NULL
        AND (
          ${isAdmin}
          OR EXISTS (
            SELECT 1 FROM project_members visible_member
            WHERE visible_member.project_id = project.id
              AND visible_member.user_id = ${identity.id}
          )
        )
    `,
    sql<
      Array<{
        assetCount: number;
        conversationCount: number;
        resultCount: number;
      }>
    >`
      SELECT
        count(DISTINCT asset.id)::integer AS "assetCount",
        count(DISTINCT conversation.id)::integer AS "conversationCount",
        count(DISTINCT asset.id) FILTER (
          WHERE asset.source = 'workflow'
        )::integer AS "resultCount"
      FROM projects project
      LEFT JOIN assets asset
        ON asset.project_id = project.id
        AND asset.deleted_at IS NULL
        AND asset.saved_at IS NOT NULL
      LEFT JOIN design_conversations conversation
        ON conversation.project_id = project.id
        AND conversation.user_id = ${identity.id}
        AND conversation.archived_at IS NULL
      WHERE project.archived_at IS NULL
        AND (
          ${isAdmin}
          OR EXISTS (
            SELECT 1 FROM project_members visible_member
            WHERE visible_member.project_id = project.id
              AND visible_member.user_id = ${identity.id}
          )
        )
    `,
    sql<Array<{ count: number }>>`
      SELECT count(*)::integer AS count
      FROM applications application
      WHERE application.visible = true
    `,
    sql<Array<{ count: number; type: AssetKind }>>`
      SELECT asset.kind AS type, count(*)::integer AS count
      FROM assets asset
      JOIN projects project
        ON project.id = asset.project_id AND project.archived_at IS NULL
      WHERE (
          ${isAdmin}
          OR EXISTS (
            SELECT 1 FROM project_members visible_member
            WHERE visible_member.project_id = project.id
              AND visible_member.user_id = ${identity.id}
          )
        )
        AND asset.deleted_at IS NULL
        AND asset.saved_at IS NOT NULL
      GROUP BY asset.kind
      ORDER BY count DESC, asset.kind
    `,
    sql<Array<{ count: number; projectId: string; type: AssetKind }>>`
      SELECT
        asset.project_id AS "projectId",
        asset.kind AS type,
        count(*)::integer AS count
      FROM assets asset
      JOIN projects project
        ON project.id = asset.project_id AND project.archived_at IS NULL
      WHERE asset.deleted_at IS NULL
        AND asset.saved_at IS NOT NULL
        AND (
          ${isAdmin}
          OR EXISTS (
            SELECT 1 FROM project_members visible_member
            WHERE visible_member.project_id = project.id
              AND visible_member.user_id = ${identity.id}
          )
        )
      GROUP BY asset.project_id, asset.kind
      ORDER BY asset.project_id, count DESC, asset.kind
    `,
    sql<Array<{ count: number; status: string }>>`
      SELECT job.status, count(*)::integer AS count
      FROM jobs job
      JOIN projects project ON project.id = job.project_id
      WHERE job.created_by = ${identity.id}
        AND job.archived_at IS NULL
        AND project.archived_at IS NULL
        AND (
          ${isAdmin}
          OR EXISTS (
            SELECT 1 FROM project_members visible_member
            WHERE visible_member.project_id = project.id
              AND visible_member.user_id = ${identity.id}
          )
        )
      GROUP BY job.status
    `,
    sql<
      Array<{
        cancelled: number;
        day: string;
        failed: number;
        running: number;
        succeeded: number;
      }>
    >`
      WITH days AS (
        SELECT generate_series(
          current_date - interval '6 days', current_date, interval '1 day'
        )::date AS day
      )
      SELECT
        days.day::text AS day,
        count(job.id) FILTER (WHERE job.status = 'succeeded')::integer AS succeeded,
        count(job.id) FILTER (WHERE job.status = 'failed')::integer AS failed,
        count(job.id) FILTER (
          WHERE job.status IN ('queued', 'running', 'cancelling')
        )::integer AS running,
        count(job.id) FILTER (WHERE job.status = 'cancelled')::integer AS cancelled
      FROM days
      LEFT JOIN jobs job
        ON job.created_by = ${identity.id}
        AND job.archived_at IS NULL
        AND job.created_at::date = days.day
        AND (
          EXISTS (
            SELECT 1
            FROM projects project
            WHERE project.id = job.project_id
              AND project.archived_at IS NULL
              AND (
                ${isAdmin}
                OR EXISTS (
                  SELECT 1 FROM project_members visible_member
                  WHERE visible_member.project_id = project.id
                    AND visible_member.user_id = ${identity.id}
                )
              )
          )
        )
      GROUP BY days.day
      ORDER BY days.day
    `,
    sql<
      Array<{
        activeJobCount: number;
        id: string;
        lastAppKey: null | string;
        lastAppName: null | string;
        previewAssetId: null | string;
        projectCode: string;
        projectId: string;
        projectName: string;
        roundCount: number;
        title: string;
        updatedAt: Date;
      }>
    >`
      SELECT
        conversation.id,
        conversation.title,
        conversation.project_id AS "projectId",
        project.code AS "projectCode",
        project.name AS "projectName",
        conversation.updated_at AS "updatedAt",
        count(job.id)::integer AS "roundCount",
        count(job.id) FILTER (
          WHERE job.status IN ('queued', 'running', 'cancelling')
        )::integer AS "activeJobCount",
        latest_job.app_key AS "lastAppKey",
        latest_application.short_name AS "lastAppName",
        latest_output.asset_id AS "previewAssetId"
      FROM design_conversations conversation
      JOIN projects project
        ON project.id = conversation.project_id
        AND project.archived_at IS NULL
      LEFT JOIN jobs job
        ON job.design_conversation_id = conversation.id
        AND job.archived_at IS NULL
      LEFT JOIN LATERAL (
        SELECT recent_job.id, recent_job.app_key
        FROM jobs recent_job
        WHERE recent_job.design_conversation_id = conversation.id
          AND recent_job.archived_at IS NULL
        ORDER BY recent_job.created_at DESC
        LIMIT 1
      ) latest_job ON true
      LEFT JOIN applications latest_application
        ON latest_application.key = latest_job.app_key
      LEFT JOIN LATERAL (
        SELECT output.asset_id
        FROM job_outputs output
        JOIN assets output_asset
          ON output_asset.id = output.asset_id
          AND output_asset.deleted_at IS NULL
          AND output_asset.kind = 'image'
        WHERE output.job_id = latest_job.id
        ORDER BY output.position
        LIMIT 1
      ) latest_output ON true
      WHERE conversation.user_id = ${identity.id}
        AND conversation.archived_at IS NULL
        AND (
          ${isAdmin}
          OR EXISTS (
            SELECT 1 FROM project_members visible_member
            WHERE visible_member.project_id = conversation.project_id
              AND visible_member.user_id = ${identity.id}
          )
        )
      GROUP BY
        conversation.id, project.id, latest_job.app_key,
        latest_application.short_name, latest_output.asset_id
      ORDER BY conversation.updated_at DESC
      LIMIT 3
    `,
    sql<
      Array<{
        appName: string;
        createdAt: Date;
        id: string;
        name: string;
        progress: number;
        projectCode: string;
        projectId: string;
        projectName: string;
        publicId: string;
        status: string;
      }>
    >`
      SELECT
        job.id,
        job.public_id AS "publicId",
        job.name,
        job.status,
        job.progress,
        job.created_at AS "createdAt",
        job.project_id AS "projectId",
        project.code AS "projectCode",
        project.name AS "projectName",
        application.short_name AS "appName"
      FROM jobs job
      JOIN projects project
        ON project.id = job.project_id AND project.archived_at IS NULL
      JOIN applications application ON application.key = job.app_key
      WHERE job.created_by = ${identity.id}
        AND job.archived_at IS NULL
        AND (
          ${isAdmin}
          OR EXISTS (
            SELECT 1 FROM project_members visible_member
            WHERE visible_member.project_id = project.id
              AND visible_member.user_id = ${identity.id}
          )
        )
      ORDER BY
        CASE WHEN job.status IN ('queued', 'running', 'cancelling') THEN 0
             WHEN job.status = 'failed' THEN 1 ELSE 2 END,
        job.created_at DESC
      LIMIT 5
    `,
    sql<
      Array<{
        appName: null | string;
        createdAt: Date;
        id: string;
        mimeType: string;
        name: string;
        projectCode: string;
        projectId: string;
        projectName: string;
        publicId: string;
        type: AssetKind;
      }>
    >`
      SELECT
        asset.id,
        asset.public_id AS "publicId",
        asset.name,
        asset.kind AS type,
        version.mime_type AS "mimeType",
        asset.created_at AS "createdAt",
        asset.project_id AS "projectId",
        project.code AS "projectCode",
        project.name AS "projectName",
        application.short_name AS "appName"
      FROM assets asset
      JOIN projects project
        ON project.id = asset.project_id AND project.archived_at IS NULL
      JOIN asset_versions version
        ON version.asset_id = asset.id AND version.version = asset.current_version
      LEFT JOIN applications application
        ON application.key = asset.source_app_key
      WHERE asset.deleted_at IS NULL
        AND asset.saved_at IS NOT NULL
        AND asset.source = 'workflow'
        AND (
          ${isAdmin}
          OR EXISTS (
            SELECT 1 FROM project_members visible_member
            WHERE visible_member.project_id = project.id
              AND visible_member.user_id = ${identity.id}
          )
        )
      ORDER BY asset.created_at DESC
      LIMIT 6
    `,
  ]);

  const statusMap = Object.fromEntries(
    jobStatuses.map((item) => [item.status, item.count]),
  );
  const assetTypesByProject = new Map<
    string,
    Array<{ count: number; type: AssetKind }>
  >();
  for (const item of projectAssetTypes) {
    const items = assetTypesByProject.get(item.projectId) ?? [];
    items.push({ count: item.count, type: item.type });
    assetTypesByProject.set(item.projectId, items);
  }
  const serializeProject = (project: DashboardProject) => ({
    ...project,
    assetTypes: (assetTypesByProject.get(project.id) ?? []).map(
      ({ count, type }) => ({ count, type }),
    ),
    updatedAt: project.updatedAt.toISOString(),
  });
  return {
    assetTypes,
    currentProject: currentProject ? serializeProject(currentProject) : null,
    flow: {
      applicationCount: applicationCountRows[0]?.count ?? 0,
      assetCount: workspaceSummary?.assetCount ?? 0,
      conversationCount: workspaceSummary?.conversationCount ?? 0,
      resultCount: workspaceSummary?.resultCount ?? 0,
      runningJobCount: accountSummary?.activeJobCount ?? 0,
    },
    jobStatuses: {
      cancelled: statusMap.cancelled ?? 0,
      failed: statusMap.failed ?? 0,
      queued: statusMap.queued ?? 0,
      running: (statusMap.running ?? 0) + (statusMap.cancelling ?? 0),
      succeeded: statusMap.succeeded ?? 0,
    },
    jobTrend,
    recentAssets: recentAssets.map((asset) => ({
      ...asset,
      createdAt: asset.createdAt.toISOString(),
    })),
    recentConversations: recentConversations.map((conversation) => ({
      ...conversation,
      updatedAt: conversation.updatedAt.toISOString(),
    })),
    recentJobs: recentJobs.map((job) => ({
      ...job,
      createdAt: job.createdAt.toISOString(),
    })),
    recentProjects: projects
      .slice(0, 5)
      .map((project) => serializeProject(project)),
    summary: {
      activeJobCount: accountSummary?.activeJobCount ?? 0,
      failedJobCount: accountSummary?.failedJobCount ?? 0,
      projectCount: projects.length,
      unreadNotificationCount: accountSummary?.unreadNotificationCount ?? 0,
    },
  };
});
