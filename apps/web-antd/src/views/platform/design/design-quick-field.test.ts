import type { CapabilityField } from '#/modules/platform/types';

import { createApp, h, nextTick } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import DesignQuickField from './design-quick-field.vue';

vi.mock('@vben/icons', () => ({ IconifyIcon: () => null }));

vi.mock('ant-design-vue', async () => {
  const { defineComponent, h } = await import('vue');
  const input = defineComponent({
    props: ['value', 'checked'],
    emits: ['update:value', 'update:checked'],
    setup:
      (props, { emit }) =>
      () =>
        h('input', {
          value: props.value,
          checked: props.checked,
          onInput: (event: Event) =>
            emit('update:value', (event.target as HTMLInputElement).value),
          onChange: () => emit('update:checked', !props.checked),
        }),
  });
  return {
    Popover: defineComponent({
      setup:
        (_, { slots }) =>
        () =>
          h('div', [slots.default?.(), slots.content?.()]),
    }),
    Input: input,
    Textarea: input,
    InputNumber: input,
    Switch: input,
  };
});

const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()));

function render(field: Partial<CapabilityField>, value: unknown) {
  const root = document.createElement('div');
  document.body.append(root);
  const changed: unknown[] = [];
  const app = createApp({
    render: () =>
      h(DesignQuickField, {
        field: {
          key: 'parameter',
          label: '参数',
          type: 'select',
          options: [],
          acceptedKinds: [],
          advanced: false,
          integer: false,
          required: false,
          uiControl: 'default',
          ...field,
        },
        value,
        onChange: (next: unknown) => changed.push(next),
      }),
  });
  app.mount(root);
  cleanup.push(() => {
    app.unmount();
    root.remove();
  });
  return { root, changed };
}

describe('quick parameter presentation', () => {
  it('uses readable rows for long filenames without changing their values', async () => {
    const name = 'qwen_image_edit_2511_bf16.safetensors';
    const { root, changed } = render(
      { options: [{ label: name, value: 'original-model-id' }] },
      'original-model-id',
    );
    const option = root.querySelector<HTMLButtonElement>(
      '.quick-option-grid--list button',
    );
    if (!option) throw new Error('Missing model option');
    expect(option.textContent).toContain(name);
    expect(option.title).toBe(name);
    expect(option.getAttribute('aria-pressed')).toBe('true');
    expect(
      root.querySelector('.quick-field-trigger')?.getAttribute('title'),
    ).toBe(`参数：${name}`);
    option.click();
    await nextTick();
    expect(changed).toEqual(['original-model-id']);
  });

  it('keeps short ratios in tiles and marks only the selected option', () => {
    const { root } = render(
      {
        options: [
          { label: '1:1', value: 'square' },
          { label: '16:9', value: 'wide' },
        ],
      },
      'square',
    );
    expect(root.querySelector('.quick-option-grid--list')).toBeNull();
    expect(root.querySelectorAll('.quick-option-grid i')).toHaveLength(2);
    expect(root.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);
  });

  it.each([
    ['number', 0, '0'],
    ['boolean', false, '关闭'],
    ['boolean', true, '开启'],
    ['json', { steps: 4 }, '{"steps":4}'],
    ['textarea', '一段较长的提示词', '一段较长的提示词'],
    ['text', undefined, '设置'],
  ] as const)(
    'renders %s summaries without losing falsy values',
    (type, value, expected) => {
      const { root } = render({ type }, value);
      expect(
        root.querySelector('.quick-field-trigger strong')?.textContent,
      ).toBe(expected);
    },
  );

  it('keeps text inputs, help and constraints available', () => {
    const { root } = render(
      { type: 'text', help: '说明', maxLength: 20, placeholder: '请输入' },
      'draft',
    );
    expect(root.querySelector('small')?.textContent).toBe('说明');
    const input = root.querySelector('input');
    if (!input) throw new Error('Missing text input');
    expect(input.value).toBe('draft');
    expect(input.getAttribute('maxlength')).toBe('20');
    expect(input.getAttribute('placeholder')).toBe('请输入');
  });
});
