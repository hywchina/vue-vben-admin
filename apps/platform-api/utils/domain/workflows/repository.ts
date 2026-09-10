import type { WorkflowCatalogEntry } from './catalog';
import type { WorkflowVersionInput } from './schema';

import { createHash } from 'node:crypto';

import { useDatabase } from '../../database';
import { ApiError } from '../../response';
import { resolveQuickFieldKeys } from './presentation';
import { parseWorkflowVersion, publicParameterSchema } from './schema';

export function workflowChecksum(snapshot: unknown) {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}

export function workflowSupportsImageComparison(
  apiJson: Record<string, unknown>,
) {
  return Object.values(apiJson).some((node) => {
    if (!node || typeof node !== 'object') return false;
    const classType = Reflect.get(node, 'class_type');
    return (
      typeof classType === 'string' &&
      ['image comparer', 'imagecompare'].some((name) =>
        classType.toLowerCase().includes(name),
      )
    );
  });
}

export async function seedWorkflowCatalogEntry(
  entry: WorkflowCatalogEntry,
  apiJson: unknown,
  actorId: null | string,
) {
  const parsed = parseWorkflowVersion({
    apiJson,
    ...entry.version,
  });
  const checksum = workflowChecksum(parsed);
  const sql = useDatabase();
  return await sql.begin(async (transaction) => {
    const [definition] = await transaction<{ id: string }[]>`
      INSERT INTO workflow_definitions (
        code, name, description, provider, status, created_by, updated_by
      ) VALUES (
        ${entry.workflow.code},
        ${entry.workflow.name},
        ${entry.workflow.description},
        'comfyui',
        'published',
        ${actorId},
        ${actorId}
      )
      ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        status = 'published',
        updated_by = EXCLUDED.updated_by,
        updated_at = now()
      RETURNING id
    `;
    if (!definition) throw new Error('初始化工作流定义失败');

    let [version] = await transaction<{ id: string; version: number }[]>`
      SELECT id, version
      FROM workflow_versions
      WHERE workflow_id = ${definition.id} AND checksum = ${checksum}
    `;
    if (!version) {
      const [next] = await transaction<{ version: number }[]>`
        SELECT COALESCE(max(version), 0)::integer + 1 AS version
        FROM workflow_versions
        WHERE workflow_id = ${definition.id}
      `;
      [version] = await transaction<{ id: string; version: number }[]>`
        INSERT INTO workflow_versions (
          workflow_id, version, api_json, parameter_schema, output_schema,
          model_requirements, checksum, created_by
        ) VALUES (
          ${definition.id},
          ${next?.version ?? 1},
          ${transaction.json(JSON.parse(JSON.stringify(parsed.apiJson)))},
          ${transaction.json(JSON.parse(JSON.stringify(parsed.parameterSchema)))},
          ${transaction.json(JSON.parse(JSON.stringify(parsed.outputSchema)))},
          ${transaction.json(JSON.parse(JSON.stringify(parsed.modelRequirements)))},
          ${checksum},
          ${actorId}
        )
        RETURNING id, version
      `;
    }
    if (!version) throw new Error('初始化工作流版本失败');

    await transaction`
      UPDATE capability_workflows
      SET active = false
      WHERE capability_code = ${entry.application.key}
    `;
    await transaction`
      INSERT INTO capability_workflows (
        capability_code, workflow_version_id, active, created_by
      ) VALUES (
        ${entry.application.key}, ${version.id}, true, ${actorId}
      )
      ON CONFLICT (capability_code, workflow_version_id) DO UPDATE
      SET active = true
    `;
    return version;
  });
}

interface CapabilityRow {
  apiJson: Record<string, unknown>;
  appKey: string;
  code: string;
  description: string;
  name: string;
  outputSchema: unknown;
  parameterSchema: unknown;
  quickFieldKeys?: null | string[];
  provider: string;
  workflowCode: string;
  workflowName: string;
  workflowVersion: number;
  workflowVersionId: string;
}

export async function getCapabilityByCode(code: string) {
  const sql = useDatabase();
  const [row] = await sql<CapabilityRow[]>`
    SELECT
      c.code,
      c.app_key AS "appKey",
      c.name,
      c.description,
      wd.provider,
      wd.code AS "workflowCode",
      wd.name AS "workflowName",
      wv.id AS "workflowVersionId",
      wv.version AS "workflowVersion",
      wv.api_json AS "apiJson",
      wv.parameter_schema AS "parameterSchema",
      wv.output_schema AS "outputSchema",
      cp.quick_field_keys AS "quickFieldKeys"
    FROM capabilities c
    LEFT JOIN capability_parameter_presentations cp ON cp.capability_code = c.code
    JOIN capability_workflows cw
      ON cw.capability_code = c.code AND cw.active = true
    JOIN workflow_versions wv ON wv.id = cw.workflow_version_id
    JOIN workflow_definitions wd ON wd.id = wv.workflow_id
    WHERE c.code = ${code}
      AND c.status = 'published'
      AND wd.status = 'published'
  `;
  return row ?? null;
}

export async function getCapabilityByAppKey(appKey: string) {
  const sql = useDatabase();
  const [capability] = await sql<{ code: string }[]>`
    SELECT code
    FROM capabilities
    WHERE app_key = ${appKey} AND status = 'published'
  `;
  return capability ? await getCapabilityByCode(capability.code) : null;
}

export function toPublicCapability(row: CapabilityRow) {
  return {
    appKey: row.appKey,
    code: row.code,
    description: row.description,
    fields: publicParameterSchema(row.parameterSchema),
    presentation: {
      quickFieldKeys: resolveQuickFieldKeys(
        row.parameterSchema,
        row.quickFieldKeys,
      ),
      workflowVersionId: row.workflowVersionId,
    },
    name: row.name,
    outputTypes: (row.outputSchema as { kind?: string }[]).flatMap((output) =>
      output.kind ? [output.kind] : [],
    ),
    provider: row.provider,
    supportsImageComparison: workflowSupportsImageComparison(row.apiJson),
    workflow: {
      code: row.workflowCode,
      name: row.workflowName,
      version: row.workflowVersion,
    },
  };
}

export async function listWorkflowManagement() {
  const sql = useDatabase();
  const workflows = await sql<
    {
      code: string;
      createdAt: Date;
      description: string;
      id: string;
      name: string;
      provider: string;
      status: string;
      updatedAt: Date;
      versions: unknown[];
    }[]
  >`
    SELECT
      wd.id,
      wd.code,
      wd.name,
      wd.description,
      wd.provider,
      wd.status,
      wd.created_at AS "createdAt",
      wd.updated_at AS "updatedAt",
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', wv.id,
            'version', wv.version,
            'apiJson', wv.api_json,
            'parameterSchema', wv.parameter_schema,
            'outputSchema', wv.output_schema,
            'modelRequirements', wv.model_requirements,
            'checksum', wv.checksum,
            'createdAt', wv.created_at,
            'activeCapabilities', COALESCE((
              SELECT jsonb_agg(cw.capability_code)
              FROM capability_workflows cw
              WHERE cw.workflow_version_id = wv.id AND cw.active = true
            ), '[]'::jsonb)
          )
          ORDER BY wv.version DESC
        ) FILTER (WHERE wv.id IS NOT NULL),
        '[]'::jsonb
      ) AS versions
    FROM workflow_definitions wd
    LEFT JOIN workflow_versions wv ON wv.workflow_id = wd.id
    GROUP BY wd.id
    ORDER BY wd.updated_at DESC
  `;
  const capabilities = await sql<
    {
      code: string;
      name: string;
      ready: boolean;
      status: string;
      workflowVersion: null | number;
    }[]
  >`
    SELECT
      c.code,
      c.name,
      c.status,
      (
        c.status = 'published'
        AND cw.active = true
        AND wd.status = 'published'
      ) AS ready,
      wv.version AS "workflowVersion"
    FROM capabilities c
    LEFT JOIN capability_workflows cw
      ON cw.capability_code = c.code AND cw.active = true
    LEFT JOIN workflow_versions wv ON wv.id = cw.workflow_version_id
    LEFT JOIN workflow_definitions wd ON wd.id = wv.workflow_id
    ORDER BY c.created_at
  `;
  const [worker] = await sql<
    { instanceId: string; lastSeenAt: Date; startedAt: Date }[]
  >`
    SELECT
      instance_id AS "instanceId",
      started_at AS "startedAt",
      last_seen_at AS "lastSeenAt"
    FROM worker_heartbeats
    ORDER BY last_seen_at DESC
    LIMIT 1
  `;
  return {
    capabilities,
    worker: worker
      ? {
          instanceId: worker.instanceId,
          lastSeenAt: worker.lastSeenAt.toISOString(),
          online: Date.now() - worker.lastSeenAt.getTime() < 30_000,
          startedAt: worker.startedAt.toISOString(),
        }
      : null,
    workflows: workflows.map((workflow) => ({
      ...workflow,
      createdAt: workflow.createdAt.toISOString(),
      updatedAt: workflow.updatedAt.toISOString(),
    })),
  };
}

export async function createWorkflowDefinition(
  input: {
    code: string;
    description: string;
    name: string;
    publish: boolean;
    version: WorkflowVersionInput;
  },
  actorId: string,
) {
  const parsed = parseWorkflowVersion(input.version);
  const checksum = workflowChecksum(parsed);
  const sql = useDatabase();
  try {
    return await sql.begin(async (transaction) => {
      const [definition] = await transaction<{ id: string }[]>`
        INSERT INTO workflow_definitions (
          code, name, description, status, created_by, updated_by
        ) VALUES (
          ${input.code},
          ${input.name},
          ${input.description},
          ${input.publish ? 'published' : 'draft'},
          ${actorId},
          ${actorId}
        )
        RETURNING id
      `;
      if (!definition) throw new Error('创建工作流失败');
      const [version] = await transaction<{ id: string; version: number }[]>`
        INSERT INTO workflow_versions (
          workflow_id, version, api_json, parameter_schema, output_schema,
          model_requirements, checksum, created_by
        ) VALUES (
          ${definition.id},
          1,
          ${transaction.json(JSON.parse(JSON.stringify(parsed.apiJson)))},
          ${transaction.json(JSON.parse(JSON.stringify(parsed.parameterSchema)))},
          ${transaction.json(JSON.parse(JSON.stringify(parsed.outputSchema)))},
          ${transaction.json(JSON.parse(JSON.stringify(parsed.modelRequirements)))},
          ${checksum},
          ${actorId}
        )
        RETURNING id, version
      `;
      return { id: definition.id, version };
    });
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === '23505'
    ) {
      throw new ApiError(409, 'WORKFLOW_ALREADY_EXISTS', '工作流编码已存在');
    }
    throw error;
  }
}

export async function updateWorkflowDefinition(
  id: string,
  input: {
    description: string;
    name: string;
    status: 'disabled' | 'draft' | 'published';
  },
  actorId: string,
) {
  const sql = useDatabase();
  const [updated] = await sql<{ id: string }[]>`
    UPDATE workflow_definitions
    SET
      name = ${input.name},
      description = ${input.description},
      status = ${input.status},
      updated_by = ${actorId},
      updated_at = now()
    WHERE id = ${id}
    RETURNING id
  `;
  if (!updated) {
    throw new ApiError(404, 'WORKFLOW_NOT_FOUND', '工作流不存在');
  }
  return updated;
}

export async function addWorkflowVersion(
  workflowId: string,
  input: WorkflowVersionInput,
  actorId: string,
) {
  const parsed = parseWorkflowVersion(input);
  const checksum = workflowChecksum(parsed);
  const sql = useDatabase();
  try {
    const [created] = await sql<{ id: string; version: number }[]>`
      INSERT INTO workflow_versions (
        workflow_id, version, api_json, parameter_schema, output_schema,
        model_requirements, checksum, created_by
      )
      SELECT
        wd.id,
        COALESCE(max(wv.version), 0)::integer + 1,
        ${sql.json(JSON.parse(JSON.stringify(parsed.apiJson)))},
        ${sql.json(JSON.parse(JSON.stringify(parsed.parameterSchema)))},
        ${sql.json(JSON.parse(JSON.stringify(parsed.outputSchema)))},
        ${sql.json(JSON.parse(JSON.stringify(parsed.modelRequirements)))},
        ${checksum},
        ${actorId}
      FROM workflow_definitions wd
      LEFT JOIN workflow_versions wv ON wv.workflow_id = wd.id
      WHERE wd.id = ${workflowId}
      GROUP BY wd.id
      RETURNING id, version
    `;
    if (!created) {
      throw new ApiError(404, 'WORKFLOW_NOT_FOUND', '工作流不存在');
    }
    return created;
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === '23505'
    ) {
      throw new ApiError(
        409,
        'WORKFLOW_VERSION_DUPLICATE',
        '相同内容的工作流版本已经存在',
      );
    }
    throw error;
  }
}

export async function bindCapabilityWorkflow(
  capabilityCode: string,
  workflowVersionId: string,
  actorId: string,
) {
  const sql = useDatabase();
  await sql.begin(async (transaction) => {
    const [compatible] = await transaction<{ found: boolean }[]>`
      SELECT true AS found
      FROM capabilities c
      CROSS JOIN workflow_versions wv
      JOIN workflow_definitions wd ON wd.id = wv.workflow_id
      WHERE c.code = ${capabilityCode}
        AND wv.id = ${workflowVersionId}
        AND wd.status = 'published'
    `;
    if (!compatible) {
      throw new ApiError(
        400,
        'WORKFLOW_BINDING_INVALID',
        '能力或已发布工作流版本不存在',
      );
    }
    await transaction`
      UPDATE capability_workflows
      SET active = false
      WHERE capability_code = ${capabilityCode}
    `;
    await transaction`
      INSERT INTO capability_workflows (
        capability_code, workflow_version_id, active, created_by
      ) VALUES (
        ${capabilityCode}, ${workflowVersionId}, true, ${actorId}
      )
      ON CONFLICT (capability_code, workflow_version_id) DO UPDATE
      SET active = true
    `;
  });
  return { capabilityCode, workflowVersionId };
}
