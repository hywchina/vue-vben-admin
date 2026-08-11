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
  const conversations = await sql<
    {
      activeJobCount: number;
      createdAt: Date;
      id: string;
      lastAppKey: null | string;
      legacy: boolean;
      roundCount: number;
      title: string;
      updatedAt: Date;
    }[]
  >`
    SELECT
      conversation.id,
      conversation.title,
      conversation.created_at AS "createdAt",
      conversation.updated_at AS "updatedAt",
      EXISTS (
        SELECT 1
        FROM workflow_workspace_instances legacy_instance
        WHERE legacy_instance.id = conversation.id
      ) AS legacy,
      count(job.id)::integer AS "roundCount",
      count(job.id) FILTER (
        WHERE job.status IN ('queued', 'running', 'cancelling')
      )::integer AS "activeJobCount",
      (
        SELECT latest.app_key
        FROM jobs latest
        WHERE latest.design_conversation_id = conversation.id
        ORDER BY latest.created_at DESC
        LIMIT 1
      ) AS "lastAppKey"
    FROM design_conversations conversation
    LEFT JOIN jobs job ON job.design_conversation_id = conversation.id
    WHERE conversation.user_id = ${identity.id}
      AND conversation.project_id = ${projectId}
      AND conversation.archived_at IS NULL
    GROUP BY conversation.id
    ORDER BY conversation.updated_at DESC, conversation.created_at DESC
    LIMIT 200
  `;
  return conversations.map((conversation) => ({
    ...conversation,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  }));
});
