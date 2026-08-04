import { useDatabase } from '~/utils/database';
import { requireIdentity } from '~/utils/identity';
import { apiHandler } from '~/utils/response';

export default apiHandler(async (event) => {
  await requireIdentity(event);
  const sql = useDatabase();
  const applications = await sql<
    {
      acceptedAssetTypes: string[];
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
      key,
      name,
      short_name AS "shortName",
      description,
      category,
      icon,
      color,
      provider,
      status,
      accepted_asset_types AS "acceptedAssetTypes",
      output_asset_types AS "outputAssetTypes",
      updated_at AS "updatedAt"
    FROM applications
    ORDER BY created_at
  `;
  return applications.map((application) => ({
    ...application,
    updatedAt: application.updatedAt.toISOString(),
  }));
});
