import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ParameterPresentationEditor from '#/views/platform/workflow-management/parameter-presentation-editor.vue';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock('#/api/platform', () => ({
  getCapabilityApi: api.get,
  saveCapabilityPresentationApi: api.save,
}));
vi.mock('ant-design-vue', () => {
  const pass = defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h('div', slots.default?.()),
  });
  return {
    Spin: pass,
    Modal: defineComponent({
      props: ['open', 'okButtonProps', 'cancelButtonProps'],
      emits: ['ok', 'update:open'],
      setup:
        (props, { slots, emit }) =>
        () =>
          props.open
            ? h('section', { role: 'dialog' }, [
                slots.default?.(),
                h(
                  'button',
                  {
                    disabled: props.okButtonProps?.disabled,
                    onClick: () => emit('ok'),
                  },
                  '确定',
                ),
                h(
                  'button',
                  {
                    disabled: props.cancelButtonProps?.disabled,
                    onClick: () => emit('update:open', false),
                  },
                  '取消',
                ),
              ])
            : null,
    }),
    Button: defineComponent({
      setup:
        (_, { slots, attrs }) =>
        () =>
          h('button', attrs, slots.default?.()),
    }),
    Checkbox: defineComponent({
      props: ['checked', 'disabled'],
      emits: ['update:checked'],
      setup:
        (props, { emit }) =>
        () =>
          h('input', {
            type: 'checkbox',
            checked: props.checked,
            disabled: props.disabled,
            onChange: () => emit('update:checked', !props.checked),
          }),
    }),
    Input: defineComponent({
      props: ['value'],
      emits: ['update:value'],
      setup:
        (props, { emit, attrs }) =>
        () =>
          h('input', {
            ...attrs,
            value: props.value,
            onInput: (event: Event) =>
              emit('update:value', (event.target as HTMLInputElement).value),
          }),
    }),
    message: { success: api.success, error: api.error },
  };
});
const capability = {
  code: 'image-edit',
  name: '单图编辑',
  presentation: {
    quickFieldKeys: ['width', 'seed'],
    workflowVersionId: 'version',
    fieldLabels: { seed: '随机值' },
  },
  fields: [
    { key: 'prompt', label: '指令', type: 'textarea' },
    {
      key: 'width',
      label: '输出宽度',
      defaultLabel: '输出宽度',
      type: 'number',
      source: {
        inputName: 'proportional_width',
        nodeId: '390',
        nodeTitle: '按比例缩放',
      },
    },
    {
      key: 'seed',
      label: '随机值',
      defaultLabel: '随机种子',
      type: 'number',
      source: { inputName: 'seed', nodeId: '2', nodeTitle: '采样器' },
    },
    {
      key: 'height',
      label: '输出高度',
      defaultLabel: '输出高度',
      type: 'number',
      source: {
        inputName: 'proportional_height',
        nodeId: '390',
        nodeTitle: '按比例缩放',
      },
    },
  ],
};
const cleanup: (() => void)[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue(structuredClone(capability));
  api.save.mockResolvedValue({});
});
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()));
async function settle() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await nextTick();
}
async function render() {
  const root = document.createElement('div');
  document.body.append(root);
  const app = createApp(ParameterPresentationEditor);
  const editor = app.mount(root) as unknown as {
    show: (code: string) => Promise<void>;
  };
  cleanup.push(() => {
    app.unmount();
    root.remove();
  });
  await editor.show('image-edit');
  await settle();
  return { root, editor };
}
function button(root: HTMLElement, name: string) {
  const found = [...root.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === name,
  );
  if (!found) throw new Error(`Missing button: ${name}`);
  return found;
}
function input(root: HTMLElement, key: string) {
  const found = root.querySelector<HTMLInputElement>(
    `[data-presentation-key="${key}"] input:not([type="checkbox"])`,
  );
  if (!found) throw new Error(`Missing input: ${key}`);
  return found;
}
function change(root: HTMLElement, key: string, value: string) {
  const field = input(root, key);
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
}
describe('parameter presentation editor', () => {
  it('shows read-only JSON names and node identity beside editable default/custom labels', async () => {
    const { root } = await render();
    expect(root.textContent).toContain('原始 JSON 参数名');
    expect(root.querySelector('code')?.textContent).toBe('proportional_width');
    expect(root.textContent).toContain('节点 390 · 按比例缩放');
    expect(input(root, 'width').value).toBe('输出宽度');
    expect(input(root, 'seed').value).toBe('随机值');
    expect(input(root, 'width').maxLength).toBe(100);
    expect(root.querySelector('[data-presentation-key="prompt"]')).toBeNull();
  });
  it('saves renamed quick and more-only fields, resets defaults and preserves ordering', async () => {
    const { root } = await render();
    change(root, 'width', '  宽  ');
    change(root, 'height', '高');
    const seedRow = root.querySelector<HTMLElement>(
      '[data-presentation-key="seed"]',
    );
    if (!seedRow) throw new Error('Missing seed row');
    button(seedRow, '恢复默认').click();
    seedRow
      .querySelector<HTMLButtonElement>('[aria-label="上移随机值"]')
      ?.click();
    await settle();
    button(root, '确定').click();
    await settle();
    expect(api.save).toHaveBeenCalledWith('image-edit', {
      fieldLabels: { width: '宽', height: '高' },
      quickFieldKeys: ['seed', 'width'],
      workflowVersionId: 'version',
    });
    expect(root.querySelector('[role="dialog"]')).toBeNull();
  });
  it('cancels without saving and reloads server values when reopened', async () => {
    const { root, editor } = await render();
    change(root, 'width', '不保存');
    button(root, '取消').click();
    await settle();
    expect(api.save).not.toHaveBeenCalled();
    await editor.show('image-edit');
    expect(input(root, 'width').value).toBe('输出宽度');
  });
  it('keeps edits on save failure and retries; blank input restores the default', async () => {
    api.save.mockRejectedValueOnce(new Error('version changed'));
    const { root } = await render();
    change(root, 'seed', '  ');
    change(root, 'width', '重试名称');
    button(root, '确定').click();
    await settle();
    expect(input(root, 'width').value).toBe('重试名称');
    expect(api.success).not.toHaveBeenCalled();
    button(root, '确定').click();
    await settle();
    expect(api.save.mock.calls[1]?.[1].fieldLabels).toEqual({
      width: '重试名称',
    });
    expect(api.success).toHaveBeenCalledOnce();
  });
  it('disables save after load failure', async () => {
    api.get.mockRejectedValueOnce(new Error('offline'));
    const { root } = await render();
    expect(button(root, '确定').disabled).toBe(true);
    expect(api.error).toHaveBeenCalledWith('读取参数配置失败，请重新打开');
    expect(api.save).not.toHaveBeenCalled();
  });
});
