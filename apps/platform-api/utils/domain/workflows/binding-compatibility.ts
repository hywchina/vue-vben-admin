import { z } from 'zod';

import { WORKFLOW_CATALOG } from './catalog';
import { workflowOutputSchema, workflowParameterSchema } from './schema';

const mediaTypes = new Set(['asset', 'capture', 'mask', 'region']);

/** Binding changes implementation, never the application's input/output contract. */
export function workflowBindingCompatible(
  appKey: string,
  parameterSchema: unknown,
  outputSchema: unknown,
) {
  const entry = WORKFLOW_CATALOG.find(
    (item) => item.application.key === appKey,
  );
  if (!entry) return false;
  const fields = z.array(workflowParameterSchema).safeParse(parameterSchema);
  const outputs = z.array(workflowOutputSchema).safeParse(outputSchema);
  if (!fields.success || !outputs.success) return false;
  const expected = z
    .array(workflowParameterSchema)
    .parse(entry.version.parameterSchema);
  const expectedOutputs = z
    .array(workflowOutputSchema)
    .parse(entry.version.outputSchema);
  const primaryKinds = (items: typeof outputs.data) =>
    [
      ...new Set(
        items
          .filter((item) => item.role === 'primary')
          .map((item) => item.kind),
      ),
    ]
      .toSorted()
      .join(',');
  if (primaryKinds(outputs.data) !== primaryKinds(expectedOutputs))
    return false;

  const requiredMedia = expected.filter((field) => mediaTypes.has(field.type));
  const candidateMedia = fields.data.filter((field) =>
    mediaTypes.has(field.type),
  );
  for (const field of candidateMedia) {
    const role = requiredMedia.find(
      (item) =>
        item.assetIndex === field.assetIndex && item.type === field.type,
    );
    if (
      !role ||
      role.required !== field.required ||
      role.acceptedKinds.some((kind) => !field.acceptedKinds.includes(kind)) ||
      (role.type === 'region' && role.key !== field.key)
    )
      return false;
  }
  if (
    requiredMedia.some(
      (role) =>
        role.required &&
        !candidateMedia.some(
          (field) =>
            field.assetIndex === role.assetIndex && field.type === role.type,
        ),
    )
  )
    return false;
  // Custom node IDs, translated labels and model filenames may differ.
  // A prompt-driven capability must still accept the main prompt.
  if (
    expected.some((field) => field.key === 'prompt') &&
    !fields.data.some(
      (field) =>
        field.key === 'prompt' && ['text', 'textarea'].includes(field.type),
    )
  )
    return false;
  return true;
}
