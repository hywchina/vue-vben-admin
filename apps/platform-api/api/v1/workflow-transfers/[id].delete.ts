import { getRouterParam } from 'h3';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import { requireIdentity } from '~/utils/identity';
import { ApiError, apiHandler } from '~/utils/response';

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const transferId = getRouterParam(event, 'id');
  if (!transferId) {
    throw new ApiError(400, 'WORKFLOW_TRANSFER_ID_REQUIRED', '缺少流转编号');
  }
  const sql = useDatabase();
  const [dismissed] = await sql<{ id: string }[]>`
    UPDATE workflow_asset_transfers
    SET status = 'dismissed', updated_at = now()
    WHERE id = ${transferId}
      AND created_by = ${identity.id}
      AND status = 'pending'
    RETURNING id
  `;
  if (dismissed) {
    await writeAudit(event, {
      action: 'workflow.asset-transfer.dismiss',
      actor: identity,
      module: 'workflow',
      targetId: dismissed.id,
      targetType: 'workflow_asset_transfer',
    });
  }
  return { dismissed: Boolean(dismissed), id: transferId };
});
