import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { WORKFLOW_CATALOG } from './catalog';
import {
  materializeWorkflow,
  parseWorkflowVersion,
  publicParameterSchema,
} from './schema';

describe('comfyUI workflow catalog', () => {
  it('registers all 18 API workflows with valid controlled mappings', async () => {
    expect(WORKFLOW_CATALOG).toHaveLength(18);
    expect(
      new Set(WORKFLOW_CATALOG.map((entry) => entry.application.key)).size,
    ).toBe(18);

    for (const entry of WORKFLOW_CATALOG) {
      const apiJson = JSON.parse(
        await readFile(
          resolve(process.cwd(), 'workflows/comfyui', entry.fileName),
          'utf8',
        ),
      ) as unknown;
      const parsed = parseWorkflowVersion({ apiJson, ...entry.version });
      expect(Object.keys(parsed.apiJson).length).toBeGreaterThan(0);
      expect(parsed.outputSchema.length).toBeGreaterThan(0);
      const mappedInputs = new Set<string>();
      for (const field of parsed.parameterSchema) {
        if (field.nodeId && field.inputName) {
          mappedInputs.add(`${field.nodeId}:${field.inputName}`);
        }
        for (const target of field.targets) {
          mappedInputs.add(`${target.nodeId}:${target.inputName}`);
        }
      }
      const unmappedLiterals = Object.entries(parsed.apiJson).flatMap(
        ([nodeId, node]) =>
          Object.entries(node.inputs).flatMap(([inputName, value]) => {
            const connected =
              Array.isArray(value) &&
              value.length === 2 &&
              typeof value[1] === 'number' &&
              String(value[0]) in parsed.apiJson;
            return !connected && !mappedInputs.has(`${nodeId}:${inputName}`)
              ? [`${nodeId}:${inputName}`]
              : [];
          }),
      );
      expect(unmappedLiterals).toEqual([]);
      for (const field of publicParameterSchema(parsed.parameterSchema)) {
        expect(field).not.toHaveProperty('nodeId');
        expect(field).not.toHaveProperty('targets');
      }
    }
  });

  it('exposes the complete ScreenShare controls and parameters', () => {
    const screenCapture = WORKFLOW_CATALOG.find(
      (entry) => entry.application.key === 'screen-capture-edit',
    );
    expect(screenCapture).toBeTruthy();
    expect(screenCapture?.version.parameterSchema).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'capturedFrame',
          type: 'capture',
        }),
        expect.objectContaining({
          inputName: 'refresh_rate',
          label: expect.stringContaining('捕获间隔'),
        }),
        expect.objectContaining({
          inputName: 'slide',
          label: expect.stringContaining('降噪强度'),
        }),
      ]),
    );
  });

  it('maps dedicated camera and EasyMark controls into their real nodes', async () => {
    const camera = WORKFLOW_CATALOG.find(
      (entry) => entry.application.key === 'camera-control-single',
    );
    const region = WORKFLOW_CATALOG.find(
      (entry) => entry.application.key === 'region-marker-edit',
    );
    expect(camera).toBeTruthy();
    expect(region).toBeTruthy();
    if (!camera || !region) {
      throw new Error('缺少相机或分区打标工作流目录');
    }
    const loadApiJson = async (fileName: string) =>
      JSON.parse(
        await readFile(
          resolve(process.cwd(), 'workflows/comfyui', fileName),
          'utf8',
        ),
      ) as Record<
        string,
        { class_type: string; inputs: Record<string, unknown> }
      >;
    const cameraPrompt = materializeWorkflow(
      await loadApiJson(camera.fileName),
      camera.version.parameterSchema,
      { horizontalAngle: 225, verticalAngle: 15, zoom: 3.2 },
    );
    expect(cameraPrompt['22']?.inputs).toMatchObject({
      horizontal_angle: 225,
      vertical_angle: 15,
      zoom: 3.2,
    });
    expect(camera.version.parameterSchema).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'horizontalAngle',
          uiControl: 'camera-horizontal',
        }),
      ]),
    );

    const brushData = 'brush:square:8:1:255,0,0:2:10,10;100,100';
    const regionPrompt = materializeWorkflow(
      await loadApiJson(region.fileName),
      region.version.parameterSchema,
      { regionMarks: brushData },
    );
    expect(regionPrompt['362']?.inputs.brush_data).toBe(brushData);
  });

  it('uses explicit current-node wiring for EasyMark region outputs', async () => {
    const loadWorkflow = async (fileName: string) =>
      JSON.parse(
        await readFile(
          resolve(process.cwd(), 'workflows/comfyui', fileName),
          'utf8',
        ),
      ) as Record<
        string,
        { class_type: string; inputs: Record<string, unknown> }
      >;
    const region = await loadWorkflow('region-edit-v1.json');
    const marker = await loadWorkflow('region-marker-edit-v1.json');

    expect(region['291']?.inputs.context).toEqual(['277', 0]);
    expect(marker['363']?.inputs.context).toEqual(['277', 0]);
    expect(marker['366']?.inputs.images).toEqual(['359', 1]);
    expect(Object.values(region)).not.toContainEqual(
      expect.objectContaining({ class_type: 'Anything Everywhere' }),
    );
    expect(Object.values(marker)).not.toContainEqual(
      expect.objectContaining({ class_type: 'Anything Everywhere' }),
    );
  });
});
