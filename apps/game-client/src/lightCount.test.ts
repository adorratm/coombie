import * as THREE from 'three';
import { describe, expect, test } from 'vitest';
import { setDrawablesVisible } from './avatars';

const visibleLights = (scene: THREE.Object3D): number => {
  let n = 0;
  scene.traverseVisible((o) => {
    if ((o as THREE.Light).isLight) n++;
  });
  return n;
};

describe('setDrawablesVisible', () => {
  test('hiding a gun keeps its muzzle light in the scene light count', () => {
    const scene = new THREE.Scene();
    const gun = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    const muzzle = new THREE.Object3D();
    muzzle.add(new THREE.PointLight(0xffcc66, 0, 8));
    gun.add(barrel, muzzle);
    scene.add(gun);
    const before = visibleLights(scene);

    setDrawablesVisible(gun, false);

    expect(barrel.visible).toBe(false);
    expect(visibleLights(scene)).toBe(before);
  });

  test('showing it again restores the meshes', () => {
    const gun = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    gun.add(barrel);
    setDrawablesVisible(gun, false);

    setDrawablesVisible(gun, true);

    expect(barrel.visible).toBe(true);
  });
});
