import { createApp, defineComponent, h, nextTick, ref } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import WorkflowManagement from '#/views/platform/workflow-management/index.vue';

const api = vi.hoisted(() => ({
  copy: vi.fn(),
  bind: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));
vi.mock('#/utils/copy-text', () => ({ copyTextToClipboard: api.copy }));
vi.mock('#/api/platform', () => ({
  bindCapabilityWorkflowApi: api.bind,
  createWorkflowApi: api.create,
  getWorkflowManagementApi: api.get,
  updateWorkflowApi: api.update,
}));
vi.mock(
  '#/views/platform/workflow-management/parameter-presentation-editor.vue',
  () => ({ default: { render: () => null } }),
);
vi.mock('@vben/common-ui', () => ({
  Page: defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h('main', slots.default?.()),
  }),
  useVbenModal: (options: {
    onCancel: () => void;
    onConfirm: () => Promise<void>;
  }) => {
    const open = ref(false);
    return [
      defineComponent({
        props: ['title'],
        setup:
          (props, { slots }) =>
          () =>
            open.value
              ? h('section', { role: 'dialog' }, [
                  h('h2', props.title),
                  slots.default?.(),
                  h('button', { onClick: options.onConfirm }, '保存'),
                  h('button', { onClick: options.onCancel }, '取消'),
                ])
              : null,
      }),
      {
        open: () => {
          open.value = true;
        },
        close: () => {
          open.value = false;
        },
      },
    ];
  },
}));
vi.mock('ant-design-vue', () => {
  const pass = defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h('div', [slots.title?.(), slots.extra?.(), slots.default?.()]),
  });
  const field = (tag: string) =>
    defineComponent({
      props: ['value', 'disabled', 'maxlength'],
      emits: ['update:value'],
      setup:
        (props, { emit }) =>
        () =>
          h(tag, {
            value: props.value,
            disabled: props.disabled,
            maxlength: props.maxlength,
            onInput: (event: Event) =>
              emit('update:value', (event.target as HTMLInputElement).value),
          }),
    });
  const input = Object.assign(field('input'), { TextArea: field('textarea') });
  const item = defineComponent({
    props: ['label'],
    setup:
      (props, { slots }) =>
      () =>
        h('label', [props.label, slots.default?.()]),
  });
  return {
    Alert: defineComponent({
      props: ['message'],
      setup: (props) => () => h('p', props.message),
    }),
    Button: defineComponent({
      setup:
        (_, { slots, attrs }) =>
        () =>
          h('button', attrs, slots.default?.()),
    }),
    Card: pass,
    Descriptions: Object.assign(pass, { Item: item }),
    Empty: pass,
    Form: Object.assign(
      defineComponent({
        setup:
          (_, { slots }) =>
          () =>
            h('form', slots.default?.()),
      }),
      { Item: item },
    ),
    Input: input,
    Select: defineComponent({
      props: ['value', 'options'],
      emits: ['update:value'],
      setup:
        (props, { emit, attrs }) =>
        () =>
          h(
            'select',
            {
              ...attrs,
              value: props.value,
              onChange: (event: Event) =>
                emit('update:value', (event.target as HTMLSelectElement).value),
            },
            props.options.map((option: { label: string; value: string }) =>
              h('option', { value: option.value }, option.label),
            ),
          ),
    }),
    Space: pass,
    Spin: pass,
    Switch: pass,
    Tag: pass,
    Upload: pass,
    message: { success: vi.fn(), warning: api.warning, error: api.error },
    Table: defineComponent({
      props: ['columns', 'dataSource'],
      setup:
        (props, { slots }) =>
        () =>
          h(
            'table',
            props.dataSource.map((record: Record<string, unknown>) =>
              h(
                'tr',
                props.columns.map((column: { key: string }) =>
                  h('td', slots.bodyCell?.({ column, record })),
                ),
              ),
            ),
          ),
    }),
  };
});

const disposers: (() => void)[] = [];
const workflow = {
  code: 'flux2-klein-image-edit-kv',
  description: '原说明',
  id: 'workflow-id',
  name: 'Flux2 Klein KV 双图编辑',
  status: 'disabled',
  versions: [
    {
      id: 'version-id',
      version: 3,
      apiJson: { '1': { class_type: 'LatestNode', inputs: {} } },
      activeCapabilities: [],
    },
    {
      id: 'bound-version',
      version: 2,
      apiJson: {
        '2': {
          class_type: 'BoundNode',
          inputs: { text: '<script>not executable</script>' },
        },
      },
      activeCapabilities: ['image-edit-kv'],
    },
    {
      id: 'old-version',
      version: 1,
      apiJson: { '3': { class_type: 'OldNode', inputs: {} } },
      activeCapabilities: [],
    },
  ],
};
beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({
    capabilities: [{ code: 'image-edit-kv', name: '客室双图编辑' }],
    workflows: [structuredClone(workflow)],
  });
  api.update.mockResolvedValue({ id: workflow.id });
  api.copy.mockResolvedValue(true);
});
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
async function settle() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await nextTick();
}
async function render() {
  const root = document.createElement('div');
  document.body.append(root);
  const app = createApp(WorkflowManagement);
  app.mount(root);
  disposers.push(() => {
    app.unmount();
    root.remove();
  });
  await settle();
  return root;
}
function click(root: HTMLElement, text: string) {
  const button = [...root.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === text,
  );
  expect(button).toBeDefined();
  button?.click();
}
function setValue(
  input: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function requireElement<T extends Element = HTMLElement>(
  root: HTMLElement,
  selector: string,
) {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing test element: ${selector}`);
  return element;
}

describe('workflow metadata editor', () => {
  it.each(['unbound', 'multiple-bound'])(
    'uses latest for %s workflows and labels each binding without claiming execution',
    async (scenario) => {
      const versions = structuredClone(workflow.versions).toReversed();
      for (const item of versions) item.activeCapabilities = [];
      if (scenario === 'multiple-bound') {
        for (const item of versions.slice(0, 2))
          item.activeCapabilities = ['unknown-capability'];
      }
      api.get.mockResolvedValue({
        capabilities: [],
        workflows: [{ ...workflow, versions }],
      });
      const root = await render();
      click(root, '编辑');
      await settle();
      expect(requireElement<HTMLSelectElement>(root, 'select').value).toBe(
        'version-id',
      );
      expect(root.textContent).toContain('最新版本不一定是功能正在使用的版本');
      expect(root.textContent).toContain('未绑定功能');
      expect(root.textContent?.includes('当前绑定：unknown-capability')).toBe(
        scenario === 'multiple-bound',
      );
      expect(api.bind).not.toHaveBeenCalled();
    },
  );
  it('defaults to the unique bound version and shows escaped read-only JSON', async () => {
    const root = await render();
    click(root, '编辑');
    await settle();
    expect(requireElement<HTMLSelectElement>(root, 'select').value).toBe(
      'bound-version',
    );
    expect(root.textContent).toContain('当前绑定：客室双图编辑');
    click(root, '查看 API JSON');
    await settle();
    expect(requireElement(root, 'pre').textContent).toBe(
      JSON.stringify(workflow.versions[1]?.apiJson, null, 2),
    );
    expect(root.querySelector('pre script')).toBeNull();
    expect(root.querySelector('pre textarea')).toBeNull();
    expect(api.update).not.toHaveBeenCalled();
  });
  it('switches historical versions for viewing/copying without losing unsaved metadata', async () => {
    const root = await render();
    click(root, '编辑');
    await settle();
    setValue(
      requireElement<HTMLInputElement>(root, 'input:not(:disabled)'),
      '尚未保存名称',
    );
    click(root, '查看 API JSON');
    const select = requireElement<HTMLSelectElement>(root, 'select');
    select.value = 'old-version';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    expect(requireElement(root, 'pre').textContent).toContain('OldNode');
    expect(root.textContent).toContain(`${workflow.code}-v1.json`);
    click(root, '复制 API JSON');
    await settle();
    expect(api.copy).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify(workflow.versions[2]?.apiJson, null, 2),
    );
    expect(
      requireElement<HTMLInputElement>(root, 'input:not(:disabled)').value,
    ).toBe('尚未保存名称');
    click(root, '收起 API JSON');
    await settle();
    expect(root.querySelector('pre')).toBeNull();
    expect(api.update).not.toHaveBeenCalled();
    expect(api.create).not.toHaveBeenCalled();
    expect(api.bind).not.toHaveBeenCalled();
  });
  it('downloads only the selected API JSON with the code and version filename, cleaning the URL', async () => {
    vi.useFakeTimers();
    const objectUrl = 'blob:workflow-test';
    const createUrl = vi.fn().mockReturnValue(objectUrl);
    const revoke = vi.fn();
    vi.stubGlobal('URL', {
      createObjectURL: createUrl,
      revokeObjectURL: revoke,
    });
    const clicks: Array<{ download: string; href: string }> = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      function (this: HTMLAnchorElement) {
        clicks.push({ download: this.download, href: this.href });
      },
    );
    const root = await render();
    click(root, '编辑');
    await settle();
    click(root, '下载 API JSON');
    expect(clicks).toEqual([
      { download: `${workflow.code}-v2.json`, href: objectUrl },
    ]);
    const blob = createUrl.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe('application/json;charset=utf-8');
    expect(JSON.parse(await blob.text())).toEqual(
      workflow.versions[1]?.apiJson,
    );
    expect(document.querySelector('a[download]')).toBeNull();
    expect(revoke).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(revoke).toHaveBeenCalledExactlyOnceWith(objectUrl);
    expect(api.update).not.toHaveBeenCalled();
  });
  it('reports clipboard and download failures without mutating the workflow', async () => {
    api.copy.mockResolvedValue(false);
    vi.stubGlobal('URL', {
      createObjectURL: () => {
        throw new Error('unsupported');
      },
    });
    const root = await render();
    click(root, '编辑');
    await settle();
    click(root, '复制 API JSON');
    await settle();
    expect(api.error).toHaveBeenCalledWith('复制失败，请展开 JSON 后手动复制');
    click(root, '下载 API JSON');
    expect(api.error).toHaveBeenCalledWith('下载失败，请重试或复制 JSON');
    expect(api.update).not.toHaveBeenCalled();
  });
  it('handles an empty version list without offering export actions', async () => {
    api.get.mockResolvedValue({
      capabilities: [],
      workflows: [{ ...workflow, versions: [] }],
    });
    const root = await render();
    click(root, '编辑');
    await settle();
    expect(root.querySelector('select')).toBeNull();
    expect(root.textContent).not.toContain('下载 API JSON');
    expect(root.textContent).not.toContain('查看 API JSON');
  });
  it('replaces the new-version entry with a metadata editor, keeping code read-only', async () => {
    const root = await render();
    expect(root.textContent).not.toContain('新增版本');
    click(root, '编辑');
    await settle();
    const dialog = requireElement(root, '[role="dialog"]');
    expect(dialog.textContent).toContain('编辑工作流');
    expect(dialog.textContent).not.toContain('参数映射 JSON');
    expect(dialog.querySelector('input:disabled')?.getAttribute('value')).toBe(
      workflow.code,
    );
    expect(dialog.querySelectorAll('input')).toHaveLength(2);
    expect(dialog.querySelectorAll('textarea')).toHaveLength(1);
  });
  it('saves trimmed name and description without sending status or workflow JSON', async () => {
    const root = await render();
    click(root, '编辑');
    await settle();
    setValue(
      requireElement<HTMLInputElement>(root, 'input:not(:disabled)'),
      '  客室双图编辑  ',
    );
    setValue(
      requireElement<HTMLTextAreaElement>(root, 'textarea'),
      '  编辑后的说明  ',
    );
    click(root, '保存');
    await settle();
    expect(api.update).toHaveBeenCalledExactlyOnceWith(workflow.id, {
      name: '客室双图编辑',
      description: '编辑后的说明',
    });
    expect(api.create).not.toHaveBeenCalled();
    expect(api.bind).not.toHaveBeenCalled();
    expect(root.querySelector('[role="dialog"]')).toBeNull();
    expect(api.get).toHaveBeenCalledTimes(2);
  });
  it('rejects empty names before saving', async () => {
    const root = await render();
    click(root, '编辑');
    await settle();
    setValue(
      requireElement<HTMLInputElement>(root, 'input:not(:disabled)'),
      '   ',
    );
    click(root, '保存');
    await settle();
    expect(api.warning).toHaveBeenCalledWith('请输入工作流中文名称');
    expect(api.update).not.toHaveBeenCalled();
    expect(root.querySelector('[role="dialog"]')).not.toBeNull();
  });
  it('cancels without modifying the workflow', async () => {
    const root = await render();
    click(root, '编辑');
    await settle();
    setValue(
      requireElement<HTMLInputElement>(root, 'input:not(:disabled)'),
      '不保存的名称',
    );
    click(root, '取消');
    await settle();
    expect(api.update).not.toHaveBeenCalled();
    expect(root.querySelector('[role="dialog"]')).toBeNull();
    expect(root.textContent).toContain(workflow.name);
  });
  it('keeps the editor open on API failure', async () => {
    api.update.mockRejectedValueOnce(new Error('保存失败'));
    const root = await render();
    click(root, '编辑');
    await settle();
    click(root, '保存');
    await settle();
    expect(api.error).toHaveBeenCalledWith('保存失败');
    expect(root.querySelector('[role="dialog"]')).not.toBeNull();
  });
});
