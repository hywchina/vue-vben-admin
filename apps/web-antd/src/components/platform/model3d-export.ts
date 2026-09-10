import type { Object3D } from 'three';

export const modelExportFormats = ['glb', 'obj', 'stl', 'fbx'] as const;
export type ModelExportFormat = (typeof modelExportFormats)[number];

/** Export only the loaded asset, excluding viewer lights, grid and camera. */
export async function exportModel(object: Object3D, format: ModelExportFormat) {
  object.updateMatrixWorld(true);
  if (format === 'glb') {
    const { GLTFExporter } =
      await import('three/addons/exporters/GLTFExporter.js');
    const result = await new GLTFExporter().parseAsync(object, {
      binary: true,
      onlyVisible: false,
    });
    if (!(result instanceof ArrayBuffer))
      throw new Error('GLB 转换未返回有效的二进制模型');
    return new Blob([result], { type: 'model/gltf-binary' });
  }
  if (format === 'obj') {
    const { OBJExporter } =
      await import('three/addons/exporters/OBJExporter.js');
    return new Blob([new OBJExporter().parse(object)], { type: 'text/plain' });
  }
  if (format === 'stl') {
    let hasMesh = false;
    object.traverse((child) => {
      if ('isMesh' in child && child.isMesh) hasMesh = true;
    });
    if (!hasMesh) throw new Error('STL 需要网格模型，当前模型仅包含点或线');
    const { STLExporter } =
      await import('three/addons/exporters/STLExporter.js');
    return new Blob([new STLExporter().parse(object, { binary: true })], {
      type: 'model/stl',
    });
  }
  const { exportFbx } = await import('./model3d-fbx-export');
  return new Blob([exportFbx(object)], { type: 'application/octet-stream' });
}
