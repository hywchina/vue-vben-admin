import type { ApiWorkflow } from '../../workflows/schema';

import { cameraViewPrompt } from '../../workflows/camera-views';

/** Preserve the angle LoRA trigger while stating what must survive the move. */
export function constrainCameraScene(graph: ApiWorkflow, mode: string) {
  const cameras = Object.values(graph).filter(
    (node) => node.class_type === 'QwenMultiangleCameraNode',
  );
  const scene =
    mode === 'cabin'
      ? 'The reference is the interior of a railway passenger cabin. Keep the camera INSIDE the same carriage. Show the same aisle, seats, windows, doors and ceiling from the requested direction. Preserve their design, materials and spatial relationships. Do not turn the interior into an exterior train, roof or aerial view.'
      : 'Show the SAME object or material from the requested direction. Preserve its identity, silhouette, parts, colours and materials. Change only the viewpoint, not the design or background scene.';
  for (const node of Object.values(graph)) {
    if (node.class_type !== 'TextEncodeQwenImageEditPlus') continue;
    let angle = node.inputs.prompt;
    if (Array.isArray(angle)) {
      const camera = graph[String(angle[0])];
      if (camera?.class_type !== 'QwenMultiangleCameraNode') continue;
      const h = ((Number(camera.inputs.horizontal_angle) % 360) + 360) % 360;
      const v = Number(camera.inputs.vertical_angle);
      const z = Number(camera.inputs.zoom);
      let zoom = 5;
      if (z < 2) zoom = 1;
      if (z >= 6) zoom = 8;
      angle = cameraViewPrompt({
        enabled: true,
        id: 'view0',
        horizontal: (Math.round(h / 45) * 45) % 360,
        vertical: Math.max(-30, Math.min(60, Math.round(v / 30) * 30)),
        zoom,
      });
    }
    if (
      typeof angle === 'string' &&
      angle.startsWith('<sks>') &&
      cameras.length > 0
    )
      node.inputs.prompt = `${angle}\n${scene}`;
  }
  return graph;
}

export const textFactInstruction =
  '\n只输出供用户阅读的最终正文，不输出思考过程。区分设计建议、用户提供事实与待验证事项；用户没有提供的尺寸、性能指标、标准编号、试验结果及认证结论不得编造，应写“待确认”或“待验证”。保留用户给出的数值和限定条件。';

const measurement =
  /[≥≤><≈~～]?\s*\d+(?:\.\d+)?\s*(?:[-–—至]\s*\d+(?:\.\d+)?)?\s*(?:mm|cm|m²|m2|m|毫米|厘米|平方米|米|MPa|kPa|Pa|kN|N|lux|lx|K|℃|°C|度|kg|g|千克|公斤|勒克斯|%|°|个座位|张座椅|扇窗|个车门|位乘客|万次|次)(?![a-zA-Z0-9])/giu;

/** Unclosed thinking blocks are withheld rather than mistaken for final prose. */
export function finalText(content: string, source?: string) {
  let text = content
    .replaceAll(/<think(?:ing)?\b[^>]*>[\s\S]*?<\/think(?:ing)?\s*>/giu, '')
    .replaceAll(/<think(?:ing)?\b[^>]*>[\s\S]*$/giu, '')
    .replaceAll('\uFFFD', '')
    .trim();
  if (source !== undefined) {
    const normalize = (value: string) =>
      value
        .replaceAll(/\s/gu, '')
        .toLowerCase()
        .replaceAll('毫米', 'mm')
        .replaceAll('厘米', 'cm')
        .replaceAll('平方米', 'm²')
        .replaceAll('米', 'm');
    const supplied = new Set(
      (source.match(measurement) ?? []).map((value) => normalize(value)),
    );
    let replaced = false;
    text = text.replaceAll(measurement, (value) => {
      if (supplied.has(normalize(value))) return value;
      replaced = true;
      return '待确认参数';
    });
    text = text
      .replaceAll(/(?:用户|输入|提供)(?:的)?事实[：:]/gu, '待核实事项：')
      .replaceAll(/待确认参数[～至–—-]*待确认参数/gu, '待确认参数');
    for (const [pattern, placeholder] of [
      [/\b(?:GB(?:\/T)?|ISO|EN|DIN)\s*\d+(?:[-.:/]\d+)*\b/gu, '适用标准待确认'],
      [/\d+(?:\.\d+)?[:∶]\d+(?:\.\d+)?/gu, '待确认比例'],
    ] as const) {
      const values = new Set(source.match(pattern));
      text = text.replaceAll(pattern, (value) =>
        values.has(value) ? value : placeholder,
      );
    }
    if (replaced)
      text +=
        '\n\n注：未由输入资料提供的工程参数已标为待确认，请依据工程资料或检测结果补充。';
  }
  if (!text) throw new Error('模型没有返回可用的最终正文，请重试');
  return text;
}
