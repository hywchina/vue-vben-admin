import { readFile } from 'node:fs/promises';
import process from 'node:process';

import { WORKFLOW_CATALOG } from '../utils/domain/workflows/catalog';
import { parseWorkflowVersion } from '../utils/domain/workflows/schema';

interface ComfyNodeInfo {
  input?: Partial<
    Record<
      'hidden' | 'optional' | 'required',
      Record<string, unknown | unknown[]>
    >
  >;
}

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function requestJson(url: URL, token?: string) {
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    throw new Error(`${url.pathname} 返回 HTTP ${response.status}`);
  }
  return (await response.json()) as Record<string, unknown>;
}

async function main() {
  const rawUrl = option('--url') ?? process.env.COMFYUI_API_URL;
  const token = option('--token') ?? process.env.COMFYUI_API_TOKEN;
  if (!rawUrl) {
    throw new Error('请使用 --url 或 COMFYUI_API_URL 指定 ComfyUI 地址');
  }
  const baseUrl = new URL(rawUrl.endsWith('/') ? rawUrl : `${rawUrl}/`);
  await requestJson(new URL('system_stats', baseUrl), token);
  const objectInfo = await requestJson(new URL('object_info', baseUrl), token);
  const availableClasses = new Set(Object.keys(objectInfo));
  let issueCount = 0;

  console.warn(`ComfyUI 连通成功：${baseUrl.origin}`);
  console.warn(`已加载节点类型：${availableClasses.size}`);
  for (const entry of WORKFLOW_CATALOG) {
    const apiJson = JSON.parse(
      await readFile(
        new URL(`../workflows/comfyui/${entry.fileName}`, import.meta.url),
        'utf8',
      ),
    ) as unknown;
    const version = parseWorkflowVersion({ apiJson, ...entry.version });
    const workflow = version.apiJson;
    const runtimeTargets = new Set<string>();
    for (const parameter of version.parameterSchema) {
      if (Array.isArray(parameter.targets)) {
        for (const target of parameter.targets) {
          runtimeTargets.add(`${target.nodeId}.${target.inputName}`);
        }
      } else if (parameter.nodeId && parameter.inputName) {
        runtimeTargets.add(`${parameter.nodeId}.${parameter.inputName}`);
      }
    }
    const requiredClasses = [
      ...new Set(Object.values(workflow).map((node) => node.class_type)),
    ].toSorted();
    const missing = requiredClasses.filter(
      (classType) => !availableClasses.has(classType),
    );
    const incompatibleInputs: string[] = [];
    const unavailableChoices: string[] = [];
    for (const [nodeId, node] of Object.entries(workflow)) {
      const definition = objectInfo[node.class_type] as
        | ComfyNodeInfo
        | undefined;
      if (!definition?.input) continue;
      const declaredInputs = {
        ...definition.input.required,
        ...definition.input.optional,
        ...definition.input.hidden,
      };
      for (const [inputName, value] of Object.entries(node.inputs)) {
        if (!(inputName in declaredInputs)) {
          incompatibleInputs.push(`${nodeId}.${inputName}`);
          continue;
        }
        const inputDefinition = declaredInputs[inputName];
        const choices = Array.isArray(inputDefinition)
          ? inputDefinition[0]
          : undefined;
        if (
          typeof value === 'string' &&
          Array.isArray(choices) &&
          choices.length > 0 &&
          choices.every((choice) => typeof choice === 'string') &&
          !choices.includes(value) &&
          !runtimeTargets.has(`${nodeId}.${inputName}`)
        ) {
          unavailableChoices.push(`${nodeId}.${inputName}=${value}`);
        }
      }
    }
    const issues = missing.length + unavailableChoices.length;
    issueCount += issues;
    console.warn(
      `\n[${issues === 0 ? 'READY' : 'BLOCKED'}] ${entry.application.name}`,
    );
    console.warn(`  workflow: ${entry.workflow.code}`);
    console.warn(`  nodes: ${requiredClasses.length}`);
    console.warn(
      `  missing: ${missing.length === 0 ? '无' : missing.join(', ')}`,
    );
    console.warn(
      `  compatibility warnings: ${
        incompatibleInputs.length === 0 ? '无' : incompatibleInputs.join(', ')
      }`,
    );
    console.warn(
      `  unavailable choices: ${
        unavailableChoices.length === 0 ? '无' : unavailableChoices.join(', ')
      }`,
    );
    console.warn(
      `  models: ${entry.version.modelRequirements.join(', ') || '无额外声明'}`,
    );
  }
  if (issueCount > 0) {
    throw new Error(`预检失败：共发现 ${issueCount} 个真实服务兼容问题`);
  }
  console.warn('\n全部工作流节点和静态枚举值预检通过。');
}

main().catch((error) => {
  console.error('ComfyUI 真实服务预检失败', error);
  process.exitCode = 1;
});
