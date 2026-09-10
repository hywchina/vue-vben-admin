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
  const folders = await sql<
    Array<{
      assetCount: number;
      createdAt: Date;
      id: string;
      kind: 'favorites' | 'normal';
      name: string;
      parentId: null | string;
      updatedAt: Date;
    }>
  >`
    SELECT
      folder.id,
      folder.parent_id AS "parentId",
      folder.name,
      folder.kind,
      folder.generation_category AS "generationCategory",
      folder.created_at AS "createdAt",
      folder.updated_at AS "updatedAt",
      CASE
        WHEN folder.kind = 'favorites' THEN (
          SELECT count(*)::integer
          FROM asset_favorites favorite
          JOIN assets favorite_asset ON favorite_asset.id = favorite.asset_id
          WHERE favorite.user_id = ${identity.id}
            AND favorite_asset.project_id = ${projectId}
            AND favorite_asset.deleted_at IS NULL
            AND favorite_asset.saved_at IS NOT NULL
        )
        ELSE count(asset.id)::integer
      END AS "assetCount"
    FROM asset_folders folder
    LEFT JOIN assets asset
      ON asset.folder_id = folder.id
      AND asset.deleted_at IS NULL
      AND asset.saved_at IS NOT NULL
    WHERE folder.project_id = ${projectId}
      AND folder.deleted_at IS NULL
    GROUP BY folder.id
    ORDER BY lower(folder.name), folder.id
  `;
  return folders.map((folder) => ({
    ...folder,
    createdAt: folder.createdAt.toISOString(),
    updatedAt: folder.updatedAt.toISOString(),
  }));
});
