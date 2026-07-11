import * as THREE from 'three';
import { state } from '@/shared/model/gameState';
import * as config from '@/shared/config';
import * as utils from '@/shared/lib/utils';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export async function forceGpuPrewarm() {
  if (state.isGpuPrewarmed) return;
  state.cityGroup.visible = true;
  state.solarSystemGroup.visible = true;
  state.renderer.compile(state.scene, state.camera);
  state.planets.forEach((planet) => {
    const mat = planet.material as THREE.MeshStandardMaterial;
    if (mat.map) {
      state.renderer.initTexture(mat.map);
    }
  });
  if (state.cityBackgroundSphere) {
    const mat = state.cityBackgroundSphere.material as THREE.MeshBasicMaterial;
    if (mat.map) state.renderer.initTexture(mat.map);
  }
  state.renderer.setRenderTarget(null);
  state.renderer.render(state.scene, state.camera);
  state.cityGroup.visible = false;
  state.solarSystemGroup.visible = false;
  state.renderer.info.memory.geometries = 0;
  state.renderer.info.memory.textures = 0;
  console.log('!!! GPU pre-warm complete.');
  state.isGpuPrewarmed = true;
}
export function createTunnelSegmentMesh(): THREE.Mesh {
  const tunnelRadius = 20;
  const segmentLength = 4;
  const segmentGeometry = new THREE.CylinderGeometry(
    tunnelRadius,
    tunnelRadius,
    segmentLength,
    32,
    1,
    true,
  );
  const segmentMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    side: THREE.BackSide,
    toneMapped: false,
  });
  const segment = new THREE.Mesh(segmentGeometry, segmentMaterial);
  segment.layers.enable(config.BLOOM_SCENE);
  return segment;
}
export function createCircularFrameMesh(): THREE.Mesh {
  const frameGeometry = new THREE.TorusGeometry(18, 0.5, 16, 100);
  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0x00ff00,
    emissive: 0x00ff00,
    emissiveIntensity: 1.5,
    metalness: 0.5,
    roughness: 0.3,
  });
  const frame = new THREE.Mesh(frameGeometry, frameMaterial);
  frame.layers.enable(config.BLOOM_SCENE);
  return frame;
}
export function pregenerateEnvironmentElements(energyMap: number[], duration: number) {
  void energyMap;
  void duration;
  state.circularFrames.length = 0;
  const frameInterval = 0.01;
  for (let progress = 0; progress < 1.0; progress += frameInterval) {
    state.circularFrames.push({ progress: progress, mesh: null });
  }
  state.tunnels.length = 0;
  const tunnelLength = 0.05;
  const startProgress = 0.45 + Math.random() * 0.1;
  const endProgress = startProgress + tunnelLength;
  state.tunnels.push({
    startProgress: startProgress,
    endProgress: endProgress,
  });
}
export function generateTunnels() {
  while (state.tunnelGroup.children.length > 0) {
    state.tunnelGroup.remove(state.tunnelGroup.children[0]);
  }
  const tunnelMaterial = new THREE.MeshBasicMaterial({
    side: THREE.BackSide,
    toneMapped: false,
    transparent: true,
    opacity: 0.35,
  });
  for (const tunnelData of state.tunnels) {
    const totalFrames = state.trackFrames.length - 1;
    const startIndex = Math.floor(tunnelData.startProgress * totalFrames);
    const endIndex = Math.ceil(tunnelData.endProgress * totalFrames);
    const tunnelPathPoints = state.trackFrames.slice(startIndex, endIndex).map((f) => f.point);
    if (tunnelPathPoints.length < 2) continue;
    const tunnelCurve = new THREE.CatmullRomCurve3(tunnelPathPoints);
    const tunnelGeometry = new THREE.TubeGeometry(
      tunnelCurve,
      tunnelPathPoints.length * 2,
      48,
      16,
      false,
    );
    const tunnelMesh = new THREE.Mesh(tunnelGeometry, tunnelMaterial.clone());
    tunnelMesh.layers.enable(config.BLOOM_SCENE);
    state.tunnelGroup.add(tunnelMesh);
  }
}
export async function loadPlayerModel(): Promise<THREE.Group> {
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.load(
      '/assets/models/hurricane_triplestar__low_poly.glb',
      (gltf) => {
        const modelGroup = gltf.scene;
        const box = new THREE.Box3().setFromObject(modelGroup);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 6 / maxDim;
        modelGroup.scale.set(scale, scale, scale);
        const newBox = new THREE.Box3().setFromObject(modelGroup);
        const center = newBox.getCenter(new THREE.Vector3());
        modelGroup.position.sub(center);
        resolve(modelGroup);
      },
      undefined,
      (error) => {
        console.error('Failed to load player model.', error);
        reject(error);
      },
    );
  });
}
export function createCityEnvironment() {
  const textureLoader = new THREE.TextureLoader();
  const gridTexture = textureLoader.load('/assets/images/grid.png');
  gridTexture.wrapS = THREE.RepeatWrapping;
  gridTexture.wrapT = THREE.RepeatWrapping;
  gridTexture.repeat.set(20, 20);
  state.cityGroup = new THREE.Group();
  state.cityGroup.visible = false;
  state.scene.add(state.cityGroup);
  const buildingCountPerChunk = 500; // Зданий на один чанк
  const buildingGeometry = new THREE.BoxGeometry(1, 1, 1);
  state.buildingMaterial = new THREE.MeshStandardMaterial({
    color: 0x111111,
    roughness: 0.7,
    transparent: true,
    opacity: 0,
  });
  const CORRIDOR_WIDTH = 400;
  for (let x = 0; x < config.NUM_CHUNKS_AXIS; x++) {
    for (let z = 0; z < config.NUM_CHUNKS_AXIS; z++) {
      const chunk = new THREE.Group();
      // Рассчитываем позицию чанка в сетке
      chunk.position.set((x - 1) * config.CHUNK_SIZE, 0, (z - 1) * config.CHUNK_SIZE);
      const instancedBuildings = new THREE.InstancedMesh(
        buildingGeometry,
        state.buildingMaterial,
        buildingCountPerChunk,
      );
      const dummy = new THREE.Object3D();
      for (let i = 0; i < buildingCountPerChunk; i++) {
        let bx = (Math.random() - 0.5) * (config.CHUNK_SIZE - CORRIDOR_WIDTH);
        if (bx >= 0) {
          bx += CORRIDOR_WIDTH / 2;
        } else {
          bx -= CORRIDOR_WIDTH / 2;
        }
        const bz = (Math.random() - 0.5) * config.CHUNK_SIZE;
        const height = 100 + Math.random() * 800;
        const scaleX = 20 + Math.random() * 80;
        const scaleZ = 20 + Math.random() * 80;
        dummy.position.set(bx, height / 2 - 50, bz);
        dummy.scale.set(scaleX, height, scaleZ);
        dummy.updateMatrix();
        instancedBuildings.setMatrixAt(i, dummy.matrix);
      }
      instancedBuildings.instanceMatrix.needsUpdate = true;
      chunk.add(instancedBuildings);
      const groundGeometry = new THREE.PlaneGeometry(config.CHUNK_SIZE, config.CHUNK_SIZE);
      const groundMaterial = new THREE.MeshBasicMaterial({
        map: gridTexture,
        color: 0x6a00ff,
        transparent: true,
        blending: THREE.AdditiveBlending,
      });
      const ground = new THREE.Mesh(groundGeometry, groundMaterial);
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -50;
      ground.name = 'city_ground_plane';
      chunk.add(ground);
      state.cityGroup.add(chunk);
      state.cityChunks.push(chunk);
    }
  }
}
export function setActiveEnvironment(env: config.EnvironmentState) {
  if (env === config.EnvironmentState.SPACE) {
    if (state.spaceGroup) state.spaceGroup.visible = true;
    state.scene.fog = new THREE.Fog(0x000000, 10, 250);
    state.scene.background = new THREE.Color(0x000000);
  } else if (env === config.EnvironmentState.CITY) {
    const fogColor = 0x1a001a;
    state.scene.fog = new THREE.FogExp2(fogColor, 0.0015);
    state.scene.background = new THREE.Color(fogColor);
  } else if (env === config.EnvironmentState.SOLAR_SYSTEM) {
    state.scene.fog = null;
    state.scene.background = new THREE.Color(0x000000);
  }
}
export function createCityBackground() {
  const geometry = new THREE.SphereGeometry(1000, 64, 32);
  const texture = new THREE.TextureLoader().load('/assets/images/city.jpg');
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.BackSide,
    fog: false,
    color: 0x555555,
  });
  const sphere = new THREE.Mesh(geometry, material);
  return sphere;
}
export async function createSolarSystemEnvironment() {
  state.solarSystemGroup = new THREE.Group();
  state.solarSystemGroup.visible = false;
  state.scene.add(state.solarSystemGroup);
  const skyTexture = await utils.loadTextureAsync('/assets/images/milky_way.jpg');
  const skySphereGeo = new THREE.SphereGeometry(2000, 64, 32);
  const skySphereMat = new THREE.MeshBasicMaterial({
    map: skyTexture,
    side: THREE.BackSide,
    fog: false,
  });
  const skySphere = new THREE.Mesh(skySphereGeo, skySphereMat);
  state.solarSystemGroup.add(skySphere);
  const planetData = [
    {
      url: '/assets/images/planet_earth.webp',
      size: 120,
      position: new THREE.Vector3(-800, 150, -500),
    },
    {
      url: '/assets/images/planet_mars.jpg',
      size: 80,
      position: new THREE.Vector3(950, -100, -1200),
    },
    {
      url: '/assets/images/planet_gasgiant.jpg',
      size: 250,
      position: new THREE.Vector3(-100, 300, -2000),
    },
  ];
  const loadedTextures = await Promise.all(planetData.map((d) => utils.loadTextureAsync(d.url)));
  planetData.forEach((data, index) => {
    const planetGeo = new THREE.SphereGeometry(data.size, 32, 32);
    const planetMat = new THREE.MeshStandardMaterial({
      map: loadedTextures[index],
      roughness: 0.9,
      metalness: 0.1,
    });
    const planet = new THREE.Mesh(planetGeo, planetMat);
    planet.position.copy(data.position);
    state.solarSystemGroup.add(planet);
    state.planets.push(planet);
  });
  console.log('Solar system created and textures loaded.');
}
export function updateCityChunks() {
  const _tempVec3 = new THREE.Vector3();
  state.cityChunks.forEach((chunk) => {
    const chunkWorldPosition = chunk.getWorldPosition(_tempVec3);
    const distanceToChunkZ = state.camera.position.z - chunkWorldPosition.z;
    const distanceToChunkX = state.camera.position.x - chunkWorldPosition.x;
    if (distanceToChunkZ > config.CHUNK_SIZE * 1.5) {
      chunk.position.z -= config.NUM_CHUNKS_AXIS * config.CHUNK_SIZE;
    } else if (distanceToChunkZ < -config.CHUNK_SIZE * 1.5) {
      chunk.position.z += config.NUM_CHUNKS_AXIS * config.CHUNK_SIZE;
    }
    if (distanceToChunkX > config.CHUNK_SIZE * 1.5) {
      chunk.position.x -= config.NUM_CHUNKS_AXIS * config.CHUNK_SIZE;
    } else if (distanceToChunkX < -config.CHUNK_SIZE * 1.5) {
      chunk.position.x += config.NUM_CHUNKS_AXIS * config.CHUNK_SIZE;
    }
  });
}
export function createWormholeMesh(isBlackHole: boolean): THREE.Mesh {
  const geometry = new THREE.TorusGeometry(12, 3, 16, 100);
  let material;
  if (isBlackHole) {
    material = new THREE.MeshBasicMaterial({
      color: 0x000000,
      wireframe: true,
    });
  } else {
    material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
  }
  const wormhole = new THREE.Mesh(geometry, material);
  wormhole.layers.enable(config.BLOOM_SCENE);
  return wormhole;
}
export function createMenuEqualizer() {
  if (state.equalizerGroup) {
    state.scene.remove(state.equalizerGroup);
    state.equalizerGroup.children.forEach((child: any) => {
      child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
  }
  state.equalizerGroup = new THREE.Group();
  const NUM_BARS = 20;
  const BAR_SPACING_RATIO = 0.3;
  const EQ_WIDTH_RATIO = 0.9;
  const Z_DISTANCE = 12;
  const vFOV = THREE.MathUtils.degToRad(state.camera.fov);
  const visibleHeight = 2 * Math.tan(vFOV / 2) * Z_DISTANCE;
  const visibleWidth = visibleHeight * state.camera.aspect;
  const totalEqWidth = visibleWidth * EQ_WIDTH_RATIO;
  const barSpacing = (totalEqWidth / (NUM_BARS - 1)) * BAR_SPACING_RATIO;
  const barWidth = (totalEqWidth - barSpacing * (NUM_BARS - 1)) / NUM_BARS;
  const barMaterial = new THREE.MeshBasicMaterial({
    color: 0x00bfff,
    toneMapped: false,
  });
  for (let i = 0; i < NUM_BARS; i++) {
    const barGeometry = new THREE.BoxGeometry(barWidth, 1, barWidth);
    const bar = new THREE.Mesh(barGeometry, barMaterial);
    bar.layers.set(config.ENTIRE_SCENE);
    bar.layers.enable(config.BLOOM_SCENE);
    bar.position.x = i * (barWidth + barSpacing) - totalEqWidth / 2;
    state.equalizerGroup.add(bar);
  }
  state.scene.add(state.equalizerGroup);
}
export function updateMenuEqualizer(time: number) {
  if (!state.equalizerGroup || !state.equalizerGroup.visible) return;
  const MAX_HEIGHT = 10;
  const wave1Speed = 2.0,
    wave1Length = 0.5;
  const wave2Speed = 3.5,
    wave2Length = 0.8;
  const wave3Speed = 1.2,
    wave3Length = 0.3;
  state.equalizerGroup.children.forEach((bar, index) => {
    const sinValue1 = Math.sin(time * wave1Speed + index * wave1Length);
    const sinValue2 = Math.sin(time * wave2Speed + index * wave2Length);
    const sinValue3 = Math.cos(time * wave3Speed + index * wave3Length);
    const mixedWave = Math.abs(sinValue1) * Math.abs(sinValue2) * Math.abs(sinValue3);
    const height = 0.1 + mixedWave * MAX_HEIGHT;
    bar.scale.y = height;
    bar.position.y = height / 2;
  });
}
export function createBackgroundSphere() {
  const geo = new THREE.SphereGeometry(800, 64, 32);
  const mat = new THREE.MeshStandardMaterial({
    emissive: 0x00bfff,
    emissiveIntensity: 0.2,
    side: THREE.BackSide,
    fog: false,
    wireframe: true,
    opacity: 0.4,
    transparent: true,
  });
  const sphere = new THREE.Mesh(geo, mat);
  sphere.position.set(450, 200, -1500);
  return sphere;
}
export function createNebulas() {
  const num = 10000;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(num * 3);
  const colors = new Float32Array(num * 3);
  const baseColor1 = new THREE.Color(0x00aaff);
  const baseColor2 = new THREE.Color(0xff00ff);
  for (let i = 0; i < num; i++) {
    const side = Math.random() < 0.5 ? -1 : 1;
    positions[i * 3 + 0] = side * (100 + Math.random() * 200);
    positions[i * 3 + 1] = (Math.random() - 0.5) * 150;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 3000;
    const mixedColor = baseColor1.clone().lerp(baseColor2, Math.random());
    colors[i * 3 + 0] = mixedColor.r;
    colors[i * 3 + 1] = mixedColor.g;
    colors[i * 3 + 2] = mixedColor.b;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 1.5,
    vertexColors: true,
    transparent: true,
    opacity: 0.5,
    fog: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geo, mat);
}
export function createNormalStarfield(): THREE.Points {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(config.STAR_POSITIONS, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1.5,
    transparent: true,
    opacity: 0.7,
    fog: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geo, mat);
}
export function createHyperspaceStreaks(): THREE.LineSegments {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(8000 * 2 * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    fog: false,
    blending: THREE.AdditiveBlending,
  });
  const lineSegments = new THREE.LineSegments(geo, mat);
  lineSegments.visible = false;
  return lineSegments;
}
export function createPositiveBurst() {
  const geo = new THREE.BufferGeometry();
  const positions: number[] = [];
  const numPoints = 50;
  for (let i = 0; i < numPoints; i++) {
    positions.push(0, 0, 0);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.5,
    color: 0xffffff,
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 0,
    fog: false,
  });
  const burst = new THREE.Points(geo, mat);
  burst.userData.velocities = [];
  for (let i = 0; i < numPoints; i++) {
    burst.userData.velocities.push(
      new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .normalize()
        .multiplyScalar(Math.random() * 20),
    );
  }
  burst.visible = false;
  return burst;
}
export function triggerPositiveBurst(position: any, color: any) {
  state.positiveBurst.position.copy(position);
  state.positiveBurst.material.color.set(color);
  state.positiveBurst.material.opacity = 1.0;
  state.positiveBurst.visible = true;
  const positions = state.positiveBurst.geometry.attributes.position.array;
  for (let i = 0; i < positions.length; i++) {
    positions[i] = 0;
  }
  state.positiveBurst.geometry.attributes.position.needsUpdate = true;
}
export function createMeteorShower() {
  const geo = new THREE.BufferGeometry();
  const positions: number[] = [];
  const numPoints = 300;
  for (let i = 0; i < numPoints; i++) {
    positions.push(
      (Math.random() - 0.5) * 800,
      (Math.random() - 0.5) * 400,
      (Math.random() - 0.5) * 1000,
    );
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 30,
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 0,
    map: new THREE.TextureLoader().load('https://threejs.org/examples/textures/sprites/disc.png'),
  });
  const shower = new THREE.Points(geo, mat);
  shower.visible = false;
  return shower;
}
export function createLightningBolt() {
  const positions = new Float32Array(config.MAX_POINTS_PER_BOLT * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: 0xaaccee,
    transparent: true,
    blending: THREE.AdditiveBlending,
    fog: false,
    depthTest: false,
    opacity: 1.0,
  });
  const bolt = new THREE.Line(geometry, material);
  bolt.frustumCulled = false;
  bolt.userData = {
    isActive: false,
    life: 0,
  };
  bolt.visible = false;
  state.scene.add(bolt);
  return bolt;
}
export function generateLightningPoints(
  startPoint: THREE.Vector3,
  endPoint: THREE.Vector3,
  outPointsArray: THREE.Vector3[],
): number {
  outPointsArray.length = 0;
  outPointsArray.push(startPoint.clone());
  const currentPoint = startPoint.clone();
  const direction = endPoint.clone().sub(startPoint).normalize();
  const totalDistance = startPoint.distanceTo(endPoint);
  let distanceTraveled = 0;
  while (
    distanceTraveled < totalDistance &&
    outPointsArray.length < config.MAX_POINTS_PER_BOLT - 1
  ) {
    const segmentLength = 20 + Math.random() * 40;
    currentPoint.add(direction.clone().multiplyScalar(segmentLength));
    const randomOffset = new THREE.Vector3(
      (Math.random() - 0.5) * 50,
      (Math.random() - 0.5) * 50,
      (Math.random() - 0.5) * 50,
    );
    outPointsArray.push(currentPoint.clone().add(randomOffset));
    distanceTraveled += segmentLength;
  }
  outPointsArray.push(endPoint.clone());
  return outPointsArray.length;
}
export function triggerLightning(frame: {
  point: THREE.Vector3;
  tangent: THREE.Vector3;
  normal: THREE.Vector3;
  binormal: THREE.Vector3;
}) {
  if (!state.storm.lightningFlash || !state.storm.ambientLight) return;
  const { point: currentPoint, normal: trackNormal, binormal, tangent } = frame;
  const flashPosition = currentPoint
    .clone()
    .add(trackNormal.clone().multiplyScalar(200 + Math.random() * 250))
    .add(binormal.clone().multiplyScalar((Math.random() - 0.5) * 500));
  state.storm.lightningFlash.position.copy(flashPosition);
  state.storm.lightningFlash.intensity = 100 + Math.random() * 50;
  state.storm.ambientLight.intensity = 0.5 + Math.random() * 0.3;
  const boltsToCreate = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < boltsToCreate; i++) {
    const bolt = state.lightningBolts.find((b) => !b.userData.isActive);
    if (bolt) {
      const startPoint = flashPosition.clone();
      let endPoint;
      if (Math.random() > 0.3) {
        endPoint = currentPoint
          .clone()
          .add(tangent.clone().multiplyScalar(100 + Math.random() * 200))
          .add(binormal.clone().multiplyScalar((Math.random() - 0.5) * 400))
          .add(trackNormal.clone().multiplyScalar(10));
      } else {
        endPoint = startPoint
          .clone()
          .add(trackNormal.clone().multiplyScalar((Math.random() - 0.5) * 200))
          .add(binormal.clone().multiplyScalar((Math.random() - 0.5) * 600));
      }
      const pointsCount = generateLightningPoints(startPoint, endPoint, state._lightningPoints);
      const positionAttribute = bolt.geometry.attributes.position;
      for (let j = 0; j < pointsCount; j++) {
        positionAttribute.setXYZ(
          j,
          state._lightningPoints[j].x,
          state._lightningPoints[j].y,
          state._lightningPoints[j].z,
        );
      }
      for (let j = pointsCount; j < config.MAX_POINTS_PER_BOLT; j++) {
        positionAttribute.setXYZ(
          j,
          state._lightningPoints[pointsCount - 1].x,
          state._lightningPoints[pointsCount - 1].y,
          state._lightningPoints[pointsCount - 1].z,
        );
      }
      positionAttribute.needsUpdate = true;
      bolt.geometry.setDrawRange(0, pointsCount);
      bolt.material.opacity = 1.0;
      bolt.userData.isActive = true;
      bolt.userData.life = 0.8 + Math.random() * 0.4;
      bolt.visible = true;
    }
  }
  setTimeout(
    () => {
      if (state.storm.active) {
        const thunderId = Math.floor(Math.random() * 3) + 1;
        const key = `thunder${thunderId}`;
        if (state.systemAudioCtx && state.audioBuffers[key]) {
          const source = state.systemAudioCtx.createBufferSource();
          source.buffer = state.audioBuffers[key];
          source.playbackRate.value = 0.8 + Math.random() * 0.4;
          const gainNode = state.systemAudioCtx.createGain();
          gainNode.gain.value = 0.05;
          source.connect(gainNode);
          gainNode.connect(state.systemAudioCtx.destination);
          source.start(0);
        }
      }
    },
    100 + Math.random() * 200,
  );
}
export function updateEnvironmentElements() {
  const activationZone = state.playerProgress + config.BLOCK_VIEW_DISTANCE;
  const deactivationZone = state.playerProgress - 0.02;
  for (const frameObj of state.circularFrames) {
    if (
      !frameObj.mesh &&
      frameObj.progress > state.playerProgress &&
      frameObj.progress < activationZone
    ) {
      const frameMesh = utils.getFromPool(state.framePool, createCircularFrameMesh);
      if (frameMesh) {
        frameObj.mesh = frameMesh;
        state.circularFramesGroup.add(frameObj.mesh);
      }
    }
    if (frameObj.mesh && frameObj.progress < deactivationZone) {
      utils.recycleObject(frameObj.mesh, state.framePool);
      frameObj.mesh = null;
    }
    if (frameObj.mesh) {
      const frame = utils.getInterpolatedFrame(frameObj.progress);
      frameObj.mesh.position.copy(frame.point);
      frameObj.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), frame.tangent);
      const material = frameObj.mesh.material as THREE.MeshStandardMaterial;
      material.color.copy(state.currentColor);
      material.emissive.copy(state.currentColor);
    }
  }
  for (const tunnelMesh of state.tunnelGroup.children) {
    const material = (tunnelMesh as THREE.Mesh).material as THREE.MeshBasicMaterial;
    material.color.copy(state.currentColor);
  }
}
export function updateRailEqualizer(rail: THREE.Mesh, frequencyData: Uint8Array) {
  if (!rail || !rail.userData.originalVertices) return;
  const originalPositions = rail.userData.originalVertices;
  const currentPositions = rail.geometry.attributes.position;
  const normals = rail.geometry.attributes.normal;
  const vertexCount = originalPositions.count;
  const BASS_INFLUENCE = 1.4; // Насколько сильно бас "надувает" волны
  const MID_WAVE_SPEED = 0.5; // Как часто идут волны
  const TREBLE_FLICKER = 0.1; // Сила электрического мерцания
  const bassValue = (frequencyData[2] + frequencyData[3] + frequencyData[4]) / 3 / 255.0;
  const midValue = frequencyData[Math.floor(frequencyData.length / 2)] / 255.0;
  const trebleValue = frequencyData[frequencyData.length - 20] / 255.0;
  for (let i = 0; i < vertexCount; i++) {
    const oz = originalPositions.getZ(i);
    const wave = Math.sin(oz * midValue * MID_WAVE_SPEED + state.audioContext.currentTime * 5);
    const amplitude = bassValue * BASS_INFLUENCE;
    const flicker = (Math.random() - 0.5) * trebleValue * TREBLE_FLICKER;
    const displacement = amplitude * wave + flicker;
    const ox = originalPositions.getX(i);
    const oy = originalPositions.getY(i);
    const oz_pos = originalPositions.getZ(i);
    const nx = normals.getX(i);
    const ny = normals.getY(i);
    const nz = normals.getZ(i);
    currentPositions.setXYZ(
      i,
      ox + nx * displacement,
      oy + ny * displacement,
      oz_pos + nz * displacement,
    );
  }
  currentPositions.needsUpdate = true;
  rail.userData.isDeformed = true;
}
export function updateSceneColors(targetColor: THREE.Color) {
  state.currentColor.lerp(targetColor, 0.08);
  (state.composer.passes[1] as UnrealBloomPass).strength = 0.6 + state.lerpedEnergy * 1.2;
  if (state.trackGroup) {
    state.trackGroup.children.forEach((child: any) => {
      // ВАЖНО: Мы должны менять цвет ТОЛЬКО у рельсов, которые являются TubeGeometry.
      // Дорожное полотно имеет другой тип геометрии и этот блок его проигнорирует.
      if (child.geometry.type === 'TubeGeometry') {
        if (!child.material) return;
        // Так как все рельсы теперь используют наш кастомный шейдер,
        // мы обновляем их uniform-переменную 'emissive', которая отвечает за цвет.
        if (child.material.isShaderMaterial) {
          child.material.uniforms.emissive.value.copy(state.currentColor);
        }
        // Этот блок на случай, если остался какой-то старый материал рельсов
        else if (child.material.emissive) {
          child.material.emissive.copy(state.currentColor);
          child.material.color.copy(state.currentColor);
        }
      }
    });
  }
}
export function setupAndPositionVideoScreens() {
  if (state.videoElements.length === 0) {
    console.warn('Видео-элементы не были предзагружены.');
    return;
  }
  const screenWidth = 22;
  const screenHeight = screenWidth * (9 / 16);
  const geometry = new THREE.PlaneGeometry(screenWidth, screenHeight);
  for (let i = 0; i < state.videoElements.length; i++) {
    const video = state.videoElements[i] as any;
    const texture = new THREE.VideoTexture(video);
    const material = new THREE.MeshStandardMaterial({
      emissive: 0xffffff,
      emissiveIntensity: 0.5,
      emissiveMap: texture,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
      color: 0x000000,
      fog: false,
    });
    const screenMesh = new THREE.Mesh(geometry, material);
    screenMesh.userData.isReady = video.isReady;
    state.videoScreensGroup.add(screenMesh);
  }
}
/**
 * Управляет видимостью и воспроизведением видео на экранах.
 */
export function updateVideoScreensVisibility(visible: boolean) {
  if (state.videoElements.length === 0) return;
  if (visible) {
    state.videoScreensGroup.visible = true;
  }
}
export function updateVideoScreensPosition() {
  if (!state.videoScreensGroup.visible) return;
  const _playerFrame = {
    point: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    binormal: new THREE.Vector3(),
  };
  const _screenFrameForLoop = {
    point: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    binormal: new THREE.Vector3(),
  };
  const START_AHEAD_UNITS = 15;
  const SPACING_UNITS = 25;
  const SIDE_OFFSET_UNITS = 30;
  const VERTICAL_OFFSET_UNITS = 5;
  utils.getInterpolatedFrame(state.playerProgress, _playerFrame);
  const playerLookAtTarget = _playerFrame.point;
  state.videoScreensGroup.children.forEach((screen, index) => {
    const isLeftSide = index < config.NUM_SCREENS / 2;
    const sideMultiplier = isLeftSide ? -1 : 1;
    const indexOnSide = index % (config.NUM_SCREENS / 2);
    const screenProgress =
      state.playerProgress +
      (START_AHEAD_UNITS + indexOnSide * SPACING_UNITS) / state.trackCurve.getLength();
    if (screenProgress >= 1.0) {
      screen.visible = false;
      return;
    }
    screen.visible = true;
    const screenFrame = utils.getInterpolatedFrame(screenProgress, _screenFrameForLoop);
    state._screenPos
      .copy(screenFrame.point)
      .add(screenFrame.binormal.clone().multiplyScalar(sideMultiplier * SIDE_OFFSET_UNITS))
      .add(screenFrame.normal.clone().multiplyScalar(VERTICAL_OFFSET_UNITS));
    screen.position.copy(state._screenPos);
    const tangent = screenFrame.tangent;
    const normal = screenFrame.normal;
    const binormal = screenFrame.binormal.clone().multiplyScalar(-sideMultiplier);
    state._lookAtMatrix.makeBasis(tangent, normal, binormal);
    state._parallelQuat.setFromRotationMatrix(state._lookAtMatrix);
    state._lookAtMatrix.lookAt(screen.position, playerLookAtTarget, normal);
    state._lookAtQuat.setFromRotationMatrix(state._lookAtMatrix);
    state._parallelQuat.slerp(state._lookAtQuat, 0.7);
    screen.quaternion.copy(state._parallelQuat);
  });
}
/**
 * ЗАРАНЕЕ загружает все видео-чанки в фоне, не создавая 3D-объектов.
 * Вызывается сразу после выбора файла.
 */
export function preloadVideoScreens() {
  if (!state.videoUrl.trim()) return;
  console.log('Начинаю фоновую загрузку чанков параллельно...');
  const segmentDuration = 30;
  for (let i = 0; i < config.NUM_SCREENS; i++) {
    const video = document.createElement('video');
    (video as any).isReady = false;
    video.playsInline = true;
    video.style.display = 'none';
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.loop = true;
    document.body.appendChild(video);
    state.videoElements.push(video);
    const startTime = Math.floor(i * segmentDuration);
    const chunkUrl = `https://audiotrip.space/get-video-chunk?url=${encodeURIComponent(state.videoUrl)}&startTime=${startTime}&duration=${segmentDuration}`;
    fetch(chunkUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`Ошибка: ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        const blobUrl = URL.createObjectURL(blob);
        video.src = blobUrl;
        (video as any).isReady = true;
        console.log(`[ФОН] Видео-чанк ${i} успешно загружен!`);
      })
      .catch((error) => {
        console.error(`[ФОН] Ошибка скачивания чанка ${i}:`, error);
      });
  }
}
