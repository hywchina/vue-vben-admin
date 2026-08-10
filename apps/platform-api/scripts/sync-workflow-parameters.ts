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
const parameterSchemas: Record<string, unknown> = {};
for (const entry of WORKFLOW_CATALOG_BASE) {
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

await writeFile(
  new URL(
    '../workflows/comfyui/parameter-schemas.generated.json',
    import.meta.url,
  ),
  `${JSON.stringify(parameterSchemas, null, 2)}\n`,
);
console.warn(
  `已同步 ${Object.keys(parameterSchemas).length} 项工作流的完整参数。`,
);
