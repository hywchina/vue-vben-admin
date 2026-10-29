import { z } from 'zod';

export const MODEL_PART_BYTES = 8 * 1024 * 1024;
export const modelCategorySchema = z.enum([
  'unet',
  'loras',
  'vae',
  'text_encoders',
  'checkpoints',
  'controlnet',
  'upscale_models',
  'clip_vision',
]);
export type ModelCategory = z.infer<typeof modelCategorySchema>;
const extensions = new Set([
  'bin',
  'ckpt',
  'gguf',
  'json',
  'model',
  'pt',
  'pth',
  'safetensors',
  'txt',
]);

export function safeModelPath(value: string) {
  if (
    value.length > 240 ||
    value.includes('\\') ||
    [...value].some(
      (char) =>
        (char.codePointAt(0) ?? 0) < 32 ||
        char.codePointAt(0) === 127 ||
        char === ':',
    )
  )
    return false;
  const parts = value.split('/');
  return (
    parts.length <= 12 &&
    parts.every((p) => p.length > 0 && !p.startsWith('.') && p.trim() === p) &&
    extensions.has(value.split('.').at(-1)?.toLowerCase() ?? '')
  );
}
export const modelFileSchema = z
  .object({
    path: z.string().min(1).refine(safeModelPath, '模型相对路径或文件类型无效'),
    size: z
      .number()
      .int()
      .positive()
      .max(128 * 1024 ** 3),
    sha256: z
      .string()
      .regex(/^[a-fA-F0-9]{64}$/)
      .transform((s) => s.toLowerCase())
      .optional(),
  })
  .strict();
export const createModelSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    category: modelCategorySchema,
    note: z.string().trim().max(1000).default(''),
    files: z.array(modelFileSchema).min(1).max(256),
  })
  .strict()
  .superRefine((v, ctx) => {
    const paths = new Set(v.files.map((f) => f.path.toLowerCase()));
    if (paths.size !== v.files.length)
      ctx.addIssue({ code: 'custom', message: '文件相对路径不能重复' });
    if (
      !v.files.some((f) =>
        /\.(safetensors|gguf|bin|pt|pth|ckpt)$/i.test(f.path),
      )
    )
      ctx.addIssue({ code: 'custom', message: '未找到模型权重文件' });
  });
export type ModelFile = z.infer<typeof modelFileSchema> & {
  actualSha256?: string;
};
export const modelReplacementSchema = z
  .object({
    capabilityCode: z.string().min(1).max(100),
    baseVersionId: z.string().uuid(),
    replacements: z
      .array(
        z
          .object({
            nodeId: z.string().min(1).max(100),
            inputName: z.string().min(1).max(100),
            oldValue: z.string().min(1).max(512),
            filePath: z.string().refine(safeModelPath),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict();

// Only model-loader inputs are writable, never arbitrary strings in the graph.
export const modelInputs: Record<string, ModelCategory> = {
  unet_name: 'unet',
  diffusion_model: 'unet',
  lora_name: 'loras',
  vae_name: 'vae',
  clip_name: 'text_encoders',
  clip_name1: 'text_encoders',
  clip_name2: 'text_encoders',
  clip_name3: 'text_encoders',
  ckpt_name: 'checkpoints',
  control_net_name: 'controlnet',
  model_name: 'upscale_models',
  clip_vision: 'clip_vision',
};
