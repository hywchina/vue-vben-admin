import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

import { renderReportArtifact } from '../utils/domain/capabilities/report/renderer';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const outputDirectory = resolve(
  process.argv[2] ?? '/tmp/rail-report-generation-qa',
);
const sourceFiles = [
  resolve(
    repositoryRoot,
    'docs/rail-platform/presentation/screenshots/05-design-session.png',
  ),
  resolve(
    repositoryRoot,
    'docs/rail-platform/customer-feedback/20260820/original/media/image8.png',
  ),
];
const primaryImageId = '10000000-0000-4000-8000-000000000001';
const secondaryImageId = '10000000-0000-4000-8000-000000000002';
const imageIds = [primaryImageId, secondaryImageId] as const;
const assets = new Map(
  await Promise.all(
    sourceFiles.map(async (filename, index) => {
      const imageId = imageIds[index];
      if (!imageId) throw new Error(`缺少第 ${index + 1} 张图片的资产 ID`);
      return [
        imageId,
        {
          bytes: new Uint8Array(await readFile(filename)),
          filename: filename.split('/').at(-1) ?? filename,
          id: imageId,
          mimeType: 'image/png' as const,
          name: index === 0 ? '设计会话工作区' : '客室地板材质方案',
        },
      ] as const;
    }),
  ),
);

await mkdir(outputDirectory, { recursive: true });
for (const format of ['docx', 'pptx', 'md'] as const) {
  const artifact = await renderReportArtifact({
    assets,
    createdAt: new Date('2026-08-25T08:00:00.000Z'),
    parameters: {
      format,
      generationMode: 'template',
      name: `示范项目设计报告 · ${format.toUpperCase()}`,
      projectId: '20000000-0000-4000-8000-000000000001',
      reportType: 'design-proposal',
      sections: [
        {
          body: '本项目围绕轨道客室内装模块化分区开展智能快速设计，目标是在统一项目资产和任务血缘的基础上，缩短从设计意图到评审交付物的转换周期。\n\n设计工作区将需求对话、参考图、生成结果和局部编辑串联起来，形成可追溯的方案迭代记录。',
          images: [
            { assetId: primaryImageId, caption: '设计会话与生成工作区' },
          ],
          title: '设计背景与目标',
        },
        {
          body: '方案采用明亮、克制的客室空间基调，通过木纹地板、浅灰内饰与深灰座椅建立层次。关键材质和色彩变化均以项目图片资产记录，可在同一项目内继续用于局部编辑和评审。',
          images: [
            { assetId: secondaryImageId, caption: '客室木纹地板 CMF 方案' },
          ],
          title: '空间与 CMF 方案',
        },
        {
          body: '建议下一阶段围绕通道净空、座椅人机尺寸、材料耐久性与防火合规开展工程校核，并在定版前完成客户评审意见闭环。',
          images: [],
          title: '评审结论与后续建议',
        },
      ],
      summary:
        '本报告汇总示范项目的设计背景、客室空间与 CMF 方案，并给出下一阶段工程校核建议。所有引用图片均来自当前项目资产，输出文件可继续编辑。',
      templateKey: 'rail-design-standard-v1',
      title: '示范项目客室设计方案报告',
    },
    projectName: '示范项目',
    requestedBy: '项目设计师',
  });
  await writeFile(resolve(outputDirectory, artifact.filename), artifact.bytes);
  console.warn(
    `${artifact.filename}\t${artifact.bytes.byteLength}\t${artifact.mimeType}`,
  );
}
