import type { AssetKind } from './validation';

import { useDatabase } from '../../database';
import { assetAccent, assetFormat, formatFileSize } from './validation';

interface AssetViewRow {
  createdAt: Date;
  description: string;
  favorite: boolean;
  id: string;
  kind: AssetKind;
  mimeType: string;
  name: string;
  originalFilename: null | string;
  owner: string;
  projectId: string;
  sizeBytes: number;
  source: 'upload' | 'workflow';
  sourceAppKey: null | string;
  sourceJobId: null | string;
  status: string;
  tags: null | string[];
  version: number;
}

function mapAsset(row: AssetViewRow) {
  return {
    accent: assetAccent(row.kind),
    createdAt: row.createdAt.toISOString(),
    description: row.description,
    favorite: row.favorite,
    format: assetFormat(row.originalFilename, row.mimeType),
    id: row.id,
    mimeType: row.mimeType,
    name: row.name,
    owner: row.owner,
    projectId: row.projectId,
    size: formatFileSize(row.sizeBytes),
    sizeBytes: row.sizeBytes,
    source: row.source,
    sourceAppKey: row.sourceAppKey ?? undefined,
    sourceJobId: row.sourceJobId ?? undefined,
    status: row.status,
    tags: row.tags ?? [],
    type: row.kind,
    version: row.version,
  };
}

const selectAssetColumns = `
  a.id,
  a.project_id AS "projectId",
  a.name,
  a.description,
  a.kind,
  a.source,
  a.source_app_key AS "sourceAppKey",
  a.source_job_id AS "sourceJobId",
  a.status,
  a.created_at AS "createdAt",
  u.real_name AS owner,
  av.version,
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
    JOIN asset_versions av
      ON av.asset_id = a.id AND av.version = a.current_version
    LEFT JOIN asset_tags at ON at.asset_id = a.id
    WHERE a.id = $1 AND a.deleted_at IS NULL
    GROUP BY a.id, u.real_name, av.id`,
    [assetId, userId],
  );
  return rows[0] ? mapAsset(rows[0]) : null;
}

export async function listAssetViews(projectId: string, userId: string) {
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
    JOIN asset_versions av
      ON av.asset_id = a.id AND av.version = a.current_version
    LEFT JOIN asset_tags at ON at.asset_id = a.id
    WHERE a.project_id = $1 AND a.deleted_at IS NULL
    GROUP BY a.id, u.real_name, av.id
    ORDER BY a.created_at DESC`,
    [projectId, userId],
  );
  return rows.map((row) => mapAsset(row));
}
