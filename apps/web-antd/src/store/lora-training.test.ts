import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createLoraParameters,
  LORA_FIELDS,
  loraDemoDisplay,
  loraFieldValue,
  updateLoraParameter,
  validLoraParameters,
} from '#/modules/platform/lora-training';
import LoraParameterField from '#/views/platform/model-training/lora-parameter-field.vue';

vi.mock('@vben/icons', () => ({
  IconifyIcon: defineComponent({
    props: ['icon'],
    setup: (props) => () => h('span', props.icon),
  }),
}));
vi.mock('ant-design-vue', () => {
  const field = (type: string) =>
    defineComponent({
      props: ['value', 'checked', 'options'],
      emits: ['update:value', 'update:checked'],
      setup:
        (props, { emit }) =>
        () =>
          h(
            (
              { textarea: 'textarea', select: 'select' } as Record<
                string,
                string
              >
            )[type] ?? 'input',
            {
              type,
              value: props.value,
              checked: props.checked,
              onInput: (event: Event) => {
                const target = event.target as HTMLInputElement;
                emit(
                  'update:value',
                  type === 'number' ? Number(target.value) : target.value,
                );
              },
              onChange: (event: Event) =>
                emit(
                  'update:checked',
                  (event.target as HTMLInputElement).checked,
                ),
            },
            type === 'select'
              ? props.options?.map((option: { label: string; value: string }) =>
                  h('option', { value: option.value }, option.label),
                )
              : undefined,
          ),
    });
  return {
    Input: field('text'),
    InputNumber: field('number'),
    Select: field('select'),
    Switch: field('checkbox'),
    Textarea: field('textarea'),
    Tooltip: defineComponent({
      setup:
        (_, { slots }) =>
        () =>
          h('div', [
            slots.default?.(),
            h('aside', { role: 'tooltip' }, slots.title?.()),
          ]),
    }),
  };
});
function required<T>(value: null | T | undefined): T {
  if (value === undefined || value === null)
    throw new Error('Missing test element');
  return value;
}

const disposers: (() => void)[] = [];
afterEach(() => disposers.splice(0).forEach((dispose) => dispose()));

describe('loRA demo fields', () => {
  it('initializes common fields from the ordinary demo, not Epoch/smoke/default UI', () => {
    const parameters = createLoraParameters();
    expect(parameters).toMatchObject({
      steps: 1500,
      repeats: 1,
      rank: 16,
      learningRate: 0.0001,
      resolution: 512,
      disableSampling: true,
    });
    expect(parameters).not.toHaveProperty('epochs');
    parameters.repeats = 100;
    expect(parameters.steps).toBe(1500);
    expect(validLoraParameters(parameters)).toBe(true);
  });
  it('derives values and redacts server-controlled paths', () => {
    const parameters = {
      ...createLoraParameters(),
      rank: 32,
      resolution: 768 as const,
    };
    const value = (suffix: string) =>
      loraFieldValue(
        required(LORA_FIELDS.find((field) => field.path.endsWith(suffix))),
        parameters,
      );
    expect(value('network.linear_alpha')).toBe(32);
    expect(value('sample.width')).toBe(768);
    expect(value('sample.height')).toBe(768);
    expect(value('logging.use_ui_logger')).toBe(true);
    for (const field of LORA_FIELDS) {
      expect(String(loraFieldValue(field, parameters))).not.toMatch(
        /\/home\/|\/srv\/|undefined/,
      );
      expect(loraDemoDisplay(field)).not.toMatch(/\/home\//);
    }
  });
  it.each([
    { steps: 0 },
    { steps: 10_001 },
    { steps: 100.5 },
    { repeats: 0 },
    { repeats: 1.5 },
    { learningRate: Number.NaN },
    { rank: 12 },
    { triggerWord: '' },
    { previewPrompt: 'x'.repeat(1001) },
  ])('blocks invalid draft %j', (invalid) => {
    expect(validLoraParameters({ ...createLoraParameters(), ...invalid })).toBe(
      false,
    );
  });
  it('handles cleared numbers without silently submitting the old valid value', () => {
    const parameters = createLoraParameters();
    updateLoraParameter(parameters, 'steps', null);
    expect(parameters.steps).toBe(0);
    expect(validLoraParameters(parameters)).toBe(false);
    updateLoraParameter(parameters, 'steps', 800);
    expect(validLoraParameters(parameters)).toBe(true);
  });
  it('renders every field with an accessible question icon, demo value and explanation; fixed items have no input', () => {
    const parameters = createLoraParameters();
    const root = document.createElement('div');
    document.body.append(root);
    const app = createApp({
      render: () =>
        h(
          'div',
          LORA_FIELDS.map((field) =>
            h(LoraParameterField, {
              field,
              value: loraFieldValue(field, parameters),
            }),
          ),
        ),
    });
    app.mount(root);
    disposers.push(() => {
      app.unmount();
      root.remove();
    });
    const fields = root.querySelectorAll('[data-lora-path]');
    expect(fields.length).toBe(LORA_FIELDS.length);
    fields.forEach((element, index) => {
      const field = required(LORA_FIELDS[index]);
      expect(
        element.querySelector(`button[aria-label="${field.label}参数说明"]`),
      ).not.toBeNull();
      expect(element.querySelector('[role="tooltip"]')?.textContent).toContain(
        field.help,
      );
      expect(element.querySelector('[role="tooltip"]')?.textContent).toContain(
        'demo 默认值',
      );
      expect(Boolean(element.querySelector('input, select, textarea'))).toBe(
        Boolean(field.binding),
      );
      const value = loraFieldValue(field, parameters);
      const readonlyText = value === '' ? '空字符串' : String(value);
      expect(element.querySelector('.lora-readonly')?.textContent ?? null).toBe(
        field.binding ? null : readonlyText,
      );
    });
  });
  it('emits editable values without mutating the source demo', async () => {
    const field = required(
      LORA_FIELDS.find((item) => item.binding === 'steps'),
    );
    const change = vi.fn();
    const root = document.createElement('div');
    const app = createApp(LoraParameterField, {
      field,
      value: 1500,
      onChange: change,
    });
    app.mount(root);
    disposers.push(() => app.unmount());
    const input = required(root.querySelector('input'));
    input.value = '800';
    input.dispatchEvent(new Event('input'));
    await nextTick();
    expect(change).toHaveBeenCalledWith(800);
    expect(createLoraParameters().steps).toBe(1500);
  });
});
