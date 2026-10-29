import { Buffer } from 'node:buffer';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { checkedDirectory, validateModelFile } from './files';
import { createModelSchema, safeModelPath } from './schema';
import { replaceModelInputs } from './updates';

const directories: string[] = [];
async function temp() {
  const p = await mkdtemp(join(tmpdir(), 'rail-model-unit-'));
  directories.push(p);
  return p;
}
afterEach(async () => {
  for (const p of directories.splice(0))
    await rm(p, { recursive: true, force: true });
});
describe('system model upload boundaries', () => {
  it.each([
    '../model.safetensors',
    '/etc/model.safetensors',
    String.raw`x\model.bin`,
    'x/../model.bin',
    '.hidden/a.bin',
    'a//b.bin',
    'a:link.bin',
    'a/b.py',
    'a/b\u0000.bin',
  ])('rejects unsafe upload path %s', (p) =>
    expect(safeModelPath(p)).toBe(false),
  );
  it('accepts complete model bundles but rejects duplicate or weightless manifests', () => {
    expect(safeModelPath('Qwen/模型-00001-of-00002.safetensors')).toBe(true);
    expect(
      createModelSchema.safeParse({
        name: 'Qwen',
        category: 'text_encoders',
        files: [{ path: 'config.json', size: 10 }],
      }).success,
    ).toBe(false);
    expect(
      createModelSchema.safeParse({
        name: 'x',
        category: 'unet',
        files: [
          { path: 'A.bin', size: 1 },
          { path: 'a.bin', size: 1 },
        ],
      }).success,
    ).toBe(false);
    expect(
      createModelSchema.safeParse({
        name: 'x',
        category: 'loras',
        files: [{ path: 'x.safetensors', size: 32 }],
        root: '/etc',
      }).success,
    ).toBe(false);
  });
  it('refuses symlinked directories inside model storage', async () => {
    const outside = await temp();
    const root = await temp();
    await symlink(outside, join(root, 'loras'));
    await expect(
      checkedDirectory(root, ['loras', 'platform']),
    ).rejects.toMatchObject({ code: 'MODEL_STORAGE_UNSAFE' });
    await mkdir(join(root, 'safe'));
    expect(await checkedDirectory(root, ['safe', 'child'])).toBe(
      join(root, 'safe', 'child'),
    );
  });
  it('rejects corrupted tensor ranges, truncation and invalid GGUF headers', async () => {
    const root = await temp();
    function tensor(end: number) {
      const header = Buffer.from(
        JSON.stringify({
          weight: { dtype: 'F32', shape: [1], data_offsets: [0, end] },
        }),
      );
      const prefix = Buffer.alloc(8);
      prefix.writeBigUInt64LE(BigInt(header.length));
      return Buffer.concat([prefix, header, Buffer.alloc(4)]);
    }
    const file = join(root, 'model.safetensors');
    const valid = tensor(4);
    await writeFile(file, valid);
    await expect(
      validateModelFile(file, valid.length),
    ).resolves.toBeUndefined();
    const invalid = tensor(40);
    await writeFile(file, invalid);
    await expect(validateModelFile(file, invalid.length)).rejects.toThrow(
      '范围',
    );
    await writeFile(file, Buffer.from('bad'));
    await expect(validateModelFile(file, 3)).rejects.toThrow('文件头不完整');
    const gguf = join(root, 'model.gguf');
    await writeFile(gguf, Buffer.alloc(32));
    await expect(validateModelFile(gguf, 32)).rejects.toThrow('GGUF');
  });
});
describe('immutable workflow model revisions', () => {
  const snapshot = {
    apiJson: {
      '1': {
        class_type: 'LoraLoader',
        inputs: { lora_name: 'old.safetensors', strength_model: 1 },
      },
      '2': {
        class_type: 'SaveImage',
        inputs: { filename_prefix: 'old.safetensors' },
      },
    },
    parameterSchema: [
      {
        key: 'lora',
        label: '风格模型',
        type: 'select',
        nodeId: '1',
        inputName: 'lora_name',
        defaultValue: 'old.safetensors',
        options: [{ label: '旧模型', value: 'old.safetensors' }],
      },
    ],
    outputSchema: [{ nodeId: '2', field: 'images', kind: 'image' }],
    modelRequirements: ['old.safetensors', 'vae.safetensors'],
  };
  const replacement = {
    nodeId: '1',
    inputName: 'lora_name',
    oldValue: 'old.safetensors',
    filePath: 'new.safetensors',
  };
  it('replaces only selected model inputs, defaults and model requirements', () => {
    const result = replaceModelInputs(snapshot, 'model-id', 'loras', [
      replacement,
    ]);
    expect(result.apiJson['1']?.inputs.lora_name).toBe(
      'platform/model-id/new.safetensors',
    );
    expect(result.apiJson['2']?.inputs.filename_prefix).toBe('old.safetensors');
    expect(result.parameterSchema[0]?.defaultValue).toBe(
      'platform/model-id/new.safetensors',
    );
    expect(result.modelRequirements).toContain('vae.safetensors');
    expect(snapshot.apiJson['1'].inputs.lora_name).toBe('old.safetensors');
  });
  it('rejects wrong categories, changed old values, arbitrary fields and duplicate targets', () => {
    for (const [category, rs] of [
      ['vae', [replacement]],
      ['loras', [{ ...replacement, oldValue: 'changed' }]],
      [
        'loras',
        [{ ...replacement, nodeId: '2', inputName: 'filename_prefix' }],
      ],
      ['loras', [replacement, replacement]],
    ] as const)
      expect(() =>
        replaceModelInputs(snapshot, 'id', category, [...rs]),
      ).toThrow('模型节点类型、旧值或引用位置不匹配');
  });
});
