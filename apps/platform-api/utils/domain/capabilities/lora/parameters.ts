import { z } from 'zod';

import { DEFAULT_LORA_BASE_MODEL } from './template';

export const loraParametersSchema = z.object({
  baseModel: z.literal(DEFAULT_LORA_BASE_MODEL),
  disableSampling: z.boolean().default(true),
  learningRate: z.number().min(0.000001).max(0.01),
  previewPrompt: z.string().trim().max(1000).default(''),
  rank: z
    .number()
    .int()
    .refine((value) => [4, 8, 16, 32, 64].includes(value)),
  repeats: z.number().int().min(1).max(100),
  resolution: z.union([z.literal(512), z.literal(768), z.literal(1024)]),
  steps: z.number().int().min(20).max(10_000),
  triggerWord: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(
      /^[A-Za-z][A-Za-z0-9_-]*$/,
      '触发词只能包含英文、数字、下划线和连字符',
    ),
});

export const createLoraTrainingSchema = z
  .object({
    items: z
      .array(
        z.object({
          assetId: z.string().uuid(),
          caption: z.string().trim().min(1).max(1000),
        }),
      )
      .min(1),
    name: z.string().trim().min(1).max(200),
    parameters: loraParametersSchema,
    projectId: z.string().uuid(),
  })
  .superRefine((input, context) => {
    if (
      new Set(input.items.map((item) => item.assetId)).size !==
      input.items.length
    ) {
      context.addIssue({
        code: 'custom',
        message: '训练图片不能重复选择',
        path: ['items'],
      });
    }
  });
