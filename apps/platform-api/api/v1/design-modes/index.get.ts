import { useDatabase } from '~/utils/database';
import { requireIdentity } from '~/utils/identity';
import { apiHandler } from '~/utils/response';
export default apiHandler(async (event) => {
  await requireIdentity(event);
  return useDatabase()`SELECT design_mode AS "designMode", application_keys AS "applicationKeys", default_image_application_key AS "defaultImageApplicationKey", revision FROM design_mode_applications ORDER BY CASE design_mode WHEN 'cabin' THEN 1 WHEN 'component' THEN 2 ELSE 3 END`;
});
