import { createApp, h, nextTick, ref } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import WorkflowLoraPicker from '#/components/platform/workflow-lora-picker.vue';

const api = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('#/api/platform/workflows', () => ({ getWorkflowLorasApi: api.load }));
vi.mock('ant-design-vue', async () => {
  const { h } = await import('vue');
  type Context = import('vue').SetupContext;
  return {
    Button: (_props: unknown, { slots, attrs }: Context) =>
      h('button', attrs, slots.default?.()),
    Spin: () => h('span', '读取中'),
    Popover: (p: { open: boolean }, { emit, slots }: Context) =>
      h('div', [
        h(
          'div',
          { onClick: () => emit('update:open', !p.open) },
          slots.default?.(),
        ),
        p.open && slots.content?.(),
      ]),
    Select: Object.assign(
      (
        p: { options: Array<{ label: string; value: string }>; value?: string },
        { emit, attrs }: Context,
      ) =>
        h(
          'select',
          {
            ...attrs,
            value: p.value,
            onChange: (e: Event) =>
              emit(
                'change',
                (e.target as HTMLSelectElement).value || undefined,
              ),
          },
          [
            h('option', { value: '' }, '关闭'),
            ...p.options.map((o) => h('option', { value: o.value }, o.label)),
          ],
        ),
      { props: ['value', 'options'], emits: ['change'] },
    ),
    InputNumber: (p: { value: number }, { emit }: Context) =>
      h('input', {
        type: 'number',
        value: p.value,
        onInput: (e: Event) =>
          emit('update:value', Number((e.target as HTMLInputElement).value)),
      }),
  };
});
const first = {
  targets: [
    {
      id: 'branch-0',
      label: '生成模型',
      base: 'base.safetensors',
      baseFingerprint: 'b'.repeat(64),
      family: 'flux2_klein_9b',
      options: [{ name: 'interior.safetensors', sha256: 'a'.repeat(64) }],
      rejected: 1,
    },
  ],
};
const disposers: Array<() => void> = [];
afterEach(() => {
  disposers.splice(0).forEach((fn) => fn());
  api.load.mockReset();
});
async function settle() {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
  await nextTick();
}
function render() {
  const code = ref('single-image-edit');
  const value = ref<unknown>({ enabled: false, selections: [] });
  const root = document.createElement('div');
  document.body.append(root);
  const app = createApp({
    render: () =>
      h(WorkflowLoraPicker, {
        code: code.value,
        value: value.value,
        parameters: { prompt: 'design' },
        onChange: (v: unknown) => {
          value.value = v;
        },
      }),
  });
  app.mount(root);
  disposers.push(() => {
    app.unmount();
    root.remove();
  });
  return {
    root,
    code,
    value,
    open: async () => {
      (root.querySelector('.lora-trigger') as HTMLButtonElement).click();
      await settle();
    },
  };
}
describe('workflow LoRA selection', () => {
  it('loads on demand, persists checksums/strength and can fully disable loading', async () => {
    api.load.mockResolvedValue(first);
    const view = render();
    expect(api.load).not.toHaveBeenCalled();
    await view.open();
    const select = view.root.querySelector('select');
    if (!select) throw new Error('LoRA selector not rendered');
    select.value = 'interior.safetensors';
    select.dispatchEvent(new Event('change'));
    await settle();
    expect(view.value.value).toMatchObject({
      enabled: true,
      selections: [
        {
          name: 'interior.safetensors',
          baseFingerprint: 'b'.repeat(64),
          sha256: 'a'.repeat(64),
          strength: 1,
        },
      ],
    });
    const input = view.root.querySelector('input');
    if (!input) throw new Error('LoRA strength control not rendered');
    input.value = '0.6';
    input.dispatchEvent(new Event('input'));
    await settle();
    expect(view.value.value).toMatchObject({ selections: [{ strength: 0.6 }] });
    const close = [...view.root.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === '全部关闭',
    );
    if (!close) throw new Error('LoRA disable button not rendered');
    close.click();
    await settle();
    expect(view.value.value).toEqual({ enabled: false, selections: [] });
  });
  it('does not display a late catalog from a previously selected workflow', async () => {
    let resolve!: (value: unknown) => void;
    api.load
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolve = r;
          }),
      )
      .mockResolvedValue({
        targets: [
          {
            ...first.targets[0],
            base: 'qwen.safetensors',
            options: [],
            reason: '没有适配模型',
          },
        ],
      });
    const view = render();
    await view.open();
    view.code.value = 'camera-control-multi';
    await settle();
    resolve(first);
    await settle();
    expect(view.root.textContent).toContain('qwen.safetensors');
    expect(view.root.textContent).not.toContain('interior.safetensors');
    expect(view.value.value).toEqual({ enabled: false, selections: [] });
  });
  it('shows a retryable failure without substituting incompatible options', async () => {
    api.load.mockRejectedValue(new Error('兼容目录不可用'));
    const view = render();
    await view.open();
    expect(view.root.textContent).toContain('兼容目录不可用');
    expect(view.root.querySelector('select')).toBeNull();
    api.load.mockResolvedValue(first);
    [...view.root.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === '重试')
      ?.click();
    await settle();
    expect(view.root.querySelector('select')).not.toBeNull();
  });
});
