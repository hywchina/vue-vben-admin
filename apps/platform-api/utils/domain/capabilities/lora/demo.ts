// Ordinary demo: ai-toolkit/config/flux2_klein_9b_interior_lora.yaml.
// The dataset path is deliberately redacted; runtime paths are server-controlled.
export const LORA_DEMO = {
  job: 'extension',
  config: {
    name: 'flux2_klein_9b_interior_lora',
    process: [
      {
        type: 'diffusion_trainer',
        training_folder: 'output',
        sqlite_db_path: './aitk_db.db',
        device: 'cuda',
        trigger_word: 'interiorstyle',
        performance_log_every: 50,
        network: {
          type: 'lora',
          linear: 16,
          linear_alpha: 16,
          network_kwargs: { ignore_if_contains: [] as string[] },
        },
        save: {
          dtype: 'bf16',
          save_every: 250,
          max_step_saves_to_keep: 4,
          save_format: 'safetensors',
          push_to_hub: false,
        },
        datasets: [
          {
            folder_path: '<server-managed-dataset>',
            caption_ext: 'txt',
            default_caption: '',
            caption_dropout_rate: 0,
            shuffle_tokens: false,
            cache_latents_to_disk: true,
            cache_text_embeddings: true,
            resolution: [512] satisfies [number],
            num_repeats: 1,
            flip_x: false,
            flip_y: false,
          },
        ] satisfies [unknown],
        train: {
          batch_size: 1,
          steps: 1500,
          gradient_accumulation: 1,
          train_unet: true,
          train_text_encoder: false,
          gradient_checkpointing: true,
          noise_scheduler: 'flowmatch',
          timestep_type: 'weighted',
          content_or_style: 'style',
          optimizer: 'adamw8bit',
          optimizer_params: { weight_decay: 0.0001 },
          lr: 0.0001,
          dtype: 'bf16',
          unload_text_encoder: true,
          cache_text_embeddings: true,
          disable_sampling: true,
          skip_first_sample: true,
          ema_config: { use_ema: false, ema_decay: 0.99 },
        },
        model: {
          arch: 'flux2_klein_9b',
          name_or_path: 'models/unet/flux-2-klein-9b.safetensors',
          vae_path: 'models/vae/flux2-vae.safetensors',
          quantize: true,
          qtype: 'qfloat8',
          quantize_te: true,
          qtype_te: 'qfloat8',
          low_vram: true,
          layer_offloading: false,
          compile: false,
          model_kwargs: { match_target_res: false },
        },
        sample: {
          sampler: 'flowmatch',
          sample_every: 250,
          width: 512,
          height: 512,
          samples: [
            { prompt: '[trigger], modern style interior design' },
          ] satisfies [unknown],
          neg: '',
          seed: 42,
          walk_seed: false,
          guidance_scale: 1,
          sample_steps: 4,
        },
        logging: { log_every: 10, use_ui_logger: false },
      },
    ] satisfies [unknown],
  },
  meta: { name: '[name]', version: '1.0' },
};

export const LORA_GROUPS = [
  { key: 'training', label: '训练与优化器' },
  { key: 'network', label: 'LoRA 网络' },
  { key: 'dataset', label: '数据集与打标' },
  { key: 'sample', label: '样图设置' },
  { key: 'save', label: '模型保存' },
  { key: 'model', label: '底模与显存' },
  { key: 'system', label: '任务与日志' },
] as const;
export type LoraGroup = (typeof LORA_GROUPS)[number]['key'];
export type LoraParameterKey =
  | 'baseModel'
  | 'disableSampling'
  | 'learningRate'
  | 'previewPrompt'
  | 'rank'
  | 'repeats'
  | 'resolution'
  | 'steps'
  | 'triggerWord';
export interface LoraField {
  path: string;
  label: string;
  help: string;
  group: LoraGroup;
  mode: 'automatic' | 'editable' | 'fixed';
  binding?: LoraParameterKey;
  main: boolean;
}
type FieldDefinition = [
  string,
  string,
  string,
  LoraGroup,
  LoraParameterKey?,
  boolean?,
];
const definitions: FieldDefinition[] = [
  [
    'model.name_or_path',
    '使用底模',
    '训练基础权重。推荐使用已验证的 Flux2 Klein 9B；仅可选择后端白名单，不能填写服务器路径。',
    'model',
    'baseModel',
    true,
  ],
  [
    'train.steps',
    '训练步数',
    '优化器更新的总步数。推荐从 demo 的 1500 步开始，允许 20–10000；增加会延长训练，过多可能过拟合。与图片数、Repeat 独立，不再使用 Epoch 推算。',
    'training',
    'steps',
    true,
  ],
  [
    'datasets[0].num_repeats',
    '单张图片重复次数（Repeat）',
    '每轮数据加载中重复每张图片的次数。推荐 demo 的 1，允许 1–100；改变数据采样频率，不改变设定的总步数。',
    'dataset',
    'repeats',
    true,
  ],
  [
    'trigger_word',
    '触发词',
    '推理时调用所学风格的关键词，平台写入逐图 caption。推荐使用唯一英文词，如 interiorstyle；2–64 字符，英文开头，可含数字、下划线和连字符。',
    'dataset',
    'triggerWord',
    true,
  ],
  [
    'datasets[0].resolution',
    '训练图片分辨率',
    '数据集训练尺寸。推荐从 demo 的 512 开始，可选 512/768/1024；越大通常越占显存、越慢。平台同时同步样图宽高。',
    'dataset',
    'resolution',
    true,
  ],
  [
    'sample.samples[0].prompt',
    '模型效果预览提示词',
    '训练采样时使用的描述，[trigger] 会替换为触发词。推荐 demo 描述并按场景调整，最多 1000 字符；专业设置默认禁用采样，此时不会生成实时样图。',
    'sample',
    'previewPrompt',
    true,
  ],
  [
    'train.lr',
    '学习率',
    '每次更新参数的幅度。推荐 demo 的 0.0001；平台允许 0.000001–0.01，较大可能不稳定，较小收敛更慢，范围不代表效果保证。',
    'training',
    'learningRate',
  ],
  [
    'network.linear',
    'LoRA Rank',
    '低秩网络容量。推荐 demo 的 16，可选 4/8/16/32/64；越大模型和显存开销越大。平台将 Alpha 与 Rank 联动。',
    'network',
    'rank',
  ],
  [
    'train.disable_sampling',
    '禁用训练样图',
    '开启时不执行训练中的图片采样，节约显存和时间。推荐 demo 的 true；关闭后才会按样图间隔生成预览，会增加训练开销。',
    'sample',
    'disableSampling',
  ],
  [
    'type',
    '训练器类型',
    '指定扩散模型训练执行器。推荐保持 demo 的 diffusion_trainer，不适合在浏览器任意更换。',
    'system',
  ],
  [
    'training_folder',
    '训练输出目录',
    '模型与样图的输出位置。推荐保持 demo 的 output，由训练服务解析和管理。',
    'system',
  ],
  [
    'sqlite_db_path',
    '训练数据库',
    'AI Toolkit 记录训练状态的数据库。推荐保持 demo 相对路径，由训练服务管理，不是平台 PostgreSQL。',
    'system',
  ],
  [
    'device',
    '计算设备',
    '训练使用的设备类型。推荐保持 cuda；具体 GPU 由服务器队列分配，页面不接收设备地址。',
    'system',
  ],
  [
    'performance_log_every',
    '性能日志间隔',
    '每隔多少训练步记录性能。推荐 demo 的 50；更频繁会增加日志量。',
    'system',
  ],
  [
    'network.type',
    '网络类型',
    '训练的适配网络类型。推荐保持 demo 的 lora，输出为 LoRA 权重。',
    'network',
  ],
  [
    'network.linear_alpha',
    'LoRA Alpha',
    '低秩更新的缩放系数。推荐 demo 的 16；平台自动与 Rank 相同，不单独调节。',
    'network',
  ],
  [
    'network.network_kwargs.ignore_if_contains',
    '忽略模块关键词',
    '名称包含列表关键词的模块不参与适配。推荐 demo 空列表，保持既有训练覆盖范围。',
    'network',
  ],
  [
    'save.dtype',
    '保存精度',
    '输出 LoRA 权重的数据类型。推荐 demo 的 bf16，保持当前模型兼容性。',
    'save',
  ],
  [
    'save.save_every',
    '保存间隔',
    '每隔多少步保存 checkpoint。推荐 demo 的 250；较短增加磁盘占用和写入开销，最终模型由训练器保存。',
    'save',
  ],
  [
    'save.max_step_saves_to_keep',
    '保留 checkpoint 数量',
    '保留的中间权重数量。推荐 demo 的 4，限制输出占用，不影响平台已登记的产物。',
    'save',
  ],
  [
    'save.save_format',
    '保存格式',
    '输出权重文件格式。推荐 demo 的 safetensors，平台按此格式校验与入库。',
    'save',
  ],
  [
    'save.push_to_hub',
    '上传模型仓库',
    '是否自动向远程模型仓库推送。推荐保持 demo 的 false，不自动发布模型。',
    'save',
  ],
  [
    'datasets[0].folder_path',
    '训练数据集目录',
    'Worker 为本任务准备图片和 caption 的目录。推荐由服务器按任务隔离自动生成；不展示或接受服务器绝对路径。',
    'dataset',
  ],
  [
    'datasets[0].caption_ext',
    '描述文件扩展名',
    '图片同名描述文件的后缀。推荐 demo 的 txt，与平台数据集上传协议一致。',
    'dataset',
  ],
  [
    'datasets[0].default_caption',
    '默认描述',
    '缺少逐图描述时的回退文本。推荐 demo 空字符串；平台仍要求每张图片填写 caption，不能用此项绕过。',
    'dataset',
  ],
  [
    'datasets[0].caption_dropout_rate',
    '描述丢弃率',
    '训练时随机丢弃 caption 的概率。推荐 demo 的 0，保留全部逐图描述。',
    'dataset',
  ],
  [
    'datasets[0].shuffle_tokens',
    '描述词随机排序',
    '是否随机重排 caption 词项。推荐 demo 的 false，保持自然语言描述顺序。',
    'dataset',
  ],
  [
    'datasets[0].cache_latents_to_disk',
    '磁盘 Latent 缓存',
    '缓存图片编码结果，减少重复编码。推荐 demo 的 true，会使用额外磁盘空间。',
    'dataset',
  ],
  [
    'datasets[0].cache_text_embeddings',
    '数据集文本缓存',
    '缓存 caption 的文本嵌入。推荐 demo 的 true，减少重复文本编码。',
    'dataset',
  ],
  [
    'datasets[0].flip_x',
    '水平翻转',
    '是否随机左右翻转训练图片。推荐 demo 的 false，避免客室布局被不必要地镜像。',
    'dataset',
  ],
  [
    'datasets[0].flip_y',
    '垂直翻转',
    '是否随机上下翻转图片。推荐 demo 的 false，保持客室上下方向。',
    'dataset',
  ],
  [
    'train.batch_size',
    '批量大小',
    '每次前向计算处理的图片数量。推荐 demo 的 1，适合当前低显存训练配置。',
    'training',
  ],
  [
    'train.gradient_accumulation',
    '梯度累积',
    '积累多少次梯度再更新。推荐 demo 的 1；增加会改变有效批量和训练节奏。',
    'training',
  ],
  [
    'train.train_unet',
    '训练扩散主干',
    '是否更新扩散主干上的适配参数。推荐 demo 的 true，否则无法按当前 LoRA 配置学习。',
    'training',
  ],
  [
    'train.train_text_encoder',
    '训练文本编码器',
    '是否训练文本编码器。推荐 demo 的 false，保持已验证的冻结策略并减少开销。',
    'training',
  ],
  [
    'train.gradient_checkpointing',
    '梯度检查点',
    '通过重算中间结果节省显存。推荐 demo 的 true，会以额外计算换取显存。',
    'training',
  ],
  [
    'train.noise_scheduler',
    '噪声调度器',
    '训练噪声与时间步的调度方式。推荐 demo 的 flowmatch，与底模训练方式匹配。',
    'training',
  ],
  [
    'train.timestep_type',
    '时间步采样',
    '训练时间步的采样策略。推荐 demo 的 weighted，保持已验证分布。',
    'training',
  ],
  [
    'train.content_or_style',
    '学习方向',
    '指定偏内容还是风格。推荐 demo 的 style，用于客室风格适配。',
    'training',
  ],
  [
    'train.optimizer',
    '优化器',
    '更新权重的算法。推荐 demo 的 adamw8bit，使用低位优化器状态减少显存。',
    'training',
  ],
  [
    'train.optimizer_params.weight_decay',
    '权重衰减',
    '优化器正则化强度。推荐 demo 的 0.0001；过大可能抑制风格学习。',
    'training',
  ],
  [
    'train.dtype',
    '训练精度',
    '训练计算的数据类型。推荐 demo 的 bf16，需要硬件和权重支持。',
    'training',
  ],
  [
    'train.unload_text_encoder',
    '卸载文本编码器',
    '文本编码后释放编码器显存。推荐 demo 的 true，与缓存策略配合。',
    'training',
  ],
  [
    'train.cache_text_embeddings',
    '训练文本缓存',
    '训练阶段复用文本嵌入。推荐 demo 的 true，与数据集文本缓存同时开启。',
    'training',
  ],
  [
    'train.skip_first_sample',
    '跳过首次样图',
    '是否跳过训练开始前的采样。推荐 demo 的 true；禁用全部采样时此项不生效。',
    'sample',
  ],
  [
    'train.ema_config.use_ema',
    '启用 EMA',
    '是否维护参数的指数滑动平均。推荐 demo 的 false，避免增加额外状态。',
    'training',
  ],
  [
    'train.ema_config.ema_decay',
    'EMA 衰减',
    'EMA 更新的历史权重比例。推荐 demo 的 0.99；当前未启用 EMA，保留但不生效。',
    'training',
  ],
  [
    'model.arch',
    '模型架构',
    '训练器选择对应的模型实现。推荐 demo 的 flux2_klein_9b，由底模白名单自动匹配。',
    'model',
  ],
  [
    'model.vae_path',
    'VAE 权重',
    '图片与 Latent 转换所需权重。推荐使用与 Flux2 匹配的 VAE；由服务器配置，不向浏览器暴露实际路径。',
    'model',
  ],
  [
    'model.quantize',
    '主干量化',
    '是否量化扩散主干。推荐 demo 的 true，减少基础权重显存。',
    'model',
  ],
  [
    'model.qtype',
    '主干量化类型',
    '主干量化的数据类型。推荐 demo 的 qfloat8，保持已验证加载方式。',
    'model',
  ],
  [
    'model.quantize_te',
    '文本编码器量化',
    '是否量化文本编码器。推荐 demo 的 true，节约编码阶段显存。',
    'model',
  ],
  [
    'model.qtype_te',
    '文本量化类型',
    '文本编码器的量化格式。推荐 demo 的 qfloat8。',
    'model',
  ],
  [
    'model.low_vram',
    '低显存模式',
    '启用模型的低显存运行策略。推荐 demo 的 true，可能增加计算或搬运时间。',
    'model',
  ],
  [
    'model.layer_offloading',
    '分层卸载',
    '是否将部分层在设备间搬运。推荐 demo 的 false，保持当前加载策略。',
    'model',
  ],
  [
    'model.compile',
    '编译模型',
    '是否使用编译优化。推荐 demo 的 false，避免首次编译开销和兼容问题。',
    'model',
  ],
  [
    'model.model_kwargs.match_target_res',
    '匹配目标尺寸',
    '是否启用模型内部目标尺寸匹配策略。推荐 demo 的 false，沿用已验证尺寸处理。',
    'model',
  ],
  [
    'sample.sampler',
    '样图采样器',
    '生成预览图片的采样方法。推荐 demo 的 flowmatch，与底模匹配。',
    'sample',
  ],
  [
    'sample.sample_every',
    '样图间隔',
    '每隔多少训练步进行采样。推荐 demo 的 250；禁用采样时不生效，启用会增加训练时间。',
    'sample',
  ],
  [
    'sample.width',
    '样图宽度',
    '预览图片的像素宽度。demo 为 512；平台自动跟随主面板训练分辨率，越大显存开销越高。',
    'sample',
  ],
  [
    'sample.height',
    '样图高度',
    '预览图片的像素高度。demo 为 512；平台自动跟随主面板训练分辨率。',
    'sample',
  ],
  [
    'sample.neg',
    '样图负向提示词',
    '希望排除的内容描述。推荐 demo 空字符串，保持该模型既有采样配置。',
    'sample',
  ],
  [
    'sample.seed',
    '样图随机种子',
    '采样噪声的起点，用于比较不同 checkpoint。推荐 demo 的 42，保持对比条件一致。',
    'sample',
  ],
  [
    'sample.walk_seed',
    '样图种子递增',
    '是否在采样时变化种子。推荐 demo 的 false，避免对比时混入随机变化。',
    'sample',
  ],
  [
    'sample.guidance_scale',
    '样图引导强度',
    '采样时文本条件的引导强度。推荐该 Klein demo 的 1，不套用其他模型的高 CFG。',
    'sample',
  ],
  [
    'sample.sample_steps',
    '样图采样步数',
    '生成一次预览的迭代步数，不是训练总步数。推荐该 demo 的 4；增加会使预览更慢。',
    'sample',
  ],
  [
    'logging.log_every',
    '指标记录间隔',
    '每隔多少训练步记录指标。推荐 demo 的 10，兼顾曲线粒度和日志量。',
    'system',
  ],
  [
    'logging.use_ui_logger',
    '平台训练指标',
    'AI Toolkit UI 指标记录开关。demo 为 false；平台固定为 true，以提供 Loss 曲线，不能关闭。',
    'system',
  ],
];
const automaticPaths = new Set([
  'datasets[0].folder_path',
  'model.arch',
  'model.vae_path',
  'network.linear_alpha',
  'sample.height',
  'sample.width',
]);
export const LORA_FIELDS: LoraField[] = definitions.map(
  ([path, label, help, group, binding, main]) => ({
    path: `config.process[0].${path}`,
    label,
    help,
    group,
    binding,
    main: main ?? false,
    mode: fieldMode(path, binding),
  }),
);

function fieldMode(
  path: string,
  binding?: LoraParameterKey,
): LoraField['mode'] {
  if (binding) return 'editable';
  return automaticPaths.has(path) ? 'automatic' : 'fixed';
}
LORA_FIELDS.push(
  {
    path: 'job',
    label: '任务入口',
    help: 'AI Toolkit 扩展任务入口。推荐保持 demo 的 extension。',
    group: 'system',
    mode: 'fixed',
    main: false,
  },
  {
    path: 'config.name',
    label: '训练内部名称',
    help: '用于隔离输出目录。demo 使用固定名称，平台提交时按任务 ID 自动生成唯一名称；不同于页面业务任务名称。',
    group: 'system',
    mode: 'automatic',
    main: false,
  },
  {
    path: 'meta.name',
    label: '模型名称元数据',
    help: '保存权重时使用的名称占位符。推荐保持 demo 的 [name]，由训练任务名称替换。',
    group: 'system',
    mode: 'fixed',
    main: false,
  },
  {
    path: 'meta.version',
    label: '元数据版本',
    help: '模型导出元数据的版本标识。推荐保持 demo 的 1.0。',
    group: 'system',
    mode: 'fixed',
    main: false,
  },
);

export function getLoraDemoValue(path: string): unknown {
  let value: unknown = LORA_DEMO;
  for (const segment of path.replaceAll(/\[(\d+)\]/g, '.$1').split('.')) {
    if (value === null || typeof value !== 'object') return undefined;
    value = (value as Record<string, unknown>)[segment];
  }
  return value;
}
