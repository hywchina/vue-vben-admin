import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Editor from '#/views/platform/workflow-management/design-mode-editor.vue';
const api = vi.hoisted(() => ({
  get: vi.fn(),
  apps: vi.fn(),
  save: vi.fn(),
  error: vi.fn(),
  store: { applications: [] },
}));
vi.mock('#/api/platform', () => ({
  getDesignModeApplicationsApi: api.get,
  getApplicationsApi: api.apps,
  saveDesignModeApplicationsApi: api.save,
}));
vi.mock('#/store', () => ({ usePlatformStore: () => api.store }));
vi.mock('ant-design-vue', () => ({
  Button: defineComponent({
    props: ['disabled', 'loading'],
    setup:
      (props, { slots }) =>
      () =>
        h(
          'button',
          { disabled: props.disabled || props.loading },
          slots.default?.(),
        ),
  }),
  Modal: defineComponent({
    props: ['open'],
    setup:
      (props, { slots }) =>
      () =>
        props.open ? h('section', slots.default?.()) : null,
  }),
  Checkbox: defineComponent({
    props: ['checked'],
    emits: ['change'],
    setup:
      (props, { slots, emit }) =>
      () =>
        h('label', [
          h('input', {
            type: 'checkbox',
            checked: props.checked,
            onChange: (event: Event) => emit('change', event),
          }),
          slots.default?.(),
        ]),
  }),
  Select: defineComponent({
    props: ['value', 'options', 'disabled'],
    emits: ['update:value'],
    setup:
      (props, { emit }) =>
      () =>
        h(
          'select',
          {
            value: props.value,
            disabled: props.disabled,
            onChange: (event: Event) =>
              emit('update:value', (event.target as HTMLSelectElement).value),
          },
          props.options.map((item: { label: string; value: string }) =>
            h('option', { value: item.value }, item.label),
          ),
        ),
  }),
  message: { success: vi.fn(), warning: vi.fn(), error: api.error },
}));
const cleanup: (() => void)[] = [];
async function settle() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
  await nextTick();
}
async function render() {
  const root = document.createElement('div');
  document.body.append(root);
  const app = createApp(Editor);
  app.mount(root);
  cleanup.push(() => {
    app.unmount();
    root.remove();
  });
  root.querySelector<HTMLButtonElement>('button')?.click();
  await settle();
  return root;
}
function button(root: HTMLElement, text: string) {
  const element = [...root.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent?.trim() === text,
  );
  if (!element) throw new Error(`Missing ${text}`);
  return element;
}
const baseline = {
  designMode: 'cabin',
  applicationKeys: ['text-to-image', 'inpaint-single', 'multi-image-edit'],
  defaultImageApplicationKey: 'inpaint-single',
  revision: 3,
};
beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation(async () =>
    structuredClone([baseline, { ...baseline, designMode: 'cmf' }]),
  );
  api.apps.mockResolvedValue(
    [
      'text-to-image',
      'inpaint-single',
      'multi-image-edit',
      'screen-capture-edit',
    ].map((key) => ({ key, name: key, capabilityCode: key })),
  );
  api.save.mockImplementation(async (input) => ({
    ...input,
    revision: input.revision + 1,
  }));
});
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()));
describe('administrator module settings', () => {
  it('loads persisted order, reorders, changes default and refreshes runtime applications on save', async () => {
    const root = await render();
    expect(root.textContent).not.toContain('screen-capture-edit');
    root
      .querySelector<HTMLButtonElement>('[aria-label="上移multi-image-edit"]')
      ?.click();
    await settle();
    const selector = root.querySelector<HTMLSelectElement>(
      '[aria-label="图生图默认功能"]',
    );
    if (!selector) throw new Error('Missing default selector');
    selector.value = 'multi-image-edit';
    selector.dispatchEvent(new Event('change'));
    await settle();
    button(root, '保存当前模块').click();
    await settle();
    expect(api.save).toHaveBeenCalledWith({
      ...baseline,
      applicationKeys: ['text-to-image', 'multi-image-edit', 'inpaint-single'],
      defaultImageApplicationKey: 'multi-image-edit',
    });
    expect(api.apps).toHaveBeenCalledTimes(2);
  });
  it('closing and reopening discards unsaved changes without writing', async () => {
    const root = await render();
    root
      .querySelector<HTMLButtonElement>('[aria-label="上移multi-image-edit"]')
      ?.click();
    await settle();
    button(root, '关闭').click();
    await settle();
    button(root, '模块功能设置').click();
    await settle();
    button(root, '保存当前模块').click();
    await settle();
    expect(api.save).toHaveBeenCalledWith(baseline);
  });
  it('keeps edits on conflict and does not refresh applications as if saved', async () => {
    const root = await render();
    api.save.mockRejectedValue(new Error('配置冲突'));
    button(root, '保存当前模块').click();
    await settle();
    expect(api.error).toHaveBeenCalledWith('配置冲突');
    expect(api.apps).toHaveBeenCalledOnce();
    expect(root.querySelector('section')).not.toBeNull();
  });
});
