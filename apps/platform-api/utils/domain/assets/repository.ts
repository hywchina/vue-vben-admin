import type { AssetKind } from './validation';

import { useDatabase } from '../../database';
import { assetAccent, assetFormat, formatFileSize } from './validation';

interface AssetViewRow {
  createdAt: Date;
  derivedFromAssetId: null | string;
  description: string;
  favorite: boolean;
  folderId: null | string;
  id: string;
  kind: AssetKind;
  mimeType: string;
  name: string;
  originalFilename: null | string;
  owner: string;
  ownerId: string;
  ownerPublicId: string;
  projectId: string;
  publicId: string;
  sizeBytes: number;
  source: 'upload' | 'workflow';
  sourceAppKey: null | string;
  sourceJobId: null | string;
  sourceJobPublicId: null | string;
  status: string;
  tags: null | string[];
  version: number;
}

export type AssetSortBy = 'createdAt' | 'name' | 'owner' | 'type';
export type AssetSortOrder = 'asc' | 'desc';

function mapAsset(row: AssetViewRow) {
  return {
    accent: assetAccent(row.kind),
    createdAt: row.createdAt.toISOString(),
    derivedFromAssetId: row.derivedFromAssetId ?? undefined,
    description: row.description,
    favorite: row.favorite,
    folderId: row.folderId ?? undefined,
    format: assetFormat(row.originalFilename, row.mimeType),
    id: row.id,
    mimeType: row.mimeType,
    name: row.name,
    owner: row.owner,
    ownerId: row.ownerId,
    ownerPublicId: row.ownerPublicId,
    projectId: row.projectId,
    publicId: row.publicId,
    size: formatFileSize(row.sizeBytes),
    sizeBytes: row.sizeBytes,
    source: row.source,
    sourceAppKey: row.sourceAppKey ?? undefined,
    sourceJobId: row.sourceJobId ?? undefined,
    sourceJobPublicId: row.sourceJobPublicId ?? undefined,
    status: row.status,
    tags: row.tags ?? [],
    type: row.kind,
    version: row.version,
  };
}

const selectAssetColumns = `
  a.id,
  a.public_id AS "publicId",
  a.project_id AS "projectId",
  a.name,
  a.description,
  a.folder_id AS "folderId",
  a.kind,
  a.source,
  a.source_app_key AS "sourceAppKey",
  a.source_job_id AS "sourceJobId",
  source_job.public_id AS "sourceJobPublicId",
  a.status,
  a.created_at AS "createdAt",
  u.real_name AS owner,
  u.id AS "ownerId",
  u.public_id AS "ownerPublicId",
  av.version,
  av.metadata ->> 'derivedFromAssetId' AS "derivedFromAssetId",
  av.original_filename AS "originalFilename",
  av.mime_type AS "mimeType",
  av.size_bytes::float8 AS "sizeBytes"
`;

export async function getAssetView(assetId: string, userId: string) {
  const sql = useDatabase();
  const rows = await sql.unsafe<AssetViewRow[]>(
    `SELECT
      ${selectAssetColumns},
      EXISTS(
        SELECT 1 FROM asset_favorites af
        WHERE af.asset_id = a.id AND af.user_id = $2
      ) AS favorite,
      COALESCE(array_agg(DISTINCT at.tag)
        FILTER (WHERE at.tag IS NOT NULL), '{}') AS tags
    FROM assets a
    JOIN users u ON u.id = a.owner_id
    LEFT JOIN jobs source_job ON source_job.id = a.source_job_id
    JOIN asset_versions av
      ON av.asset_id = a.id AND av.version = a.current_version
    LEFT JOIN asset_tags at ON at.asset_id = a.id
    WHERE a.id = $1 AND a.deleted_at IS NULL
    GROUP BY a.id, u.id, u.real_name, u.public_id, source_job.public_id, av.id`,
    [assetId, userId],
  );
  return rows[0] ? mapAsset(rows[0]) : null;
}

export async function listAssetViews(
  projectId: string,
  userId: string,
  options: {
    folderId?: string;
    ownerId?: string;
    sortBy?: AssetSortBy;
    sortOrder?: AssetSortOrder;
  } = {},
) {
  const sql = useDatabase();
  const sortColumns: Record<AssetSortBy, string> = {
    createdAt: 'a.created_at',
    name: 'lower(a.name)',
    owner: 'lower(u.real_name)',
    type: 'a.kind',
  };
  const sortColumn = sortColumns[options.sortBy ?? 'createdAt'];
  const sortOrder = options.sortOrder === 'asc' ? 'ASC' : 'DESC';
  const rows = await sql.unsafe<AssetViewRow[]>(
    `SELECT
      ${selectAssetColumns},
      EXISTS(
        SELECT 1 FROM asset_favorites af
        WHERE af.asset_id = a.id AND af.user_id = $2
      ) AS favorite,
      COALESCE(array_agg(DISTINCT at.tag)
        FILTER (WHERE at.tag IS NOT NULL), '{}') AS tags
    FROM assets a
    JOIN users u ON u.id = a.owner_id
    LEFT JOIN jobs source_job ON source_job.id = a.source_job_id
    JOIN asset_versions av
      ON av.asset_id = a.id AND av.version = a.current_version
    LEFT JOIN asset_tags at ON at.asset_id = a.id
    WHERE a.project_id = $1
      AND (
        $3::text IS NULL
        OR ($3::text = 'root' AND a.folder_id IS NULL)
        OR EXISTS(
          SELECT 1
          FROM asset_folders requested_folder
          WHERE requested_folder.id::text = $3::text
            AND requested_folder.project_id = a.project_id
            AND requested_folder.deleted_at IS NULL
            AND (
              (
                requested_folder.kind = 'normal'
                AND a.folder_id = requested_folder.id
              )
              OR (
                requested_folder.kind = 'favorites'
                AND EXISTS(
                  SELECT 1 FROM asset_favorites folder_favorite
                  WHERE folder_favorite.asset_id = a.id
                    AND folder_favorite.user_id = $2
                )
              )
            )
        )
      )
      AND a.deleted_at IS NULL
      AND a.saved_at IS NOT NULL
      AND ($4::uuid IS NULL OR a.owner_id = $4::uuid)
    GROUP BY a.id, u.id, u.real_name, u.public_id, source_job.public_id, av.id
    ORDER BY ${sortColumn} ${sortOrder}, a.id ASC`,
    [projectId, userId, options.folderId ?? null, options.ownerId ?? null],
  );
  return rows.map((row) => mapAsset(row));
}
