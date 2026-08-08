import { getConfig } from '~/utils/config';
import { useDatabase } from '~/utils/database';
import { requireIdentity } from '~/utils/identity';
import { apiHandler } from '~/utils/response';

export default apiHandler(async (event) => {
  await requireIdentity(event);
  const sql = useDatabase();
  const applications = await sql<
    {
      acceptedAssetTypes: string[];
      adapterEnabled: boolean;
      capabilityCode: null | string;
      capabilityReady: boolean;
      category: string;
      color: string;
      description: string;
      icon: string;
      key: string;
      name: string;
      outputAssetTypes: string[];
      provider: string;
      shortName: string;
      status: string;
      updatedAt: Date;
    }[]
  >`
    SELECT
      applications.key,
      applications.name,
      applications.short_name AS "shortName",
      applications.description,
      applications.category,
      applications.icon,
      applications.color,
      applications.provider,
      applications.status,
      COALESCE((applications.adapter_config ->> 'enabled')::boolean, false)
        AS "adapterEnabled",
      c.code AS "capabilityCode",
      (cw.workflow_version_id IS NOT NULL) AS "capabilityReady",
      applications.accepted_asset_types AS "acceptedAssetTypes",
      applications.output_asset_types AS "outputAssetTypes",
      applications.updated_at AS "updatedAt"
    FROM applications
    LEFT JOIN capabilities c
      ON c.app_key = applications.key AND c.status = 'published'
    LEFT JOIN capability_workflows cw
      ON cw.capability_code = c.code AND cw.active = true
    ORDER BY applications.created_at
  `;
  return applications.map((application) => ({
    ...application,
    adapterConfigured: application.capabilityCode
      ? application.capabilityReady && Boolean(getConfig().comfyuiApiUrl)
      : application.adapterEnabled,
    updatedAt: application.updatedAt.toISOString(),
  }));
});
