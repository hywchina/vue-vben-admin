import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Points,
  Vector3,
} from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { describe, expect, it } from 'vitest';

import { exportFbx } from '#/components/platform/model3d-fbx-export';

describe('fbx static mesh export', () => {
  it('round-trips multiple meshes, UVs and mirrored world transforms without changing source geometry', () => {
    const group = new Group();
    group.position.set(3, 2, -1);
    const mesh = new Mesh(new BoxGeometry(1, 2, 3), new MeshStandardMaterial());
    mesh.rotation.y = 0.5;
    mesh.scale.x = -2;
    group.add(mesh);
    const second = mesh.clone();
    second.position.set(4, 0, 2);
    group.add(second);
    const original = [...mesh.geometry.getAttribute('position').array];
    const expected = new Box3().setFromObject(group);
    const text = exportFbx(group);
    const loaded = new FBXLoader().parse(
      new TextEncoder().encode(text).buffer,
      '',
    );
    const actual = new Box3().setFromObject(loaded);
    expect(actual.min.distanceTo(expected.min)).toBeLessThan(0.00001);
    expect(actual.max.distanceTo(expected.max)).toBeLessThan(0.00001);
    let vertices = 0;
    const meshes: Mesh[] = [];
    loaded.traverse((child) => {
      if (child instanceof Mesh) meshes.push(child);
    });
    expect(meshes).toHaveLength(2);
    for (const child of meshes) {
      const position = child.geometry.getAttribute('position');
      vertices += position.count;
      expect(child.geometry.getAttribute('uv').count).toBe(position.count);
      const a = new Vector3().fromBufferAttribute(position, 0);
      const b = new Vector3().fromBufferAttribute(position, 1);
      const c = new Vector3().fromBufferAttribute(position, 2);
      const normal = new Vector3().fromBufferAttribute(
        child.geometry.getAttribute('normal'),
        0,
      );
      expect(b.sub(a).cross(c.sub(a)).normalize().dot(normal)).toBeGreaterThan(
        0.99,
      );
    }
    expect(vertices).toBe(72);
    expect([...mesh.geometry.getAttribute('position').array]).toEqual(original);
  });
  it('rejects point-only content instead of producing an empty success file', () => {
    expect(() => exportFbx(new Points(new BufferGeometry()))).toThrow(
      '没有可导出的三角面',
    );
  });
});
