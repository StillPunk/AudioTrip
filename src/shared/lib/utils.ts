import * as THREE from 'three';
import { gsap } from 'gsap';
import { state } from '@/shared/model/gameState';

export function fade(
  group: THREE.Group | null,
  opacity: number,
  duration: number,
  onComplete?: () => void,
) {
  if (!group) {
    if (onComplete) onComplete();
    return;
  }
  const transitionTarget = {
    value: group.userData.opacity !== undefined ? group.userData.opacity : 1.0,
  };
  gsap.to(transitionTarget, {
    value: opacity,
    duration: duration,
    onUpdate: () => {
      group.userData.opacity = transitionTarget.value;
      group.traverse((object: any) => {
        if (object.material) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => {
            material.transparent = true;
            material.opacity = transitionTarget.value;
          });
        }
      });
    },
    onComplete: () => {
      if (opacity >= 1.0) {
        group.traverse((object: any) => {
          if (object.material) {
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((material) => {
              material.transparent = false;
            });
          }
        });
      }
      if (onComplete) onComplete();
    },
  });
}
export function loadTextureAsync(url: string): Promise<THREE.Texture> {
  return new Promise((resolve) => {
    new THREE.TextureLoader().load(
      url,
      (texture: any) => {
        resolve(texture);
      },
      undefined,
      () => {
        resolve(new THREE.Texture());
      },
    );
  });
}
export function smoothArray(data: number[], windowSize: number): number[] {
  const smoothed: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - windowSize);
    const end = Math.min(data.length, i + windowSize + 1);
    let sum = 0;
    for (let j = start; j < end; j++) {
      sum += data[j];
    }
    smoothed.push(sum / (end - start));
  }
  return smoothed;
}
export function getFromPool(pool: any[], factory: () => THREE.Object3D) {
  const obj: THREE.Object3D = pool.length > 0 ? (pool.pop() as THREE.Object3D) : factory();
  obj.visible = true;
  state.scene.add(obj);
  return obj;
}
export function recycleToPool(block: any) {
  if (block.mesh) {
    const pool = block.type === 'color' ? state.colorBlockPool : state.obstaclePool;
    recycleObject(block.mesh, pool);
    block.mesh = null;
  }
}
export function recycleObject(mesh: THREE.Object3D, pool: any[]) {
  if (!mesh) return;
  mesh.visible = false;
  if (mesh.parent) {
    mesh.parent.remove(mesh);
  }
  pool.push(mesh);
}
export function getInterpolatedFrame(progress: number, targetFrame = state._reusableFrame) {
  const totalFrames = state.trackFrames.length - 1;
  const idx = progress * totalFrames;
  const i1 = Math.floor(idx);
  const i2 = Math.min(i1 + 1, totalFrames);
  const t = idx - i1;
  if (i1 >= state.trackFrames.length || i2 >= state.trackFrames.length) {
    const lastFrame = state.trackFrames[totalFrames];
    targetFrame.point.copy(lastFrame.point);
    targetFrame.tangent.copy(lastFrame.tangent);
    targetFrame.normal.copy(lastFrame.normal);
    targetFrame.binormal.copy(lastFrame.binormal);
    return targetFrame;
  }
  if (i1 === i2) {
    const frame = state.trackFrames[i1];
    targetFrame.point.copy(frame.point);
    targetFrame.tangent.copy(frame.tangent);
    targetFrame.normal.copy(frame.normal);
    targetFrame.binormal.copy(frame.binormal);
    return targetFrame;
  }
  const frame1 = state.trackFrames[i1];
  const frame2 = state.trackFrames[i2];
  targetFrame.point.lerpVectors(frame1.point, frame2.point, t);
  targetFrame.tangent.lerpVectors(frame1.tangent, frame2.tangent, t).normalize();
  targetFrame.normal.lerpVectors(frame1.normal, frame2.normal, t).normalize();
  targetFrame.binormal.lerpVectors(frame1.binormal, frame2.binormal, t).normalize();
  targetFrame.normal.projectOnPlane(targetFrame.tangent).normalize();
  targetFrame.binormal.crossVectors(targetFrame.tangent, targetFrame.normal);
  return targetFrame;
}
export function cleanSearchQuery(rawQuery: string): string {
  return rawQuery
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/official music video|official video|lyrics|audio|hd|4k/gi, '')
    .replace(/(www\.|http:\/\/|https:\/\/)[^\s]+/g, '')
    .replace(/\.[^/.]+$/, '')
    .replace(/^\d+\s*[-.]?\s*/, '')
    .replace(/[—–_]/g, '-')
    .trim();
}

export function getTargetColor(energy: number): THREE.Color {
  const calmLow = new THREE.Color(0x00bfff); // blue: DeepSkyBlue
  const calmHigh = new THREE.Color(0x20c20e); // green
  const mediumLow = new THREE.Color(0xffff00); // yellow
  const mediumHigh = new THREE.Color(0xff4500); // orange-red
  const intenseLow = new THREE.Color(0xff4500); // orange-red
  const intenseHigh = new THREE.Color(0xdc143c); // crimson
  const calmThreshold = 0.3;
  const mediumThreshold = 0.7;
  const targetColor = new THREE.Color();
  if (energy < calmThreshold) {
    const t = energy / calmThreshold;
    targetColor.lerpColors(calmLow, calmHigh, t);
  } else if (energy < mediumThreshold) {
    const t = (energy - calmThreshold) / (mediumThreshold - calmThreshold);
    targetColor.lerpColors(mediumLow, mediumHigh, t);
  } else {
    const t = Math.min(1.0, (energy - mediumThreshold) / (1.0 - mediumThreshold));
    targetColor.lerpColors(intenseLow, intenseHigh, t);
  }
  return targetColor;
}
