import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';

import { WORKFLOW_CATALOG_BASE } from '../utils/domain/workflows/catalog';
import { buildCompleteWorkflowParameterSchema } from '../utils/domain/workflows/ui-parameters';

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const objectInfoPath = argument('--object-info');
if (!objectInfoPath) {
  throw new Error('请通过 --object-info 指定 ComfyUI /object_info JSON 文件');
}

const objectInfo = JSON.parse(await readFile(objectInfoPath, 'utf8')) as Record<
  string,
  never
>;
const schemaUrl = new URL(
  '../workflows/comfyui/parameter-schemas.generated.json',
  import.meta.url,
);
const selected = argument('--applications')?.split(',');
if (process.argv.includes('--applications') && !selected) {
  throw new Error('--applications 缺少工作流标识');
}
if (
  selected?.some(
    (key) =>
      !WORKFLOW_CATALOG_BASE.some((entry) => entry.application.key === key),
  )
) {
  throw new Error('--applications 只能包含已注册的工作流标识，以逗号分隔');
}
// Node metadata contains live model choices; keep unrelated version schemas stable.
const parameterSchemas: Record<string, unknown> = selected
  ? JSON.parse(await readFile(schemaUrl, 'utf8'))
  : {};
const entries = WORKFLOW_CATALOG_BASE.filter(
  (entry) => !selected || selected.includes(entry.application.key),
);
for (const entry of entries) {
  const workflowJson = JSON.parse(
    await readFile(
      new URL(`../workflows/comfyui/${entry.fileName}`, import.meta.url),
      'utf8',
    ),
  ) as unknown;
  parameterSchemas[entry.application.key] =
    buildCompleteWorkflowParameterSchema(
      workflowJson,
      entry.version.parameterSchema,
      objectInfo,
    );
}

await writeFile(schemaUrl, `${JSON.stringify(parameterSchemas, null, 2)}\n`);
console.warn(`已同步 ${entries.length} 项工作流的完整参数。`);
