import type { Object3D } from 'three';

import { Mesh } from 'three';

/** Static mesh export in FBX 7.4 ASCII; source units and world transforms are preserved. */
export function exportFbx(object: Object3D): string {
  object.updateWorldMatrix(true, true);
  const nodes: string[] = [];
  const connections: string[] = [];
  let count = 0;
  object.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    if (
      'isSkinnedMesh' in child ||
      'isInstancedMesh' in child ||
      child.morphTargetInfluences?.some(Boolean)
    ) {
      throw new Error(
        'FBX 转换仅支持静态网格，请下载原文件保留骨骼、实例或形变',
      );
    }
    const geometry = child.geometry.index
      ? child.geometry.toNonIndexed()
      : child.geometry.clone();
    try {
      geometry.applyMatrix4(child.matrixWorld);
      if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
      const position = geometry.getAttribute('position');
      const normal = geometry.getAttribute('normal');
      const uv = geometry.getAttribute('uv');
      if (!position || position.count < 3) return;
      if (position.count % 3 !== 0)
        throw new Error('FBX 转换需要完整的三角网格');
      const vertices: number[] = [];
      const normals: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];
      const mirrored = child.matrixWorld.determinant() < 0;
      for (let index = 0; index < position.count; index++) {
        const offset = index % 3;
        const source =
          mirrored && offset !== 0 ? index + (offset === 1 ? 1 : -1) : index;
        vertices.push(
          position.getX(source),
          position.getY(source),
          position.getZ(source),
        );
        normals.push(
          normal.getX(source),
          normal.getY(source),
          normal.getZ(source),
        );
        if (uv) uvs.push(uv.getX(source), uv.getY(source));
        indices.push(offset === 2 ? -index - 1 : index);
      }
      if (
        !vertices.every((value) => Number.isFinite(value)) ||
        !normals.every((value) => Number.isFinite(value)) ||
        !uvs.every((value) => Number.isFinite(value))
      ) {
        throw new Error('模型包含无效坐标，无法转换 FBX');
      }
      const geometryId = 1000 + count * 2;
      const modelId = geometryId + 1;
      count++;
      nodes.push(`\tGeometry: ${geometryId}, "Geometry::Mesh${count}", "Mesh" {
\t\tGeometryVersion: 124
\t\tVertices: *${vertices.length} {
\t\t\ta: ${vertices.join(',')}
\t\t}
\t\tPolygonVertexIndex: *${indices.length} {
\t\t\ta: ${indices.join(',')}
\t\t}
\t\tLayerElementNormal: 0 {
\t\t\tVersion: 101
\t\t\tName: ""
\t\t\tMappingInformationType: "ByPolygonVertex"
\t\t\tReferenceInformationType: "Direct"
\t\t\tNormals: *${normals.length} {
\t\t\t\ta: ${normals.join(',')}
\t\t\t}
\t\t}${
        uv
          ? `
\t\tLayerElementUV: 0 {
\t\t\tVersion: 101
\t\t\tName: "UVMap"
\t\t\tMappingInformationType: "ByPolygonVertex"
\t\t\tReferenceInformationType: "Direct"
\t\t\tUV: *${uvs.length} {
\t\t\t\ta: ${uvs.join(',')}
\t\t\t}
\t\t}`
          : ''
      }
\t\tLayer: 0 {
\t\t\tVersion: 100
\t\t\tLayerElement: {
\t\t\t\tType: "LayerElementNormal"
\t\t\t\tTypedIndex: 0
\t\t\t}${
        uv
          ? `
\t\t\tLayerElement: {
\t\t\t\tType: "LayerElementUV"
\t\t\t\tTypedIndex: 0
\t\t\t}`
          : ''
      }
\t\t}
\t}
\tModel: ${modelId}, "Model::Mesh${count}", "Mesh" {
\t\tVersion: 232
\t\tShading: T
\t\tCulling: "CullingOff"
\t}`);
      connections.push(
        `\tC: "OO",${geometryId},${modelId}\n\tC: "OO",${modelId},0`,
      );
    } finally {
      geometry.dispose();
    }
  });
  if (!count) throw new Error('FBX 需要网格模型，当前模型没有可导出的三角面');
  return `; FBX 7.4.0 project file
FBXHeaderExtension: {
\tFBXHeaderVersion: 1003
\tFBXVersion: 7400
\tCreator: "Rail Platform"
}
GlobalSettings: {
\tVersion: 1000
\tProperties70: {
\t\tP: "UpAxis", "int", "Integer", "",1
\t\tP: "UpAxisSign", "int", "Integer", "",1
\t\tP: "FrontAxis", "int", "Integer", "",2
\t\tP: "FrontAxisSign", "int", "Integer", "",1
\t\tP: "CoordAxis", "int", "Integer", "",0
\t\tP: "CoordAxisSign", "int", "Integer", "",1
\t\tP: "UnitScaleFactor", "double", "Number", "",100
\t}
}
Definitions: {
\tVersion: 100
\tCount: ${count * 2}
\tObjectType: "Geometry" {
\t\tCount: ${count}
\t}
\tObjectType: "Model" {
\t\tCount: ${count}
\t}
}
Objects: {
${nodes.join('\n')}
}
Connections: {
${connections.join('\n')}
}
`;
}
