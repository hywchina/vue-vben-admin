import type { z } from 'zod';

import type { modelReplacementSchema } from './schema';

import { useDatabase } from '../../database';
import { ApiError } from '../../response';
import {
  getCapabilityByCode,
  toPublicCapability,
  workflowChecksum,
} from '../workflows/repository';
import { parseWorkflowVersion } from '../workflows/schema';
import {
  comfyModelClient,
  getManagedModel,
  loaderOptions,
  managedFileName,
} from './repository';
import { modelInputs } from './schema';

type UpdateInput = z.infer<typeof modelReplacementSchema>;
export async function listModelUpdates(actorId: string) {
  return useDatabase()`SELECT mu.id,mu.model_id AS "modelId",mu.capability_code AS "capabilityCode",c.app_key AS "appKey",wd.name AS "workflowName",wv.version,mu.published_at AS "publishedAt",j.id AS "testJobId",j.status AS "testStatus",j.public_id AS "testPublicId"
    FROM managed_model_updates mu JOIN capabilities c ON c.code=mu.capability_code JOIN workflow_versions wv ON wv.id=mu.candidate_version_id JOIN workflow_definitions wd ON wd.id=wv.workflow_id
    LEFT JOIN LATERAL(SELECT j.id,j.status,j.public_id FROM managed_model_tests t JOIN jobs j ON j.id=t.job_id WHERE t.update_id=mu.id AND j.created_by=${actorId} ORDER BY j.created_at DESC LIMIT 1)j ON true
    WHERE wd.deleted_at IS NULL ORDER BY mu.created_at DESC LIMIT 500`;
}
export function replaceModelInputs(
  version: Parameters<typeof parseWorkflowVersion>[0],
  modelId: string,
  category: string,
  replacements: UpdateInput['replacements'],
) {
  const candidate = parseWorkflowVersion(structuredClone(version));
  const seen = new Set<string>();
  for (const r of replacements) {
    const key = `${r.nodeId}:${r.inputName}`;
    const node = candidate.apiJson[r.nodeId];
    if (
      seen.has(key) ||
      modelInputs[r.inputName] !== category ||
      !node ||
      node.inputs[r.inputName] !== r.oldValue
    )
      throw new ApiError(
        409,
        'MODEL_REFERENCE_CHANGED',
        '模型节点类型、旧值或引用位置不匹配',
      );
    seen.add(key);
    const filename = managedFileName(modelId, r.filePath);
    node.inputs[r.inputName] = filename;
    for (const field of candidate.parameterSchema) {
      if (field.nodeId === r.nodeId && field.inputName === r.inputName) {
        field.defaultValue = filename;
        if (field.type === 'select')
          field.options = [
            ...field.options.filter((o) => o.value !== filename),
            { label: r.filePath, value: filename },
          ];
      }
    }
    candidate.modelRequirements = candidate.modelRequirements.map((v) =>
      v === r.oldValue ? filename : v,
    );
    if (!candidate.modelRequirements.includes(filename))
      candidate.modelRequirements.push(filename);
  }
  return parseWorkflowVersion(candidate);
}

export async function modelReferences() {
  const rows = await useDatabase()<
    {
      apiJson: Record<
        string,
        { class_type: string; inputs: Record<string, unknown> }
      >;
      appKey: string;
      capabilityCode: string;
      version: number;
      versionId: string;
      workflowId: string;
      workflowName: string;
    }[]
  >`
    SELECT c.code AS "capabilityCode",c.app_key AS "appKey",wd.id AS "workflowId",wd.name AS "workflowName",wv.id AS "versionId",wv.version,wv.api_json AS "apiJson"
    FROM capability_workflows cw JOIN capabilities c ON c.code=cw.capability_code JOIN workflow_versions wv ON wv.id=cw.workflow_version_id JOIN workflow_definitions wd ON wd.id=wv.workflow_id
    WHERE cw.active=true AND wd.deleted_at IS NULL AND wd.status='published' AND c.status='published'`;
  return rows.flatMap((row) =>
    Object.entries(row.apiJson).flatMap(([nodeId, node]) =>
      Object.entries(node.inputs ?? {}).flatMap(([inputName, value]) =>
        typeof value === 'string' && modelInputs[inputName]
          ? [
              {
                capabilityCode: row.capabilityCode,
                appKey: row.appKey,
                workflowId: row.workflowId,
                workflowName: row.workflowName,
                versionId: row.versionId,
                version: row.version,
                nodeId,
                inputName,
                classType: node.class_type,
                filename: value,
                category: modelInputs[inputName],
              },
            ]
          : [],
      ),
    ),
  );
}

export async function createModelUpdate(
  modelId: string,
  input: UpdateInput,
  actorId: string,
) {
  const model = await getManagedModel(modelId);
  if (model.status !== 'ready')
    throw new ApiError(409, 'MODEL_NOT_READY', '模型尚未校验入库');
  const base = await getCapabilityByCode(input.capabilityCode);
  if (!base || base.workflowVersionId !== input.baseVersionId)
    throw new ApiError(
      409,
      'MODEL_BINDING_CHANGED',
      '工作流当前版本已变化，请刷新',
    );
  const options = loaderOptions(await comfyModelClient().objectInfo());
  for (const r of input.replacements) {
    const classType = (base.apiJson[r.nodeId] as { class_type?: string })
      ?.class_type;
    if (
      !model.files.some((f) => f.path === r.filePath) ||
      !options.some(
        (o) =>
          o.classType === classType &&
          o.inputName === r.inputName &&
          o.category === model.category &&
          o.files.includes(managedFileName(modelId, r.filePath)),
      )
    )
      throw new ApiError(
        409,
        'MODEL_NOT_DISCOVERED',
        '目标节点尚未识别新模型，请检查模型类型、挂载与自定义节点',
      );
  }
  const snapshot = replaceModelInputs(
    {
      apiJson: base.apiJson,
      parameterSchema: base.parameterSchema,
      outputSchema: base.outputSchema,
      modelRequirements: [],
    },
    modelId,
    model.category,
    input.replacements,
  );
  const sql = useDatabase();
  return sql.begin(async (tx) => {
    const [row] = await tx<
      { modelRequirements: string[]; workflowId: string }[]
    >`SELECT wv.workflow_id AS "workflowId",wv.model_requirements AS "modelRequirements" FROM workflow_versions wv JOIN workflow_definitions wd ON wd.id=wv.workflow_id WHERE wv.id=${input.baseVersionId} AND wd.deleted_at IS NULL FOR UPDATE OF wd`;
    if (!row) throw new ApiError(404, 'WORKFLOW_NOT_FOUND', '工作流不存在');
    const [active] =
      await tx`SELECT 1 FROM capability_workflows WHERE capability_code=${input.capabilityCode} AND workflow_version_id=${input.baseVersionId} AND active=true FOR UPDATE`;
    if (!active)
      throw new ApiError(
        409,
        'MODEL_BINDING_CHANGED',
        '工作流当前版本已变化，请刷新',
      );
    const final = replaceModelInputs(
      {
        ...snapshot,
        apiJson: base.apiJson,
        modelRequirements: row.modelRequirements,
      },
      modelId,
      model.category,
      input.replacements,
    );
    const checksum = workflowChecksum(final);
    const [previous] = await tx<
      { id: string }[]
    >`SELECT id FROM managed_model_updates WHERE model_id=${modelId} AND capability_code=${input.capabilityCode} AND base_version_id=${input.baseVersionId} AND replacements=${tx.json(input.replacements)}::jsonb AND published_at IS NULL`;
    if (previous) return { id: previous.id };
    const [candidate] = await tx<
      { id: string }[]
    >`INSERT INTO workflow_versions(workflow_id,version,api_json,parameter_schema,output_schema,model_requirements,checksum,created_by) SELECT ${row.workflowId},COALESCE(max(version),0)+1,${tx.json(JSON.parse(JSON.stringify(final.apiJson)))},${tx.json(JSON.parse(JSON.stringify(final.parameterSchema)))},${tx.json(final.outputSchema)},${tx.json(final.modelRequirements)},${checksum},${actorId} FROM workflow_versions WHERE workflow_id=${row.workflowId} RETURNING id`;
    if (!candidate) throw new Error('Model workflow version was not created');
    await tx`INSERT INTO capability_workflows(capability_code,workflow_version_id,active,created_by) VALUES(${input.capabilityCode},${candidate.id},false,${actorId})`;
    const [update] = await tx<
      { id: string }[]
    >`INSERT INTO managed_model_updates(model_id,capability_code,base_version_id,candidate_version_id,replacements,created_by) VALUES(${modelId},${input.capabilityCode},${input.baseVersionId},${candidate.id},${tx.json(input.replacements)},${actorId}) RETURNING id`;
    if (!update) throw new Error('Model update was not created');
    return { id: update.id };
  });
}

export async function getModelUpdate(id: string) {
  const [row] = await useDatabase()<
    {
      apiJson: Record<string, unknown>;
      baseVersionId: string;
      candidateVersionId: string;
      capabilityCode: string;
      createdBy: string;
      id: string;
      modelId: string;
      outputSchema: unknown;
      parameterSchema: unknown;
      publishedAt: Date | null;
      replacements: UpdateInput['replacements'];
      version: number;
      workflowCode: string;
      workflowName: string;
    }[]
  >`SELECT mu.id,mu.model_id AS "modelId",mu.capability_code AS "capabilityCode",mu.base_version_id AS "baseVersionId",mu.candidate_version_id AS "candidateVersionId",wv.api_json AS "apiJson",wv.parameter_schema AS "parameterSchema",wv.output_schema AS "outputSchema",wv.version,wd.code AS "workflowCode",wd.name AS "workflowName",mu.created_by AS "createdBy",mu.published_at AS "publishedAt",mu.replacements
    FROM managed_model_updates mu JOIN workflow_versions wv ON wv.id=mu.candidate_version_id JOIN workflow_definitions wd ON wd.id=wv.workflow_id WHERE mu.id=${id} AND wd.deleted_at IS NULL`;
  if (!row) throw new ApiError(404, 'MODEL_UPDATE_NOT_FOUND', '模型更新不存在');
  const base = await getCapabilityByCode(row.capabilityCode);
  if (!base) throw new ApiError(409, 'WORKFLOW_DISABLED', '工作流已停用');
  const model = await getManagedModel(row.modelId);
  if (model.status !== 'ready')
    throw new ApiError(409, 'MODEL_NOT_READY', '模型不可用');
  const capability = {
    ...base,
    apiJson: row.apiJson,
    parameterSchema: row.parameterSchema,
    outputSchema: row.outputSchema,
    workflowVersionId: row.candidateVersionId,
    workflowVersion: row.version,
    workflowCode: row.workflowCode,
    workflowName: row.workflowName,
  };
  const tests = await useDatabase()<
    {
      createdBy: string;
      id: string;
      progress: number;
      publicId: string;
      stage: string;
      status: string;
    }[]
  >`SELECT j.id,j.public_id AS "publicId",j.status,j.stage,j.progress,j.created_by AS "createdBy" FROM managed_model_tests t JOIN jobs j ON j.id=t.job_id WHERE t.update_id=${id} ORDER BY j.created_at DESC LIMIT 10`;
  return {
    record: row,
    capability,
    publicCapability: toPublicCapability(capability, true),
    tests,
  };
}

export async function publishModelUpdate(id: string, actorId: string) {
  const update = await getModelUpdate(id);
  const row = update.record;
  // Check discovery again; files are immutable, and successful test is tied to this exact snapshot.
  const choices = loaderOptions(await comfyModelClient().objectInfo());
  for (const r of row.replacements) {
    const node = row.apiJson[r.nodeId] as { class_type?: string };
    if (
      !choices.some(
        (c) =>
          c.classType === node.class_type &&
          c.inputName === r.inputName &&
          c.files.includes(managedFileName(row.modelId, r.filePath)),
      )
    )
      throw new ApiError(
        409,
        'MODEL_NOT_DISCOVERED',
        'ComfyUI 无法识别待发布模型',
      );
  }
  const sql = useDatabase();
  return sql.begin(async (tx) => {
    const [workflow] =
      await tx`SELECT wd.id FROM workflow_definitions wd JOIN workflow_versions wv ON wv.workflow_id=wd.id WHERE wv.id=${row.candidateVersionId} AND wd.status='published' AND wd.deleted_at IS NULL FOR UPDATE OF wd`;
    if (!workflow)
      throw new ApiError(409, 'WORKFLOW_DISABLED', '工作流已停用或删除');
    const [locked] = await tx<
      { publishedAt: Date | null }[]
    >`SELECT published_at AS "publishedAt" FROM managed_model_updates WHERE id=${id} FOR UPDATE`;
    if (locked?.publishedAt) return { id };
    const [passed] =
      await tx`SELECT 1 FROM managed_model_tests t JOIN jobs j ON j.id=t.job_id WHERE t.update_id=${id} AND j.status='succeeded' AND j.workflow_version_id=${row.candidateVersionId} AND j.created_by=${actorId} AND EXISTS(SELECT 1 FROM job_outputs WHERE job_id=j.id)`;
    if (!passed)
      throw new ApiError(
        409,
        'MODEL_TEST_REQUIRED',
        '须先由当前管理员完成新版本的真实试运行，并生成输出',
      );
    const [active] =
      await tx`SELECT 1 FROM capability_workflows WHERE capability_code=${row.capabilityCode} AND workflow_version_id=${row.baseVersionId} AND active=true FOR UPDATE`;
    if (!active)
      throw new ApiError(
        409,
        'MODEL_BINDING_CHANGED',
        '当前工作流已被其他管理员更新，请重新建立更新计划',
      );
    await tx`UPDATE capability_workflows SET active=false WHERE capability_code=${row.capabilityCode} AND active=true`;
    await tx`UPDATE capability_workflows SET active=true WHERE capability_code=${row.capabilityCode} AND workflow_version_id=${row.candidateVersionId}`;
    await tx`UPDATE capability_parameter_presentations SET label_workflow_version_id=${row.candidateVersionId} WHERE capability_code=${row.capabilityCode} AND label_workflow_version_id=${row.baseVersionId}`;
    await tx`UPDATE managed_model_updates SET published_at=now() WHERE id=${id}`;
    return { id };
  });
}
