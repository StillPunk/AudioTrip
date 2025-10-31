declare const jsmediatags: any;

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { gsap } from "gsap";

const SketchShader = {
  uniforms: {
    'tDiffuse': { value: null },
    'resolution': { value: new THREE.Vector2() }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    varying vec2 vUv;

    void main() {
      vec2 texel = vec2( 1.0 / resolution.x, 1.0 / resolution.y );

      // Ядро оператора Собеля для определения границ
      const mat3 Gx = mat3( -1, -2, -1, 0, 0, 0, 1, 2, 1 );
      const mat3 Gy = mat3( -1, 0, 1, -2, 0, 2, -1, 0, 1 );

      // Получаем значения яркости соседних пикселей
      float tx0y0 = texture2D( tDiffuse, vUv + texel * vec2( -1, -1 ) ).r;
      float tx0y1 = texture2D( tDiffuse, vUv + texel * vec2( -1, 0 ) ).r;
      float tx0y2 = texture2D( tDiffuse, vUv + texel * vec2( -1, 1 ) ).r;
      float tx1y0 = texture2D( tDiffuse, vUv + texel * vec2( 0, -1 ) ).r;
      float tx1y1 = texture2D( tDiffuse, vUv + texel * vec2( 0, 0 ) ).r;
      float tx1y2 = texture2D( tDiffuse, vUv + texel * vec2( 0, 1 ) ).r;
      float tx2y0 = texture2D( tDiffuse, vUv + texel * vec2( 1, -1 ) ).r;
      float tx2y1 = texture2D( tDiffuse, vUv + texel * vec2( 1, 0 ) ).r;
      float tx2y2 = texture2D( tDiffuse, vUv + texel * vec2( 1, 1 ) ).r;

      mat3 I;
      I[0] = vec3( tx0y0, tx0y1, tx0y2 );
      I[1] = vec3( tx1y0, tx1y1, tx1y2 );
      I[2] = vec3( tx2y0, tx2y1, tx2y2 );
      
      // Вычисляем градиент (насколько сильно меняется яркость)
      float Gx_val = dot( Gx[0], I[0] ) + dot( Gx[1], I[1] ) + dot( Gx[2], I[2] );
      float Gy_val = dot( Gy[0], I[0] ) + dot( Gy[1], I[1] ) + dot( Gy[2], I[2] );
      float G = sqrt( pow( Gx_val, 2.0 ) + pow( Gy_val, 2.0 ) );

      // Если градиент больше порога, значит это контур
      if ( G > 0.25 ) { 
        gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 ); // Рисуем контур черным
      } else {
        gl_FragColor = vec4( 1.0, 1.0, 1.0, 1.0 ); // Все остальное - белым
      }
    }
  `
};

const RailEqualizerMaterial = {
  uniforms: {
    uBass: { value: 0.0 },
    uMid: { value: 0.0 },
    uTreble: { value: 0.0 },
    uTime: { value: 0.0 },
    emissive: { value: new THREE.Color(0x00bfff) },
    emissiveIntensity: { value: 1.0 }
  },

  vertexShader: `
    uniform float uBass;
    uniform float uMid;
    uniform float uTime;
    uniform float uTreble;
    
    // Varying для передачи нормали во фрагментный шейдер
    varying vec3 vNormal;
    
    void main() {
      vNormal = normal;
      
      const float BASS_INFLUENCE = 1.4;
      const float MID_WAVE_SPEED = 0.5;
      const float TREBLE_FLICKER = 0.1;
      
      float pseudoRandom = fract(sin(dot(position.xyz, vec3(12.9898, 78.233, 151.7182))) * 43758.5453);
      
      float wave = sin(position.z * uMid * MID_WAVE_SPEED + uTime * 5.0);
      
      float amplitude = uBass * BASS_INFLUENCE;
      
      float flicker = (pseudoRandom - 0.5) * uTreble * TREBLE_FLICKER;
      
      float displacement = amplitude * wave + flicker;
      
      vec3 newPosition = position + normal * displacement;
      
      gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
    }
  `,

  fragmentShader: `
    uniform vec3 emissive;
    uniform float emissiveIntensity;
    varying vec3 vNormal;
    
    void main() {
      float light = clamp(dot(vNormal, vec3(0.5, 0.5, 1.0)), 0.0, 1.0);
      gl_FragColor = vec4(emissive * (light + emissiveIntensity), 1.0);
    }
  `
};

const _reusableVector1 = new THREE.Vector3();
const _reusableVector2 = new THREE.Vector3();
const _reusableVector3 = new THREE.Vector3();
const _reusableVector4 = new THREE.Vector3();

const _reusableFrame = {
  point: new THREE.Vector3(),
  tangent: new THREE.Vector3(),
  normal: new THREE.Vector3(),
  binormal: new THREE.Vector3()
};

enum EnvironmentState { SPACE, CITY, SOLAR_SYSTEM }
let currentEnvironment = EnvironmentState.SPACE;
let spaceGroup: THREE.Group;
let cityBackgroundSphere: THREE.Mesh;

let solarSystemGroup: THREE.Group;
const planets: THREE.Mesh[] = [];

// --- DOM Elements ---
const canvas = document.getElementById('webgl-canvas') as HTMLCanvasElement;
const fileInput = document.getElementById('audio-file-input') as HTMLInputElement;
const startScreen = document.getElementById('start-screen')!;
const startPrompt = document.getElementById('start-prompt') as HTMLParagraphElement;
const fileLabel = document.getElementById('file-label') as HTMLLabelElement;
const loadingScreen = document.getElementById('loading-screen')!;
const loadingText = document.getElementById('loading-text')!;
const analysisText = document.getElementById('analysis-text')!;
const scoreEl = document.getElementById('score')!;
const endScreen = document.getElementById('end-screen')!;
const finalScoreEl = document.getElementById('final-score')!;
const restartButton = document.getElementById('restart-button')!;
const vignette = document.getElementById('vignette')!;
const gameHud = document.getElementById('game-hud')!;
const pauseButton = document.getElementById('pause-button')!;
const pauseMenu = document.getElementById('pause-menu')!;
const resumeButton = document.getElementById('resume-button')!;
const mainMenuButton = document.getElementById('main-menu-button')!;
const styleRankContainer = document.getElementById('style-rank-container')!;
const rankImage = document.getElementById('rank-image') as HTMLImageElement;
const progressBarFill = document.getElementById('progress-bar-fill') as HTMLElement;
const scoreMultiplierEl = document.getElementById('score-multiplier')!;
const searchInput = document.getElementById('song-search-input') as HTMLInputElement;
const autocompleteResults = document.getElementById('autocomplete-results')!;
const historyScreen = document.getElementById('history-screen')!;
const historyTableBody = document.getElementById('history-table-body')!;
const historyButton = document.getElementById('history-button')!;
const historyCloseButton = document.getElementById('history-close-button')!;
const leaderboardScreen = document.getElementById('leaderboard-screen')!;
const leaderboardButton = document.getElementById('leaderboard-button')!;
const leaderboardCloseButton = document.getElementById('leaderboard-close-button')!;
const totalScoreEl = document.getElementById('total-score')!;
const claimButton = document.getElementById('claim-button')!;
const claimScreen = document.getElementById('claim-screen')!;
const claimCloseButton = document.getElementById('claim-close-button')!;
const tutorialScreen = document.getElementById('tutorial-screen')!;
const tutorialContinueButton = document.getElementById('tutorial-continue-button')!;

const STYLE_RANKS = [
  { name: 'Dismal', rank: 'D', hitsNeeded: 5, multiplier: 2, image: 'assets/images/rank_d.png' },
  { name: 'Crazy', rank: 'C', hitsNeeded: 10, multiplier: 3, image: 'assets/images/rank_c.png' },
  { name: 'Badass', rank: 'B', hitsNeeded: 15, multiplier: 4, image: 'assets/images/rank_b.png' },
  { name: 'Apocalyptic', rank: 'A', hitsNeeded: 20, multiplier: 5, image: 'assets/images/rank_a.png' },
  { name: 'Savage!', rank: 'S', hitsNeeded: 25, multiplier: 6, image: 'assets/images/rank_s.png' },
  { name: 'Sick Skills!', rank: 'SS', hitsNeeded: 30, multiplier: 7, image: 'assets/images/rank_ss.png' },
  { name: 'Smokin\' Sexy Style!', rank: 'SSS', hitsNeeded: 35, multiplier: 8, image: 'assets/images/rank_sss.png' }
];

// --- 3D Scene Variables ---
let scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer, composer: EffectComposer, bloomComposer: EffectComposer;
let player: THREE.Group, trackGroup: THREE.Group, backgroundSphere: THREE.Mesh, nebulaParticles: THREE.Points,
  normalStarfield: THREE.Points, hyperspaceStreaks: THREE.LineSegments, meteorShower: any, positiveBurst: any;
let sketchPass: ShaderPass;
let audioContext: AudioContext, analyser: AnalyserNode, source: AudioBufferSourceNode;
let frequencyData: Uint8Array;
let animationFrameId: number;
let score = 0;

let cityGroup: THREE.Group;
let buildingMaterial: THREE.Material;
let videoScreensGroup: THREE.Group;
const videoElements: HTMLVideoElement[] = [];
let isARankEffectActive = false;
const NUM_SCREENS = 4;
let videoUrl = '';
let equalizerGroup: THREE.Group;

// --- Game Data & State ---
let trackCurve: THREE.CatmullRomCurve3;
let trackFrames: {
  point: THREE.Vector3;
  tangent: THREE.Vector3;
  normal: THREE.Vector3;
  binormal: THREE.Vector3;
}[] = [];
let playerProgress = 0;
let lastPlayerProgress = 0;
let songData: { duration: number, energyMap: number[] } | null = null;
let gameStarted = false;
let isPaused = false;
let consecutiveHits = 0;
let currentRankIndex = -1;
let previousRankIndex = -1;
let targetPlayerLane = 1;
let actualPlayerLane = 1;
const keyState = { left: false, right: false };
let timeInRedZone = 0;
let isGpuPrewarmed = false;
let activeTransition: { inProgress: boolean, onComplete: () => void } = {
  inProgress: false,
  onComplete: () => {}
};
let currentTrackName = '';
let currentVideoId = '';
let maxCombo = 0;
let totalMisses = 0;
const rankHistory: number[] = [];

// --- Color & Effects State ---
let currentColor = new THREE.Color(0x00bfff);
let lerpedEnergy = 0;
let hyperspaceEffect = { active: false, timer: 0, duration: 1.5 };
let lastHyperspaceTriggerTime = -Infinity;
let hyperspaceJumpCount = 0;

// --- Camera Shake & Effects ---
let shakeTime = 0;
let shakeIntensity = 0;

let storm = {
  active: false,
  lightningFlash: null as THREE.PointLight | null,
  ambientLight: null as THREE.AmbientLight | null,
  lastFlashTime: 0,
  nextFlashDelay: 0,
  thunderSounds: [] as HTMLAudioElement[]
};
let lightningBolts: any[] = [];
const MAX_BOLTS_IN_POOL = 50; // Пул объектов для молний, чтобы не создавать их на лету

const NORMAL_SKY_COLOR = new THREE.Color(0x00aaff);
let currentSkyColor = NORMAL_SKY_COLOR.clone();

// --- Game Constants ---
const MAX_HYPERSPACE_JUMPS = 5;
const LANE_WIDTH = 5;
const NUM_LANES = 3;
const LANE_POSITIONS = [-(NUM_LANES - 1) / 2 * LANE_WIDTH, 0, (NUM_LANES - 1) / 2 * LANE_WIDTH];
const ANALYSIS_CHUNK_SAMPLES = 4096;
const BLOCK_VIEW_DISTANCE = 0.1;
const STAR_COUNT = 40000;
const STAR_POSITIONS = new Float32Array(STAR_COUNT * 3);
for (let i = 0; i < STAR_COUNT; i++) {
  const i3 = i * 3;
  STAR_POSITIONS[i3 + 0] = (Math.random() - 0.5) * 4000;
  STAR_POSITIONS[i3 + 1] = (Math.random() - 0.5) * 3000;
  STAR_POSITIONS[i3 + 2] = (Math.random() - 0.5) * 4000;
}

let fadeOutPlane: THREE.Mesh;
const ENTIRE_SCENE = 0, BLOOM_SCENE = 1;
const bloomLayer = new THREE.Layers();
bloomLayer.set(BLOOM_SCENE);

// --- Block Management ---
const allBlocks: any[] = [];
const colorBlockPool: any[] = [];
const greyBlockPool: any[] = [];

let isSketchModeActive = false;
let sketchModeTimer = 0;
const SKETCH_MODE_DURATION = 10.0

const specialEventObjects: any[] = [];
const wormholePool: THREE.Mesh[] = [];

let nextWormholeSpawnTime = 0;
let hasSketchModeBeenTriggeredThisSong = false;

let circularFramesGroup: THREE.Group;
let tunnelGroup: THREE.Group;
const circularFrames: any[] = [];
const tunnels: any[] = [];
const FRAME_POOL_SIZE = 30;
const framePool: THREE.Mesh[] = [];
const TUNNEL_SEGMENT_POOL_SIZE = 50;
const tunnelSegmentPool: THREE.Mesh[] = [];
let cityFadeIn = { active: false, progress: 0, duration: 1.5 };

const soundManager = {
  audioObjects: {} as { [key: string]: HTMLAudioElement },
  soundsToLoad: {
    buttonclick: 'ui_buttonclick.wav',
    buttonhover: 'ui_buttonhover.wav',
    characterselect: 'ui_characterselect.wav',
    collision_color: 'collision_color.wav',
    collision_stone: 'collision_stone.wav',
    matchsmall: 'matchsmall.wav',
    matchlarge: 'matchlarge.wav',
    matchhuge: 'matchhuge.wav'
  },

  loadSounds: function() {
    console.log("Loading sounds...");
    for (const key in this.soundsToLoad) {
      const fileName = this.soundsToLoad[key as keyof typeof this.soundsToLoad];
      this.audioObjects[key] = new Audio(`assets/sounds/${fileName}`);
      this.audioObjects[key].volume = 0.7;
    }
    console.log("Sounds loaded.");
  },

  playSound: function(name: string) {
    if (this.audioObjects[name]) {
      this.audioObjects[name].currentTime = 0;
      this.audioObjects[name].play();
    }
  }
};

async function forceGpuPrewarm() {
  if (isGpuPrewarmed) return;

  console.log("!!! Forcing GPU to pre-load all assets. This might take a moment...");

  const prewarmTargets = [cityGroup, solarSystemGroup];

  for (const group of prewarmTargets) {
    group.visible = true;

    renderer.render(scene, camera);

    group.visible = false;
  }

  renderer.info.memory.geometries = 0;
  renderer.info.memory.textures = 0;

  console.log("!!! GPU pre-warm complete. All transitions will be smooth.");
  isGpuPrewarmed = true;
}

function fade(group: THREE.Group | null, opacity: number, duration: number, onComplete?: () => void) {
  if (!group) {
    if (onComplete) onComplete();
    return;
  }

  const transitionTarget = { value: group.userData.opacity !== undefined ? group.userData.opacity : 1.0 };

  gsap.to(transitionTarget, {
    value: opacity,
    duration: duration,
    onUpdate: () => {
      group.userData.opacity = transitionTarget.value;
      group.traverse((object: any) => {
        if (object.material) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach(material => {
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
            materials.forEach(material => {
              material.transparent = false;
            });
          }
        });
      }
      if (onComplete) onComplete();
    }
  });
}

function createTunnelSegmentMesh(): THREE.Mesh {
  const tunnelRadius = 20;
  const segmentLength = 4;

  const segmentGeometry = new THREE.CylinderGeometry(tunnelRadius, tunnelRadius, segmentLength, 32, 1, true);

  const segmentMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    side: THREE.BackSide,
    toneMapped: false
  });

  const segment = new THREE.Mesh(segmentGeometry, segmentMaterial);

  segment.layers.enable(BLOOM_SCENE);

  return segment;
}

function createCircularFrameMesh(): THREE.Mesh {
  const frameGeometry = new THREE.TorusGeometry(18, 0.5, 16, 100);
  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0x00ff00,
    emissive: 0x00ff00,
    emissiveIntensity: 1.5,
    metalness: 0.5,
    roughness: 0.3,
  });
  const frame = new THREE.Mesh(frameGeometry, frameMaterial);
  frame.layers.enable(BLOOM_SCENE);
  return frame;
}

function pregenerateEnvironmentElements(energyMap: number[], duration: number) {
  circularFrames.length = 0;
  const frameInterval = 0.01;
  for (let progress = 0; progress < 1.0; progress += frameInterval) {
    circularFrames.push({ progress: progress, mesh: null });
  }

  tunnels.length = 0;

  const tunnelLength = 0.05;
  const startProgress = 0.45 + Math.random() * 0.1;
  const endProgress = startProgress + tunnelLength;

  tunnels.push({
    startProgress: startProgress,
    endProgress: endProgress
  });
}

function generateTunnels() {
  while(tunnelGroup.children.length > 0){
    tunnelGroup.remove(tunnelGroup.children[0]);
  }

  const tunnelMaterial = new THREE.MeshBasicMaterial({
    side: THREE.BackSide,
    toneMapped: false,
    transparent: true,
    opacity: 0.35
  });

  for (const tunnelData of tunnels) {
    const totalFrames = trackFrames.length - 1;
    const startIndex = Math.floor(tunnelData.startProgress * totalFrames);
    const endIndex = Math.ceil(tunnelData.endProgress * totalFrames);
    const tunnelPathPoints = trackFrames.slice(startIndex, endIndex).map(f => f.point);

    if (tunnelPathPoints.length < 2) continue;

    const tunnelCurve = new THREE.CatmullRomCurve3(tunnelPathPoints);

    const tunnelGeometry = new THREE.TubeGeometry(
      tunnelCurve,
      tunnelPathPoints.length * 2,
      48,
      16,
      false
    );

    const tunnelMesh = new THREE.Mesh(tunnelGeometry, tunnelMaterial.clone());
    tunnelMesh.layers.enable(BLOOM_SCENE);
    tunnelGroup.add(tunnelMesh);
  }
}

async function loadPlayerModel(): Promise<THREE.Group> {
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.load('assets/models/hurricane_triplestar__low_poly.glb',
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
      }
    );
  });
}

function handleTouchStart(event: TouchEvent) {
  event.preventDefault();

  const touchX = event.touches[0].clientX;
  const screenMidpoint = window.innerWidth / 2;

  if (touchX < screenMidpoint) {
    keyState.left = true;
    keyState.right = false;
  } else {
    keyState.right = true;
    keyState.left = false;
  }
}

function handleTouchEnd(event: TouchEvent) {
  event.preventDefault();

  keyState.left = false;
  keyState.right = false;
}

function togglePause() {
  if (!gameStarted) return;

  isPaused = !isPaused;

  if (isPaused) {
    audioContext.suspend();
    pauseMenu.classList.remove('hidden');
  } else {
    audioContext.resume();
    pauseMenu.classList.add('hidden');
  }
}

const cityChunks: THREE.Group[] = [];
const CHUNK_SIZE = 2000;
const NUM_CHUNKS_AXIS = 3;

function createCityEnvironment() {
  const textureLoader = new THREE.TextureLoader();
  const gridTexture = textureLoader.load('assets/images/grid.png');

  gridTexture.wrapS = THREE.RepeatWrapping;
  gridTexture.wrapT = THREE.RepeatWrapping;
  gridTexture.repeat.set(20, 20);

  cityGroup = new THREE.Group();
  cityGroup.visible = false;
  scene.add(cityGroup);

  const buildingCountPerChunk = 500; // Зданий на один чанк
  const buildingGeometry = new THREE.BoxGeometry(1, 1, 1);
  buildingMaterial = new THREE.MeshStandardMaterial({
    color: 0x111111,
    roughness: 0.7,
    transparent: true,
    opacity: 0
  });

  const CORRIDOR_WIDTH = 400;

  for (let x = 0; x < NUM_CHUNKS_AXIS; x++) {
    for (let z = 0; z < NUM_CHUNKS_AXIS; z++) {
      const chunk = new THREE.Group();

      // Рассчитываем позицию чанка в сетке
      chunk.position.set(
        (x - 1) * CHUNK_SIZE,
        0,
        (z - 1) * CHUNK_SIZE
      );

      const instancedBuildings = new THREE.InstancedMesh(buildingGeometry, buildingMaterial, buildingCountPerChunk);
      const dummy = new THREE.Object3D();
      for (let i = 0; i < buildingCountPerChunk; i++) {
        let bx = (Math.random() - 0.5) * (CHUNK_SIZE - CORRIDOR_WIDTH);
        if (bx >= 0) {
          bx += CORRIDOR_WIDTH / 2;
        } else {
          bx -= CORRIDOR_WIDTH / 2;
        }
        const bz = (Math.random() - 0.5) * CHUNK_SIZE;
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

      const groundGeometry = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE);
      const groundMaterial = new THREE.MeshBasicMaterial({
        map: gridTexture,
        color: 0x6a00ff,
        transparent: true,
        blending: THREE.AdditiveBlending
      });
      const ground = new THREE.Mesh(groundGeometry, groundMaterial);
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -50;
      ground.name = "city_ground_plane";
      chunk.add(ground);

      cityGroup.add(chunk);
      cityChunks.push(chunk);
    }
  }
}

function setActiveEnvironment(env: EnvironmentState) {
  if (env === EnvironmentState.SPACE) {
    if (spaceGroup) spaceGroup.visible = true;
    scene.fog = new THREE.Fog(0x000000, 10, 250);
    scene.background = new THREE.Color(0x000000);

  } else if (env === EnvironmentState.CITY) {
    const fogColor = 0x1a001a;
    scene.fog = new THREE.FogExp2(fogColor, 0.0015);
    scene.background = new THREE.Color(fogColor);

  } else if (env === EnvironmentState.SOLAR_SYSTEM) {
    scene.fog = null;
    scene.background = new THREE.Color(0x000000);
  }
}

function createCityBackground() {
  const geometry = new THREE.SphereGeometry(1000, 64, 32);

  const texture = new THREE.TextureLoader().load('assets/images/city.jpg');

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.BackSide,
    fog: false,
    color: 0x555555
  });

  const sphere = new THREE.Mesh(geometry, material);
  return sphere;
}

function createSolarSystemEnvironment() {
  solarSystemGroup = new THREE.Group();
  solarSystemGroup.visible = false;
  scene.add(solarSystemGroup);

  const textureLoader = new THREE.TextureLoader();

  const skySphereGeo = new THREE.SphereGeometry(2000, 64, 32);
  const skySphereMat = new THREE.MeshBasicMaterial({
    map: textureLoader.load('assets/images/milky_way.jpg'),
    side: THREE.BackSide,
    fog: false
  });
  const skySphere = new THREE.Mesh(skySphereGeo, skySphereMat);
  solarSystemGroup.add(skySphere);

  const planetData = [
    { texture: 'planet_earth.webp', size: 120, position: new THREE.Vector3(-800, 150, -500) },
    { texture: 'planet_mars.jpg', size: 80, position: new THREE.Vector3(950, -100, -1200) },
    { texture: 'planet_gasgiant.jpg', size: 250, position: new THREE.Vector3(-100, 300, -2000) }
  ];

  planetData.forEach(data => {
    const planetGeo = new THREE.SphereGeometry(data.size, 32, 32);
    const planetMat = new THREE.MeshStandardMaterial({
      map: textureLoader.load(`assets/images/${data.texture}`),
      roughness: 0.9,
      metalness: 0.1
    });
    const planet = new THREE.Mesh(planetGeo, planetMat);
    planet.position.copy(data.position);

    solarSystemGroup.add(planet);
    planets.push(planet);
  });
}


function updateCityChunks() {
  const _tempVec3 = new THREE.Vector3();

  cityChunks.forEach(chunk => {
    const chunkWorldPosition = chunk.getWorldPosition(_tempVec3);

    const distanceToChunkZ = camera.position.z - chunkWorldPosition.z;
    const distanceToChunkX = camera.position.x - chunkWorldPosition.x;

    if (distanceToChunkZ > CHUNK_SIZE * 1.5) {
      chunk.position.z -= NUM_CHUNKS_AXIS * CHUNK_SIZE;
    } else if (distanceToChunkZ < -CHUNK_SIZE * 1.5) {
      chunk.position.z += NUM_CHUNKS_AXIS * CHUNK_SIZE;
    }

    if (distanceToChunkX > CHUNK_SIZE * 1.5) {
      chunk.position.x -= NUM_CHUNKS_AXIS * CHUNK_SIZE;
    }
    else if (distanceToChunkX < -CHUNK_SIZE * 1.5) {
      chunk.position.x += NUM_CHUNKS_AXIS * CHUNK_SIZE;
    }
  });
}

function createWormholeMesh(isBlackHole: boolean): THREE.Mesh {
  const geometry = new THREE.TorusGeometry(12, 3, 16, 100);
  let material;

  if (isBlackHole) {
    material = new THREE.MeshBasicMaterial({
      color: 0x000000,
      wireframe: true
    });
  } else {
    material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
  }

  const wormhole = new THREE.Mesh(geometry, material);
  wormhole.layers.enable(BLOOM_SCENE);
  return wormhole;
}

function trySpawnWhiteHole() {
  const isRankHighEnough = currentRankIndex >= 4;

  if (!isSketchModeActive &&
    audioContext.currentTime > nextWormholeSpawnTime &&
    isRankHighEnough &&
    !hasSketchModeBeenTriggeredThisSong) {

    const wormholeMesh = getFromPool(wormholePool, () => createWormholeMesh(false));

    const SPAWN_TIME_AHEAD = 2.0;
    const progress = Math.min(playerProgress + (SPAWN_TIME_AHEAD / songData.duration), 1.0);

    specialEventObjects.push({
      progress: progress,
      type: 'white_hole',
      mesh: wormholeMesh,
      collected: false
    });

    nextWormholeSpawnTime = audioContext.currentTime + 20 + Math.random() * 20;
  }
}

function updateSpecialEvents() {
  for (const event of specialEventObjects) {
    if (event.collected || !event.mesh) continue;

    const frame = getInterpolatedFrame(event.progress);
    const point = frame.point.clone();
    event.mesh.position.copy(point);

    event.mesh.rotation.x += 0.05;
    event.mesh.rotation.y += 0.02;

    event.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), frame.tangent);

    if (playerProgress > event.progress + 0.01) {
      event.collected = true;
      recycleObject(event.mesh, wormholePool);
    }
  }
}

function checkSpecialCollisions() {
  for (const event of specialEventObjects) {
    if (event.collected) continue;

    if (playerProgress >= event.progress && lastPlayerProgress < event.progress) {
      event.collected = true;
      recycleObject(event.mesh, wormholePool);

      if (event.type === 'white_hole') {
        isSketchModeActive = true;
        sketchModeTimer = SKETCH_MODE_DURATION;
        sketchPass.enabled = true;

        hasSketchModeBeenTriggeredThisSong = true;

        const exitProgress = playerProgress + ((SKETCH_MODE_DURATION - 1) / songData.duration);
        const exitHoleMesh = getFromPool(wormholePool, () => createWormholeMesh(true));
        specialEventObjects.push({
          progress: exitProgress,
          type: 'black_hole',
          mesh: exitHoleMesh,
          collected: false
        });

      } else if (event.type === 'black_hole') {
        isSketchModeActive = false;
        sketchModeTimer = 0;
        sketchPass.enabled = false;
      }
    }
  }
  for (let i = specialEventObjects.length - 1; i >= 0; i--) {
    if (specialEventObjects[i].collected) {
      specialEventObjects.splice(i, 1);
    }
  }
}

function createMenuEqualizer() {
  if (equalizerGroup) {
    scene.remove(equalizerGroup);
    equalizerGroup.children.forEach((child: any) => {
      child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
  }

  equalizerGroup = new THREE.Group();

  const NUM_BARS = 20;
  const BAR_SPACING_RATIO = 0.3;
  const EQ_WIDTH_RATIO = 0.9;
  const Z_DISTANCE = 12;

  const vFOV = THREE.MathUtils.degToRad(camera.fov);
  const visibleHeight = 2 * Math.tan(vFOV / 2) * Z_DISTANCE;
  const visibleWidth = visibleHeight * camera.aspect;

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
    bar.layers.set(ENTIRE_SCENE);
    bar.layers.enable(BLOOM_SCENE);
    bar.position.x = i * (barWidth + barSpacing) - totalEqWidth / 2;
    equalizerGroup.add(bar);
  }

  scene.add(equalizerGroup);
}

function updateMenuEqualizer(time: number) {
  if (!equalizerGroup || !equalizerGroup.visible) return;

  const MAX_HEIGHT = 10;
  const wave1Speed = 2.0, wave1Length = 0.5;
  const wave2Speed = 3.5, wave2Length = 0.8;
  const wave3Speed = 1.2, wave3Length = 0.3;

  equalizerGroup.children.forEach((bar, index) => {
    const sinValue1 = Math.sin(time * wave1Speed + index * wave1Length);
    const sinValue2 = Math.sin(time * wave2Speed + index * wave2Length);
    const sinValue3 = Math.cos(time * wave3Speed + index * wave3Length);
    const mixedWave = Math.abs(sinValue1) * Math.abs(sinValue2) * Math.abs(sinValue3);
    const height = 0.1 + mixedWave * MAX_HEIGHT;
    bar.scale.y = height;
    bar.position.y = height / 2;
  });
}

async function init() {
  soundManager.loadSounds();
  startPrompt.textContent = 'Loading spaceship...';
  fileLabel.classList.add('hidden');
  fileInput.disabled = true;

  scene = new THREE.Scene();

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
  directionalLight.position.set(5, 5, 5);
  scene.add(directionalLight);

  scene.fog = new THREE.Fog(0x000000, 10, 250);
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0, 5, 20);
  camera.lookAt(0, 0, 0);
  renderer = new THREE.WebGLRenderer({canvas, antialias: true});
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(0x000000);

  try {
    player = await loadPlayerModel();
    scene.add(player);
    player.visible = false;
  } catch (error) {
    startPrompt.textContent = 'Error loading assets. Please refresh.';
    startPrompt.style.color = '#f55';
    return;
  }

  backgroundSphere = createBackgroundSphere();
  scene.add(backgroundSphere);
  backgroundSphere.visible = true;

  nebulaParticles = createNebulas();
  scene.add(nebulaParticles);

  normalStarfield = createNormalStarfield();
  scene.add(normalStarfield);

  hyperspaceStreaks = createHyperspaceStreaks();
  scene.add(hyperspaceStreaks);

  meteorShower = createMeteorShower();
  // scene.add(meteorShower);

  positiveBurst = createPositiveBurst();
  scene.add(positiveBurst);

  const renderScene = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.0, 0.4, 0.85);
  bloomPass.threshold = 0.25;
  bloomPass.strength = 1.0;
  bloomPass.radius = 0.5;

  composer = new EffectComposer(renderer);
  composer.addPass(renderScene);
  composer.addPass(bloomPass);

  bloomComposer = new EffectComposer(renderer);
  bloomComposer.renderToScreen = false;
  bloomComposer.addPass(renderScene);
  bloomComposer.addPass(bloomPass);

  const finalPass = new ShaderPass(
    new THREE.ShaderMaterial({
      uniforms: {
        baseTexture: { value: null },
        bloomTexture: { value: bloomComposer.renderTarget2.texture }
      },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
      fragmentShader: `
            uniform sampler2D baseTexture;
            uniform sampler2D bloomTexture;
            varying vec2 vUv;
            void main() {
                // Смешиваем обычную сцену и карту свечения
                gl_FragColor = ( texture2D( baseTexture, vUv ) + vec4( 1.0 ) * texture2D( bloomTexture, vUv ) );
            }`
    }), "baseTexture"
  );
  finalPass.needsSwap = true;

  composer = new EffectComposer(renderer);
  composer.addPass(renderScene);
  composer.addPass(finalPass);

  const fadeGeometry = new THREE.PlaneGeometry(2, 2);
  const fadeMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0,
    depthTest: false
  });
  fadeOutPlane = new THREE.Mesh(fadeGeometry, fadeMaterial);
  fadeOutPlane.renderOrder = 999;
  scene.add(fadeOutPlane);

  storm.lightningFlash = new THREE.PointLight(0xaaccee, 0, 0, 2);
  scene.add(storm.lightningFlash);

  storm.ambientLight = new THREE.AmbientLight(0x99aaff, 0);
  scene.add(storm.ambientLight);

  for (let i = 0; i < MAX_BOLTS_IN_POOL; i++) {
    lightningBolts.push(createLightningBolt());
  }

  ['assets/sounds/thunder1.mp3', 'assets/sounds/thunder2.mp3', 'assets/sounds/thunder3.mp3'].forEach(soundFile => {
    try {
      const audio = new Audio(soundFile);
      audio.volume = 0.2
      storm.thunderSounds.push(audio);
    } catch (e) {
      console.warn(`Could not load thunder sound: ${soundFile}`);
    }
  });

  videoScreensGroup = new THREE.Group();
  scene.add(videoScreensGroup);

  composer = new EffectComposer(renderer);
  composer.addPass(renderScene);
  composer.addPass(bloomPass);

  sketchPass = new ShaderPass(SketchShader);
  sketchPass.uniforms.resolution.value.x = window.innerWidth * window.devicePixelRatio;
  sketchPass.uniforms.resolution.value.y = window.innerHeight * window.devicePixelRatio;
  sketchPass.enabled = false;
  composer.addPass(sketchPass);

  spaceGroup = new THREE.Group();
  scene.add(spaceGroup);
  spaceGroup.add(nebulaParticles);
  spaceGroup.add(normalStarfield);

  circularFramesGroup = new THREE.Group();
  scene.add(circularFramesGroup);

  tunnelGroup = new THREE.Group();
  scene.add(tunnelGroup);

  for (let i = 0; i < FRAME_POOL_SIZE; i++) {
    framePool.push(createCircularFrameMesh());
  }
  for (let i = 0; i < TUNNEL_SEGMENT_POOL_SIZE; i++) {
    tunnelSegmentPool.push(createTunnelSegmentMesh());
  }

  cityBackgroundSphere = createCityBackground();
  cityBackgroundSphere.visible = false;
  scene.add(cityBackgroundSphere);

  window.addEventListener('resize', onWindowResize);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  canvas.addEventListener('touchstart', handleTouchStart, {passive: false});
  canvas.addEventListener('touchend', handleTouchEnd, {passive: false});
  canvas.addEventListener('touchcancel', handleTouchEnd, {passive: false});

  fileInput.addEventListener('change', onFileSelect);
  restartButton.addEventListener('click', () => location.reload());

  pauseButton.addEventListener('click', togglePause);
  resumeButton.addEventListener('click', togglePause);
  mainMenuButton.addEventListener('click', () => location.reload());

  const uiClickableElements = document.querySelectorAll('button, .file-label');

  uiClickableElements.forEach(element => {
    element.addEventListener('click', () => {
      soundManager.playSound('buttonclick');
    });

    element.addEventListener('mouseenter', () => {
      soundManager.playSound('buttonhover');
    });
  });

  searchInput.addEventListener('input', onSearchInput);

  document.addEventListener('click', (e) => {
    if (e.target !== searchInput) {
      autocompleteResults.classList.add('hidden');
    }
  });

  historyButton.addEventListener('click', showHistoryScreen);
  historyCloseButton.addEventListener('click', () => historyScreen.classList.add('hidden'));

  leaderboardButton.addEventListener('click', () => leaderboardScreen.classList.remove('hidden'));
  leaderboardCloseButton.addEventListener('click', () => leaderboardScreen.classList.add('hidden'));
  claimButton.addEventListener('click', () => claimScreen.classList.remove('hidden'));
  claimCloseButton.addEventListener('click', () => claimScreen.classList.add('hidden'));

  createCityEnvironment();
  createSolarSystemEnvironment();
  createMenuEqualizer();

  startPrompt.textContent = 'Enter a song to start your ride (VPN may be required)';
  fileLabel.classList.remove('hidden');
  fileInput.disabled = false;

  loadTotalScore();

  animate();
}

function checkAndShowTutorial(): Promise<void> {
  if (localStorage.getItem('hasPlayedBefore') === 'true') {
    return Promise.resolve();
  }

  return new Promise(resolve => {
    tutorialScreen.classList.remove('hidden');

    tutorialContinueButton.addEventListener('click', () => {
      localStorage.setItem('hasPlayedBefore', 'true');

      tutorialScreen.classList.add('hidden');

      resolve();
    }, { once: true });
  });
}

async function loadTotalScore() {
  const telegramUserId = 'user123';
  try {
    const response = await fetch(`http://localhost:3001/api/history/${telegramUserId}`);
    if (!response.ok) return;
    const data = await response.json();
    totalScoreEl.textContent = data.totalScore.toLocaleString('ru-RU');
  } catch (error) {
    console.error('Failed to load total score:', error);
  }
}

async function showHistoryScreen() {
  const telegramUserId = 'user123';

  try {
    console.log('[API] Запрашиваю историю игр...');
    const response = await fetch(`http://localhost:3001/api/history/${telegramUserId}`);
    if (!response.ok) {
      throw new Error('Не удалось загрузить историю.');
    }

    const data = await response.json();

    totalScoreEl.textContent = data.totalScore.toLocaleString('ru-RU');

    historyTableBody.innerHTML = '';

    data.history.forEach((record: any) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${record.track_name}</td>
        <td>${record.best_score.toLocaleString('ru-RU')}</td>
        <td>${record.performance_rank}</td>
      `;
      historyTableBody.appendChild(row);
    });

    historyScreen.classList.remove('hidden');

  } catch (error) {
    console.error('[API] Ошибка при получении истории:', error);
    alert('Не удалось загрузить историю. Попробуйте позже.');
  }
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key === 'ArrowLeft') keyState.left = true;
  if (event.key === 'ArrowRight') keyState.right = true;
}

function onKeyUp(event: KeyboardEvent) {
  if (event.key === 'ArrowLeft') keyState.left = false;
  if (event.key === 'ArrowRight') keyState.right = false;
}

function createBackgroundSphere() {
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

function createNebulas() {
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
    blending: THREE.AdditiveBlending
  });
  return new THREE.Points(geo, mat);
}

function createNormalStarfield(): THREE.Points {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(STAR_POSITIONS, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1.5,
    transparent: true,
    opacity: 0.7,
    fog: false,
    blending: THREE.AdditiveBlending
  });
  return new THREE.Points(geo, mat);
}


function createHyperspaceStreaks(): THREE.LineSegments {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(8000 * 2 * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    fog: false,
    blending: THREE.AdditiveBlending
  });

  const lineSegments = new THREE.LineSegments(geo, mat);
  lineSegments.visible = false;
  return lineSegments;
}

function createPositiveBurst() {
  const geo = new THREE.BufferGeometry();
  const positions = [];
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
    fog: false
  });
  const burst = new THREE.Points(geo, mat);
  burst.userData.velocities = [];
  for (let i = 0; i < numPoints; i++) {
    burst.userData.velocities.push(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(Math.random() * 20));
  }
  burst.visible = false;
  return burst;
}

function triggerPositiveBurst(position: any, color: any) {
  positiveBurst.position.copy(position);
  positiveBurst.material.color.set(color);
  positiveBurst.material.opacity = 1.0;
  positiveBurst.visible = true;
  const positions = positiveBurst.geometry.attributes.position.array;
  for (let i = 0; i < positions.length; i++) {
    positions[i] = 0;
  }
  positiveBurst.geometry.attributes.position.needsUpdate = true;
}

function createMeteorShower() {
  const geo = new THREE.BufferGeometry();
  const positions = [];
  const numPoints = 300;
  for (let i = 0; i < numPoints; i++) {
    positions.push(
      (Math.random() - 0.5) * 800,
      (Math.random() - 0.5) * 400,
      (Math.random() - 0.5) * 1000
    );
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 30,
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 0,
    map: new THREE.TextureLoader().load('https://threejs.org/examples/textures/sprites/disc.png')
  });
  const shower = new THREE.Points(geo, mat);
  shower.visible = false;
  return shower;
}

function createLightningBolt() {
  const geometry = new THREE.BufferGeometry();
  const material = new THREE.LineBasicMaterial({
    color: 0xaaccee,
    transparent: true,
    blending: THREE.AdditiveBlending,
    fog: false,
    depthTest: false,
    opacity: 1.0
  });
  const bolt = new THREE.Line(geometry, material);
  bolt.userData = {
    isActive: false,
    life: 0
  };
  bolt.visible = false;
  scene.add(bolt);
  return bolt;
}

function generateLightningGeometry(startPoint: THREE.Vector3, endPoint: THREE.Vector3) {
  let points = [startPoint.clone()];
  let currentPoint = startPoint.clone();
  const direction = endPoint.clone().sub(startPoint).normalize();
  const totalDistance = startPoint.distanceTo(endPoint);
  let distanceTraveled = 0;

  while (distanceTraveled < totalDistance) {
    const segmentLength = 20 + Math.random() * 40;
    currentPoint.add(direction.clone().multiplyScalar(segmentLength));

    const randomOffset = new THREE.Vector3(
      (Math.random() - 0.5) * 50,
      (Math.random() - 0.5) * 50,
      (Math.random() - 0.5) * 50
    );
    points.push(currentPoint.clone().add(randomOffset));
    distanceTraveled += segmentLength;
  }
  points.push(endPoint.clone());
  return new THREE.Float32BufferAttribute(new THREE.BufferGeometry().setFromPoints(points).getAttribute('position').array, 3);
}

function triggerLightning(frame: { point: THREE.Vector3, tangent: THREE.Vector3, normal: THREE.Vector3, binormal: THREE.Vector3 }) {
  if (!storm.lightningFlash || !storm.ambientLight) return;

  const { point: currentPoint, normal: trackNormal, binormal, tangent } = frame;

  const flashPosition = currentPoint.clone()
    .add(trackNormal.clone().multiplyScalar(200 + Math.random() * 250))
    .add(binormal.clone().multiplyScalar((Math.random() - 0.5) * 500));

  storm.lightningFlash.position.copy(flashPosition);

  storm.lightningFlash.intensity = 100 + Math.random() * 50;
  storm.ambientLight.intensity = 0.5 + Math.random() * 0.3;

  const boltsToCreate = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < boltsToCreate; i++) {
    const bolt = lightningBolts.find(b => !b.userData.isActive);
    if (bolt) {
      const startPoint = flashPosition.clone();
      let endPoint;

      if (Math.random() > 0.3) {
        endPoint = currentPoint.clone()
          .add(tangent.clone().multiplyScalar(100 + Math.random() * 200))
          .add(binormal.clone().multiplyScalar((Math.random() - 0.5) * 400))
          .add(trackNormal.clone().multiplyScalar(10));
      } else {
        endPoint = startPoint.clone()
          .add(trackNormal.clone().multiplyScalar((Math.random() - 0.5) * 200))
          .add(binormal.clone().multiplyScalar((Math.random() - 0.5) * 600));
      }

      bolt.geometry.setAttribute('position', generateLightningGeometry(startPoint, endPoint));
      bolt.geometry.computeBoundingSphere();
      bolt.material.opacity = 1.0;
      bolt.userData.isActive = true;
      bolt.userData.life = 0.8 + Math.random() * 0.4;
      bolt.visible = true;
    }
  }

  setTimeout(() => {
    if (storm.thunderSounds.length > 0 && storm.active) {
      const sound = storm.thunderSounds[Math.floor(Math.random() * storm.thunderSounds.length)];
      sound.play();
    }
  }, 100 + Math.random() * 200);
}

async function onFileSelect(event: Event) {
  soundManager.playSound('characterselect');
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  currentTrackName = file.name.replace(/\.[^/.]+$/, "");
  currentVideoId = `local_${file.name}_${file.size}`;

  if (equalizerGroup) {
    equalizerGroup.visible = false;
  }

  startScreen.classList.add('hidden');
  claimButton.classList.add('hidden');
  loadingScreen.classList.remove('hidden');
  loadingText.classList.add('hidden');
  analysisText.classList.remove('hidden');

  await forceGpuPrewarm();

  const cleanSearchQuery = (rawQuery: string): string => {
    return rawQuery
      // Удаляем все в скобках () и []
      .replace(/\[.*?\]/g, '')
      .replace(/\(.*?\)/g, '')
      // Удаляем типичные слова-паразиты
      .replace(/official music video|official video|lyrics|audio|hd|4k/gi, '')
      // Удаляем сайты
      .replace(/(www\.|http:\/\/|https:\/\/)[^\s]+/g, '')
      // Удаляем расширение файла
      .replace(/\.[^/.]+$/, "")
      // Удаляем номера треков (01., 02 -)
      .replace(/^\d+\s*[-.]?\s*/, '')
      // Заменяем разные тире на стандартный дефис
      .replace(/[—–_]/g, '-')
      .trim();
  };

  const searchAndPreload = (query: string) => {
    if (!query) {
      console.warn("[ПОИСК] Не удалось сформировать поисковый запрос.");
      return;
    }

    const cleanedQuery = cleanSearchQuery(query);

    console.log(`[ПОИСК] Отправляю ОЧИЩЕННЫЙ запрос на сервер: "${cleanedQuery}"`);
    fetch(`http://localhost:3001/search-video?q=${encodeURIComponent(cleanedQuery)}`)
      .then(response => {
        if (response.ok) return response.json();
        throw new Error('Клип не найден сервером.');
      })
      .then(result => {
        console.log("[ПОИСК] Успешно найден URL клипа:", result.videoUrl);
        videoUrl = result.videoUrl;
        preloadVideoScreens();
      })
      .catch(error => console.warn(error.message));
  };

  jsmediatags.read(file, {
    onSuccess: (tag: any) => {
      const tags = tag.tags;
      let rawQuery = '';

      if (tags.artist && tags.title) {
        rawQuery = `${tags.artist} - ${tags.title}`;
      } else {
        rawQuery = file.name;
      }
      searchAndPreload(rawQuery);
    },
    onError: (error: any) => {
      console.warn(`[ПОИСК] Ошибка чтения тегов. Использую имя файла.`);
      searchAndPreload(file.name);
    }
  });

  async function analyzeAndPlayAudio(audioFile: File) {
    try {
      const arrayBuffer = await audioFile.arrayBuffer();
      await analyzeAudioAndGenerateTrack(arrayBuffer.slice(0));
      analysisText.classList.add('hidden');
      loadingText.classList.remove('hidden');
      setupAndPlayAudio(arrayBuffer);
    } catch (error) {
      console.error("Критическая ошибка при обработке файла:", error);
      alert("Sorry, there was an error processing that audio file. Please try a different one.");
      location.reload();
    }
  }

  analyzeAndPlayAudio(file);
}

let searchTimeout: number;
function onSearchInput() {
  clearTimeout(searchTimeout);
  const query = searchInput.value;

  if (query.length < 3) {
    autocompleteResults.classList.add('hidden');
    return;
  }

  searchTimeout = window.setTimeout(async () => {
    try {
      const response = await fetch(`http://localhost:3001/autocomplete?q=${encodeURIComponent(query)}`);
      if (!response.ok) return;

      const songs = await response.json();
      autocompleteResults.innerHTML = '';

      songs.forEach((song: { title: string, videoId: string }) => {
        const resultItem = document.createElement('div');
        resultItem.className = 'result-item';
        resultItem.textContent = song.title;
        resultItem.title = song.title;
        resultItem.addEventListener('click', () => onSongSelectFromSearch(song));
        autocompleteResults.appendChild(resultItem);
      });

      autocompleteResults.classList.remove('hidden');
    } catch (error) {
      console.error("Autocomplete error:", error);
    }
  }, 300);
}

async function onSongSelectFromSearch(song: { title: string, videoId: string }) {
  currentTrackName = song.title;
  currentVideoId = song.videoId;
  soundManager.playSound('characterselect');
  autocompleteResults.classList.add('hidden');
  searchInput.value = '';

  if (equalizerGroup) {
    equalizerGroup.visible = false;
  }

  startScreen.classList.add('hidden');
  claimButton.classList.add('hidden');
  loadingScreen.classList.remove('hidden');
  analysisText.textContent = `Downloading: ${song.title}`;
  analysisText.classList.remove('hidden');
  loadingText.classList.add('hidden');

  try {
    await forceGpuPrewarm();
    videoUrl = `https://www.youtube.com/watch?v=${song.videoId}`;
    console.log(`[Frontend] Устанавливаю URL для видео-экранов: ${videoUrl}`);
    preloadVideoScreens();

    console.log(`[Frontend] Запрашиваю полное аудио для videoId: ${song.videoId}`);
    const response = await fetch(`http://localhost:3001/get-audio?videoId=${song.videoId}`);

    if (!response.ok) {
      throw new Error(`Server error while fetching audio: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();

    analysisText.textContent = 'Analyzing your ride...';
    await analyzeAudioAndGenerateTrack(arrayBuffer.slice(0));

    analysisText.classList.add('hidden');
    loadingText.classList.remove('hidden');
    setupAndPlayAudio(arrayBuffer);

  } catch (error) {
    console.error("Критическая ошибка при обработке выбранной песни:", error);
    alert("Sorry, there was an error loading that song. Please try a different one or a local file.");
    location.reload();
  }
}

function smoothArray(data: number[], windowSize: number): number[] {
  const smoothed = [];
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

function updateEnvironmentElements() {
  const activationZone = playerProgress + BLOCK_VIEW_DISTANCE;
  const deactivationZone = playerProgress - 0.02;

  for (const frameObj of circularFrames) {
    if (!frameObj.mesh && frameObj.progress > playerProgress && frameObj.progress < activationZone) {
      const frameMesh = getFromPool(framePool, createCircularFrameMesh);
      if (frameMesh) {
        frameObj.mesh = frameMesh;
        circularFramesGroup.add(frameObj.mesh);
      }
    }
    if (frameObj.mesh && frameObj.progress < deactivationZone) {
      recycleObject(frameObj.mesh, framePool);
      frameObj.mesh = null;
    }
    if (frameObj.mesh) {
      const frame = getInterpolatedFrame(frameObj.progress);
      frameObj.mesh.position.copy(frame.point);
      frameObj.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), frame.tangent);
      const material = frameObj.mesh.material as THREE.MeshStandardMaterial;
      material.color.copy(currentColor);
      material.emissive.copy(currentColor);
    }
  }

  for (const tunnelMesh of tunnelGroup.children) {
    const material = (tunnelMesh as THREE.Mesh).material as THREE.MeshBasicMaterial;
    material.color.copy(currentColor);
  }
}

async function analyzeAudioAndGenerateTrack(arrayBuffer: ArrayBuffer) {
  const audioCtx = new (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext)(1, arrayBuffer.byteLength, 44100);
  const buffer = await audioCtx.decodeAudioData(arrayBuffer);
  const pcmData = buffer.getChannelData(0);
  const duration = buffer.duration;
  const numChunks = Math.floor(pcmData.length / ANALYSIS_CHUNK_SAMPLES);
  const energyMap = [];
  let maxRms = 0;

  for (let i = 0; i < numChunks; i++) {
    let sumOfSquares = 0;
    for (let j = 0; j < ANALYSIS_CHUNK_SAMPLES; j++) {
      const sample = pcmData[i * ANALYSIS_CHUNK_SAMPLES + j];
      sumOfSquares += sample * sample;
    }
    const rms = Math.sqrt(sumOfSquares / ANALYSIS_CHUNK_SAMPLES);
    if (rms > maxRms) maxRms = rms;
    energyMap.push(rms);
  }

  if (maxRms === 0) maxRms = 1;
  const normalizedEnergyMap = energyMap.map(rms => (rms / maxRms));
  const smoothedEnergyMap = smoothArray(normalizedEnergyMap, 3);
  songData = {duration, energyMap: smoothedEnergyMap};

  trackCurve = createTrackPath(smoothedEnergyMap, duration);
  const trackSegments = Math.floor(duration * 30);
  trackFrames = generateTrackFrames(trackCurve, smoothedEnergyMap, trackSegments);

  pregenerateBlocks(smoothedEnergyMap);
  pregenerateEnvironmentElements(smoothedEnergyMap, duration);

  if (trackGroup) scene.remove(trackGroup);
  trackGroup = createTrackMesh(trackFrames);
  scene.add(trackGroup);
  generateTunnels();
}

function generateTrackFrames(curve: THREE.CatmullRomCurve3, energyMap: number[], segments: number) {
  const frames = [];
  let lastUp = new THREE.Vector3(0, 1, 0);
  const INTENSE_ROLL_THRESHOLD = 0.82;
  const HILL_FREQUENCY = 0.4;
  const HILL_AMPLITUDE = 2.5;

  for (let i = 0; i <= segments; i++) {
    const progress = i / segments;
    const point = curve.getPointAt(progress);
    const tangent = curve.getTangentAt(progress).normalize();

    const energyIndex = Math.min(Math.floor(progress * energyMap.length), energyMap.length - 1);
    const energy = energyMap[energyIndex] || 0;

    const preRollNormal = lastUp.clone();
    preRollNormal.projectOnPlane(tangent).normalize();

    const hillOffset = Math.sin(i * HILL_FREQUENCY) * energy * HILL_AMPLITUDE;
    point.add(preRollNormal.clone().multiplyScalar(hillOffset));

    const turnInfluence = Math.sin(progress * energyMap.length * 0.08);

    let rollDelta = 0;
    if (energy > INTENSE_ROLL_THRESHOLD) {
      const rollIntensity = (energy - INTENSE_ROLL_THRESHOLD) / (1.0 - INTENSE_ROLL_THRESHOLD);
      rollDelta = turnInfluence * rollIntensity * -1.5;
    }

    const normal = lastUp.clone();
    normal.projectOnPlane(tangent).normalize();
    normal.applyAxisAngle(tangent, rollDelta);

    const binormal = new THREE.Vector3().crossVectors(tangent, normal);

    frames.push({point, tangent, normal, binormal});
    lastUp = normal;
  }
  return frames;
}

function createTrackPath(energyMap: number[], duration: number): THREE.CatmullRomCurve3 {
  const points: THREE.Vector3[] = [];
  let pos = new THREE.Vector3(0, 0, 0);
  let vel = new THREE.Vector3(0, 0, 0);
  points.push(pos.clone());

  const baseSegmentLengthPerSecond = 110;

  const PATH_SCALE = 0.55;

  const turnInfluence = 4.0;
  const climbInfluence = 3.5;
  const damping = 0.96;
  const centeringForce = 0.003;

  const timePerSegment = duration / energyMap.length;

  for (let i = 0; i < energyMap.length; i++) {
    const energy = energyMap[i];

    const speedMultiplier = 0.5 + energy * 2.5;
    const segmentLength = baseSegmentLengthPerSecond * timePerSegment * speedMultiplier;

    const effectMultiplier = Math.max(0, (energy - 0.3) / 0.6);

    const turnForce = Math.sin(i * 0.15) * energy * turnInfluence * effectMultiplier * PATH_SCALE;
    const climbForce = (energy - 0.2) * climbInfluence * effectMultiplier * PATH_SCALE;

    const centerPullX = -pos.x * centeringForce;
    const centerPullY = -pos.y * centeringForce;

    vel.x += turnForce + centerPullX;
    vel.y += climbForce + centerPullY;
    vel.multiplyScalar(damping);

    pos.x += vel.x * PATH_SCALE;
    pos.y += vel.y * PATH_SCALE;

    pos.z -= segmentLength;

    points.push(pos.clone());
  }

  return new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
}

function createTrackMesh(frames: any[]) {
  const group = new THREE.Group();
  const segments = frames.length - 1;
  const roadWidth = NUM_LANES * LANE_WIDTH;

  const leftRailPoints: THREE.Vector3[] = [];
  const rightRailPoints: THREE.Vector3[] = [];
  const leftLinePoints: THREE.Vector3[] = [];
  const rightLinePoints: THREE.Vector3[] = [];

  for (let i = 0; i < frames.length; i++) {
    const {point, binormal} = frames[i];

    const leftRailOffset = binormal.clone().multiplyScalar(-roadWidth / 2 - 0.2);
    const rightRailOffset = binormal.clone().multiplyScalar(roadWidth / 2 + 0.2);
    const leftLineOffset = binormal.clone().multiplyScalar(-LANE_WIDTH / 2);
    const rightLineOffset = binormal.clone().multiplyScalar(LANE_WIDTH / 2);

    leftRailPoints.push(point.clone().add(leftRailOffset));
    rightRailPoints.push(point.clone().add(rightRailOffset));
    leftLinePoints.push(point.clone().add(leftLineOffset));
    rightLinePoints.push(point.clone().add(rightLineOffset));
  }

  const railMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(RailEqualizerMaterial.uniforms),
    vertexShader: RailEqualizerMaterial.vertexShader,
    fragmentShader: RailEqualizerMaterial.fragmentShader,
    side: THREE.DoubleSide
  });
  const lineMat = new THREE.MeshBasicMaterial({color: 0xffffff, side: THREE.DoubleSide});

  const leftRail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(leftRailPoints), segments, 0.2, 8, false), railMat.clone());
  leftRail.name = 'leftRail';
  leftRail.userData.originalVertices = leftRail.geometry.attributes.position.clone();
  leftRail.userData.isDeformed = false;
  leftRail.layers.enable(BLOOM_SCENE)
  group.add(leftRail);

  const rightRail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rightRailPoints), segments, 0.2, 8, false), railMat.clone());
  rightRail.name = 'rightRail';
  rightRail.userData.originalVertices = rightRail.geometry.attributes.position.clone();
  rightRail.userData.isDeformed = false;
  group.add(rightRail);

  group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(leftRailPoints), segments, 0.2, 8, false), railMat.clone()));
  group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rightRailPoints), segments, 0.2, 8, false), railMat.clone()));
  group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(leftLinePoints), segments, 0.05, 8, false), lineMat.clone()));
  group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rightLinePoints), segments, 0.05, 8, false), lineMat.clone()));

  const roadGeo = new THREE.BufferGeometry();
  const vertices: number[] = [];
  for (let i = 0; i < segments; i++) {
    const p1 = frames[i].point;
    const b1 = frames[i].binormal;
    const p2 = frames[i + 1].point;
    const b2 = frames[i + 1].binormal;
    const v1 = p1.clone().add(b1.clone().multiplyScalar(-roadWidth / 2));
    const v2 = p1.clone().add(b1.clone().multiplyScalar(roadWidth / 2));
    const v3 = p2.clone().add(b2.clone().multiplyScalar(roadWidth / 2));
    const v4 = p2.clone().add(b2.clone().multiplyScalar(-roadWidth / 2));
    vertices.push(v1.x, v1.y, v1.z, v4.x, v4.y, v4.z, v2.x, v2.y, v2.z, v2.x, v2.y, v2.z, v4.x, v4.y, v4.z, v3.x, v3.y, v3.z);
  }
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  roadGeo.computeVertexNormals();

  const roadMat = new THREE.MeshStandardMaterial({
    side: THREE.DoubleSide, transparent: true, opacity: 0.95, metalness: 0.2, roughness: 0.8, color: 0x000000, fog: false
  });
  group.add(new THREE.Mesh(roadGeo, roadMat));

  return group;
}

function updateRailEqualizer(rail: THREE.Mesh, frequencyData: Uint8Array) {
  if (!rail || !rail.userData.originalVertices) return;

  const originalPositions = rail.userData.originalVertices;
  const currentPositions = rail.geometry.attributes.position;
  const normals = rail.geometry.attributes.normal;
  const vertexCount = originalPositions.count;

  const BASS_INFLUENCE = 1.4;  // Насколько сильно бас "надувает" волны
  const MID_WAVE_SPEED = 0.5;  // Как часто идут волны
  const TREBLE_FLICKER = 0.1;  // Сила электрического мерцания

  const bassValue = (frequencyData[2] + frequencyData[3] + frequencyData[4]) / 3 / 255.0;
  const midValue = frequencyData[Math.floor(frequencyData.length / 2)] / 255.0;
  const trebleValue = frequencyData[frequencyData.length - 20] / 255.0;

  for (let i = 0; i < vertexCount; i++) {
    const oz = originalPositions.getZ(i);

    const wave = Math.sin(oz * midValue * MID_WAVE_SPEED + audioContext.currentTime * 5);

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
      oz_pos + nz * displacement
    );
  }

  currentPositions.needsUpdate = true;
  rail.userData.isDeformed = true;
}

function setupAndPlayAudio(arrayBuffer: ArrayBuffer) {
  if (audioContext) audioContext.close();
  audioContext = new AudioContext();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  frequencyData = new Uint8Array(analyser.frequencyBinCount);

  audioContext.decodeAudioData(arrayBuffer, async (buffer) => {
    source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(analyser);
    analyser.connect(audioContext.destination);
    await checkAndShowTutorial();
    source.start(0);
    source.onended = endGame;
    if (fadeOutPlane) {
      (fadeOutPlane.material as THREE.MeshBasicMaterial).opacity = 0;
    }
    if (player) player.visible = true;

    loadingScreen.classList.add('hidden');
    gameHud.classList.remove('hidden');
    maxCombo = 0;
    totalMisses = 0;
    rankHistory.length = 0;
    score = 0;
    consecutiveHits = 0;
    currentRankIndex = -1;
    previousRankIndex = -1;
    updateStyleUI();
    playerProgress = 0;
    lastPlayerProgress = 0;
    lerpedEnergy = 0;
    lastHyperspaceTriggerTime = -Infinity;
    hyperspaceJumpCount = 0;
    timeInRedZone = 0;
    currentColor.set(0x00bfff);
    scoreEl.textContent = '0';
    gameStarted = true;
    isPaused = false;
    backgroundSphere.visible = false;
    hasSketchModeBeenTriggeredThisSong = false;
    nextWormholeSpawnTime = 20 + Math.random() * 20;
  }, (error) => {
    console.error("Error decoding audio data:", error);
    location.reload();
  });
}

function getFromPool(pool: any[], factory: Function) {
  let obj = pool.length > 0 ? pool.pop() : factory();
  obj.visible = true;
  scene.add(obj);
  return obj;
}

function recycleToPool(block: any) {
  if (block.mesh) {
    const pool = block.type === 'color' ? colorBlockPool : greyBlockPool;
    recycleObject(block.mesh, pool);
    block.mesh = null;
  }
}

function recycleObject(mesh: THREE.Object3D, pool: any[]) {
  if (!mesh) return;

  mesh.visible = false;
  if (mesh.parent) {
    mesh.parent.remove(mesh);
  }
  pool.push(mesh);
}

function createColorBlock() {
  const blockWidth = 1.5;
  const geometry = new RoundedBoxGeometry(blockWidth, blockWidth, blockWidth * 2, 6, 0.5);
  const material = new THREE.MeshBasicMaterial({ fog: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.layers.enable(BLOOM_SCENE);
  return mesh;
}

function createGreyBlock() {
  const blockWidth = 1.5;
  const geometry = new RoundedBoxGeometry(blockWidth, blockWidth * 2, blockWidth * 2, 6, 0.5);
  const material = new THREE.MeshStandardMaterial({
    color: 0x959595,
    // roughness: 0.8,
    metalness: 0.1,
    fog: false
  });

  const mesh = new THREE.Mesh(geometry, material);

  return mesh;
}

const MIN_BLOCK_SPEED_FACTOR = -0.1;
const MAX_BLOCK_SPEED_FACTOR = 0.8;

function updateBlockMovement(deltaTime: number, currentEnergy: number) {
  const playerProgressPerSecond = 1.0 / songData.duration;

  const playerProgressThisFrame = playerProgressPerSecond * deltaTime;

  const blockSpeedFactor = THREE.MathUtils.lerp(MAX_BLOCK_SPEED_FACTOR, MIN_BLOCK_SPEED_FACTOR, currentEnergy);

  const blockProgressThisFrame = playerProgressThisFrame * blockSpeedFactor;

  for (const block of allBlocks) {
    if (!block.collected) {
      block.progress += blockProgressThisFrame;
    }
  }
}

function pregenerateBlocks(energyMap: number[]) {
  allBlocks.length = 0;
  let lastLane = 1;
  let consecutiveObstacles = 0;

  const BLOCK_SPAWN_TIME_AHEAD = 0.5;
  let lastBlockProgress = -1;

  for (let i = 0; i < energyMap.length; i++) {
    const energy = energyMap[i];

    const spawnChance = energy * 0.5;
    if (Math.random() > spawnChance) {
      continue;
    }

    const timeAtThisEnergyStep = i * (songData.duration / energyMap.length);
    const progress = (timeAtThisEnergyStep + BLOCK_SPAWN_TIME_AHEAD) / songData.duration;

    if (progress >= 1.0) continue;

    const isObstacleRun = energy > 0.6 && Math.random() < (energy - 0.6) * 0.7 && consecutiveObstacles < 2;
    const isMultiBlock = energy > 0.4 && Math.random() < (energy - 0.4);

    if (isObstacleRun) {
      const openLane = Math.floor(Math.random() * NUM_LANES);
      for (let lane = 0; lane < NUM_LANES; lane++) {
        if (lane !== openLane) {
          allBlocks.push({ progress, lane, type: 'grey', mesh: null, collected: false });
        }
      }
      consecutiveObstacles++;
      lastBlockProgress = progress;

    } else if (isMultiBlock) {
      const numBlocksToSpawn = Math.random() < 0.5 ? 1 : 2;

      const availableLanes = [0, 1, 2];

      for (let i = availableLanes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [availableLanes[i], availableLanes[j]] = [availableLanes[j], availableLanes[i]];
      }

      for (let i = 0; i < numBlocksToSpawn; i++) {
        const lane = availableLanes[i];
        allBlocks.push({ progress, lane, type: 'color', mesh: null, collected: false });
      }

      consecutiveObstacles = 0;
      lastBlockProgress = progress;

    } else {
      let lane;
      const laneChoice = Math.random();
      if (laneChoice < 0.6) lane = lastLane;
      else if (laneChoice < 0.8) lane = (lastLane + 1) % NUM_LANES;
      else lane = (lastLane + NUM_LANES - 1) % NUM_LANES;

      allBlocks.push({ progress, lane, type: 'color', mesh: null, collected: false });
      lastLane = lane;
      consecutiveObstacles = 0;
      lastBlockProgress = progress;
    }
  }
}

function getInterpolatedFrame(progress: number, targetFrame = _reusableFrame) {
  const totalFrames = trackFrames.length - 1;
  const idx = progress * totalFrames;
  const i1 = Math.floor(idx);
  const i2 = Math.min(i1 + 1, totalFrames);
  const t = idx - i1;

  if (i1 >= trackFrames.length || i2 >= trackFrames.length) {
    const lastFrame = trackFrames[totalFrames];
    targetFrame.point.copy(lastFrame.point);
    targetFrame.tangent.copy(lastFrame.tangent);
    targetFrame.normal.copy(lastFrame.normal);
    targetFrame.binormal.copy(lastFrame.binormal);
    return targetFrame;
  }
  if (i1 === i2) {
    const frame = trackFrames[i1];
    targetFrame.point.copy(frame.point);
    targetFrame.tangent.copy(frame.tangent);
    targetFrame.normal.copy(frame.normal);
    targetFrame.binormal.copy(frame.binormal);
    return targetFrame;
  }

  const frame1 = trackFrames[i1];
  const frame2 = trackFrames[i2];

  targetFrame.point.lerpVectors(frame1.point, frame2.point, t);
  targetFrame.tangent.lerpVectors(frame1.tangent, frame2.tangent, t).normalize();
  targetFrame.normal.lerpVectors(frame1.normal, frame2.normal, t).normalize();
  targetFrame.binormal.lerpVectors(frame1.binormal, frame2.binormal, t).normalize();


  targetFrame.normal.projectOnPlane(targetFrame.tangent).normalize();
  targetFrame.binormal.crossVectors(targetFrame.tangent, targetFrame.normal);

  return targetFrame;
}

function updateBlocks() {
  const activationZone = playerProgress + BLOCK_VIEW_DISTANCE;
  const deactivationZone = playerProgress - 0.02;

  const rotationMatrix = new THREE.Matrix4();

  for (const block of allBlocks) {
    if (block.collected) continue;
    if (!block.mesh && block.progress > playerProgress && block.progress < activationZone) {
      block.mesh = getFromPool(block.type === 'color' ? colorBlockPool : greyBlockPool, block.type === 'color' ? createColorBlock : createGreyBlock);
    }
    if (block.mesh && block.progress < deactivationZone) {
      recycleToPool(block);
    }
    if (!block.mesh) continue;

    const frame = getInterpolatedFrame(block.progress);
    const point = _reusableVector1.copy(frame.point);

    const horizontalOffset = _reusableVector2.copy(frame.binormal).multiplyScalar(LANE_POSITIONS[block.lane]);
    const verticalOffset = _reusableVector3.copy(frame.normal).multiplyScalar(0.8);
    point.add(horizontalOffset).add(verticalOffset);

    block.mesh.position.copy(point);

    rotationMatrix.makeBasis(frame.tangent, frame.normal, frame.binormal);

    block.mesh.quaternion.setFromRotationMatrix(rotationMatrix);
  }
}

function checkCollisions() {
  for (const block of allBlocks) {
    if (block.mesh && !block.collected && Math.round(actualPlayerLane) === block.lane) {
      if (lastPlayerProgress < block.progress && playerProgress >= block.progress) {
        if (block.type === 'color') {
          soundManager.playSound('collision_color');
          consecutiveHits++;

          let newRankIndex = -1;
          for (let i = STYLE_RANKS.length - 1; i >= 0; i--) {
            if (consecutiveHits >= STYLE_RANKS[i].hitsNeeded) {
              newRankIndex = i;
              break;
            }
          }
          currentRankIndex = newRankIndex;

          const baseMultiplier = currentRankIndex > -1 ? STYLE_RANKS[currentRankIndex].multiplier : 1;
          const finalMultiplier = isSketchModeActive ? 10 : baseMultiplier;
          score += 10 * finalMultiplier;
          triggerPositiveBurst(block.mesh.position, block.mesh.material.color);

        } else {
          if (!isSketchModeActive) {
            if (consecutiveHits > maxCombo) {
              maxCombo = consecutiveHits;
            }
            totalMisses++;
            soundManager.playSound('collision_stone');
            consecutiveHits = 0;
            score = Math.max(0, score - 25);

            // Логика понижения ранга
            if (currentRankIndex >= 4) { // Если ранг S, SS или SSS
              currentRankIndex = 2; // Падаем до B (индекс 2)
            } else if (currentRankIndex > 0) { // Если C, B, A
              currentRankIndex -= 2; // Падаем на 2 ранга
            } else { // Если D или нет ранга
              currentRankIndex = -1; // Полный сброс
            }

            shakeTime = 0.4;
            shakeIntensity = 0.3;
            vignette.style.opacity = '1';
            setTimeout(() => { vignette.style.opacity = '0'; }, 100);
          }
        }

        scoreEl.textContent = score.toString();
        updateStyleUI();

        block.collected = true;
        recycleToPool(block);
      }
    }
  }
}

function updateStyleUI() {
  if (currentRankIndex > -1) {
    rankHistory.push(currentRankIndex);
  }

  if (isSketchModeActive) {
    scoreMultiplierEl.textContent = '(x10)';

    styleRankContainer.classList.add('hidden');

    if (isARankEffectActive) {
      isARankEffectActive = false;
      updateVideoScreensVisibility(false);
    }
    if (storm.active) {
      storm.active = false;
      if (storm.lightningFlash) storm.lightningFlash.intensity = 0;
    }

    gameHud.classList.remove('style-rank-blue', 'style-rank-gold');

    return;
  }

  const rankChanged = currentRankIndex !== previousRankIndex;

  if (rankChanged && currentRankIndex > previousRankIndex) {
    if (currentRankIndex <= 1) {
      soundManager.playSound('matchsmall');
    } else if (currentRankIndex <= 3) {
      soundManager.playSound('matchlarge');
    } else {
      soundManager.playSound('matchhuge');
    }
  }

  const isARankNow = currentRankIndex >= 3;

  if (isARankNow && !isARankEffectActive) {
    isARankEffectActive = true;
    if (videoScreensGroup.children.length === 0 && videoUrl) {
      setupAndPositionVideoScreens();
    }
    updateVideoScreensVisibility(true);

  } else if (!isARankNow && isARankEffectActive) {
    isARankEffectActive = false;
    updateVideoScreensVisibility(false);
  }

  const isStormActiveNow = currentRankIndex >= 4;

  if (isStormActiveNow && !storm.active) {
    storm.active = true;
    storm.lastFlashTime = audioContext.currentTime;
    storm.nextFlashDelay = 1 + Math.random() * 2;
  } else if (!isStormActiveNow && storm.active) {
    storm.active = false;
    if (storm.lightningFlash) storm.lightningFlash.intensity = 0;
  }

  if (currentRankIndex === -1) {
    styleRankContainer.classList.add('hidden');
    scoreMultiplierEl.textContent = '(x1)';
    styleRankContainer.classList.remove('style-rank-blue', 'style-rank-gold');
    previousRankIndex = currentRankIndex;
    return;
  }

  styleRankContainer.classList.remove('hidden');

  let newClass = null;
  if (currentRankIndex > -1) {
    newClass = currentRankIndex < 4 ? 'style-rank-blue' : 'style-rank-gold';
  }

  [styleRankContainer, gameHud].forEach(el => {
    el.classList.remove('style-rank-blue', 'style-rank-gold');
    if (newClass) {
      el.classList.add(newClass);
    }
  });

  const currentRank = STYLE_RANKS[currentRankIndex];
  scoreMultiplierEl.textContent = `(x${currentRank.multiplier})`;
  rankImage.src = currentRank.image;

  if (rankChanged) {
    rankImage.classList.remove('rank-stamp-animation');
    setTimeout(() => {
      rankImage.classList.add('rank-stamp-animation');
    }, 10);
  }

  const isMaxRank = currentRankIndex === STYLE_RANKS.length - 1;
  if (isMaxRank) {
    progressBarFill.style.width = '100%';
  } else {
    const hitsForPrevRank = currentRankIndex === 0 ? 0 : STYLE_RANKS[currentRankIndex - 1].hitsNeeded;
    const hitsForNextRank = STYLE_RANKS[currentRankIndex + 1].hitsNeeded;

    const progress = (consecutiveHits - currentRank.hitsNeeded) / (hitsForNextRank - currentRank.hitsNeeded);
    progressBarFill.style.width = `${Math.min(progress, 1) * 100}%`;
  }

  previousRankIndex = currentRankIndex;
}

function getTargetColor(energy: number): THREE.Color {
  const calmLow = new THREE.Color(0x00bfff);      // blue: DeepSkyBlue
  const calmHigh = new THREE.Color(0x20c20e);     // green
  const mediumLow = new THREE.Color(0xffff00);    // yellow
  const mediumHigh = new THREE.Color(0xff4500);   // orange-red
  const intenseLow = new THREE.Color(0xff4500);   // orange-red
  const intenseHigh = new THREE.Color(0xdc143c);  // crimson

  const calmThreshold = 0.3;
  const mediumThreshold = 0.7;

  let targetColor = new THREE.Color();

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

function updateSceneColors(targetColor: THREE.Color) {
  currentColor.lerp(targetColor, 0.08);

  (composer.passes[1] as UnrealBloomPass).strength = 0.6 + lerpedEnergy * 1.2;

  if (trackGroup) {
    trackGroup.children.forEach((child: any) => {
      // ВАЖНО: Мы должны менять цвет ТОЛЬКО у рельсов, которые являются TubeGeometry.
      // Дорожное полотно имеет другой тип геометрии и этот блок его проигнорирует.
      if (child.geometry.type === 'TubeGeometry') {
        if (!child.material) return;

        // Так как все рельсы теперь используют наш кастомный шейдер,
        // мы обновляем их uniform-переменную 'emissive', которая отвечает за цвет.
        if (child.material.isShaderMaterial) {
          child.material.uniforms.emissive.value.copy(currentColor);
        }
        // Этот блок на случай, если остался какой-то старый материал рельсов
        else if (child.material.emissive) {
          child.material.emissive.copy(currentColor);
          child.material.color.copy(currentColor);
        }
      }
    });
  }
}

const clock = new THREE.Clock();

function animate() {
  animationFrameId = requestAnimationFrame(animate);
  const deltaTime = clock.getDelta();
  const time = clock.getElapsedTime();

  if (gameStarted && !isPaused && trackCurve && songData && trackFrames.length > 0) {
    lastPlayerProgress = playerProgress;
    playerProgress = Math.min(audioContext.currentTime / songData.duration, 1.0);

    const energyIndex = Math.min(Math.floor(playerProgress * songData.energyMap.length), songData.energyMap.length - 1);
    const currentEnergy = songData.energyMap[energyIndex] || 0;

    lerpedEnergy = THREE.MathUtils.lerp(lerpedEnergy, currentEnergy, 0.05);

    updateBlockMovement(deltaTime, currentEnergy);

    analyser.getByteFrequencyData(frequencyData);
    const bass = (frequencyData[1] + frequencyData[2]) / 2 / 255;

    const currentFrame = getInterpolatedFrame(playerProgress, _reusableFrame);
    const { point: currentPoint, tangent, normal: trackNormal, binormal } = currentFrame;

    if (keyState.left) {
      targetPlayerLane = 0;
    } else if (keyState.right) {
      targetPlayerLane = 2;
    } else {
      targetPlayerLane = 1;
    }
    actualPlayerLane = THREE.MathUtils.lerp(actualPlayerLane, targetPlayerLane, 0.35);
    const horizontalOffset = _reusableVector1.copy(binormal).multiplyScalar(THREE.MathUtils.lerp(LANE_POSITIONS[0], LANE_POSITIONS[2], actualPlayerLane / 2));
    const SHIP_HOVER_HEIGHT = 1.2;
    const verticalOffset = _reusableVector2.copy(trackNormal).multiplyScalar(SHIP_HOVER_HEIGHT);
    player.position.copy(currentPoint).add(horizontalOffset).add(verticalOffset);

    const lookAheadProgress = 0.003;
    const futureProgress = Math.min(playerProgress + lookAheadProgress, 1.0);
    const futureFrame = getInterpolatedFrame(futureProgress, { point: _reusableVector3, tangent: _reusableVector4, normal: _reusableVector2, binormal: _reusableVector1 });

    const futureHorizontalOffset = futureFrame.binormal.clone().multiplyScalar(THREE.MathUtils.lerp(LANE_POSITIONS[0], LANE_POSITIONS[2], actualPlayerLane / 2));
    const futureVerticalOffset = futureFrame.normal.clone().multiplyScalar(SHIP_HOVER_HEIGHT);
    const lookAtTargetPoint = _reusableVector3.copy(futureFrame.point).add(futureHorizontalOffset).add(futureVerticalOffset);
    player.up.copy(trackNormal);
    player.lookAt(lookAtTargetPoint);
    player.rotateY(Math.PI);

    // --- Camera Logic ---
    const CAM_HEIGHT = 6.0;
    const CAM_DISTANCE_BEHIND = 10.0;
    const cameraVerticalOffset = _reusableVector1.copy(trackNormal).multiplyScalar(CAM_HEIGHT);
    const cameraBehindOffset = _reusableVector2.copy(tangent).multiplyScalar(-CAM_DISTANCE_BEHIND);
    const idealCameraPos = _reusableVector3.copy(currentPoint).add(cameraVerticalOffset).add(cameraBehindOffset);
    camera.position.lerp(idealCameraPos, 1.0);
    camera.up.copy(trackNormal);
    const LOOK_AHEAD_DISTANCE = 40.0;
    const cameraLookAtTarget = _reusableVector4.copy(currentPoint).add(_reusableVector1.copy(tangent).multiplyScalar(LOOK_AHEAD_DISTANCE));
    camera.lookAt(cameraLookAtTarget);

    // --- Effects and Visuals ---
    if (storm.active && storm.lightningFlash && storm.ambientLight) {
      storm.lightningFlash.intensity = Math.max(0, storm.lightningFlash.intensity - 250 * deltaTime);
      storm.ambientLight.intensity = Math.max(0, storm.ambientLight.intensity - 2.0 * deltaTime);

      lightningBolts.forEach(bolt => {
        if (bolt.userData.isActive) {
          bolt.userData.life -= deltaTime;
          bolt.material.opacity = Math.max(0, bolt.userData.life * 2);
          if (bolt.userData.life <= 0) {
            bolt.userData.isActive = false;
            bolt.visible = false;
          }
        }
      });

      const currentTime = audioContext.currentTime;
      if (currentTime > storm.lastFlashTime + storm.nextFlashDelay) {
        triggerLightning(currentFrame);
        storm.lastFlashTime = currentTime;
        storm.nextFlashDelay = 0.1 + Math.random() * 0.4;
      }
    }

    const isSssRank = currentRankIndex === STYLE_RANKS.length - 1;
    // const targetBackgroundColor = isSssRank ? SSS_SKY_COLOR : new THREE.Color(0x000000);

    // if (!(scene.background instanceof THREE.Color)) {
    //   scene.background = new THREE.Color(0x000000);
    // }
    // (scene.background as THREE.Color).lerp(targetBackgroundColor, 0.05);

    // scene.fog.color.copy(scene.background as THREE.Color);

    if (backgroundSphere && (backgroundSphere.material as THREE.MeshStandardMaterial).emissive) {
      backgroundSphere.position.copy(camera.position);

      (backgroundSphere.material as THREE.MeshStandardMaterial).emissive.copy(currentColor);

      const gridIntensity = isSssRank ? 1.0 : 0.2 + bass * 1.5;
      (backgroundSphere.material as THREE.MeshStandardMaterial).emissiveIntensity = gridIntensity;
    }
    if (scene.fog) {
      scene.fog.color.copy(currentSkyColor);
    }

    if (trackGroup) {
      const leftRail = trackGroup.getObjectByName('leftRail') as THREE.Mesh;
      const rightRail = trackGroup.getObjectByName('rightRail') as THREE.Mesh;

      if (storm.active && !sketchPass.enabled) {
        const bassValue = (frequencyData[2] + frequencyData[3] + frequencyData[4]) / 3 / 255.0;
        const midValue = frequencyData[Math.floor(frequencyData.length / 2)] / 255.0;
        const trebleValue = frequencyData[frequencyData.length - 20] / 255.0;

        [leftRail, rightRail].forEach(rail => {
          if (rail && rail.material instanceof THREE.ShaderMaterial) {
            const uniforms = rail.material.uniforms;
            uniforms.uBass.value = bassValue;
            uniforms.uMid.value = midValue;
            uniforms.uTreble.value = trebleValue;
            uniforms.uTime.value = audioContext.currentTime;
          }
        });
      } else {
        [leftRail, rightRail].forEach(rail => {
          if (rail && rail.material instanceof THREE.ShaderMaterial) {
            const uniforms = rail.material.uniforms;
            uniforms.uBass.value *= 0.9;
            uniforms.uMid.value *= 0.9;
            uniforms.uTreble.value *= 0.9;
          }
        });
      }
    }

    if (currentEnvironment === EnvironmentState.CITY) {
      cityGroup.position.x = camera.position.x;
      cityGroup.position.z = camera.position.z;

      updateCityChunks();
    } else if (currentEnvironment === EnvironmentState.SOLAR_SYSTEM) {
      solarSystemGroup.position.copy(camera.position);
      planets.forEach((planet, index) => {
        planet.rotation.y += 0.0005 * (index + 1);
      });
    }

    if (cityBackgroundSphere) {
      cityBackgroundSphere.position.copy(camera.position);
    }

    trySpawnWhiteHole();
    updateSpecialEvents();
    checkSpecialCollisions();

    if (isSketchModeActive) {
      sketchModeTimer -= deltaTime;
      if (sketchModeTimer <= 0) {
        isSketchModeActive = false;
        sketchPass.enabled = false;
      }
    }

    if (cityFadeIn.active) {
      cityFadeIn.progress += deltaTime / cityFadeIn.duration;
      const currentOpacity = Math.min(cityFadeIn.progress, 1.0);

      if (buildingMaterial) {
        (buildingMaterial as THREE.Material).opacity = currentOpacity;
      }

      if (cityFadeIn.progress >= 1.0) {
        cityFadeIn.active = false;
      }
    }

    const FADE_START_TIME = songData.duration - 3;
    if (audioContext.currentTime > FADE_START_TIME) {
      const timeIntoFade = audioContext.currentTime - FADE_START_TIME;
      const fadeDuration = songData.duration - FADE_START_TIME;
      const fadeProgress = Math.min(timeIntoFade / fadeDuration, 1.0);

      (fadeOutPlane.material as THREE.MeshBasicMaterial).opacity = fadeProgress;
    }

    if (fadeOutPlane) {
      fadeOutPlane.position.copy(camera.position);
      fadeOutPlane.quaternion.copy(camera.quaternion);
      fadeOutPlane.translateZ(-0.11);
    }

    const HYPERSPACE_THRESHOLD = 0.70;
    const HYPERSPACE_COOLDOWN = 40;
    const TIME_IN_RED_ZONE_TO_TRIGGER = 0.25;

    if (currentEnergy >= HYPERSPACE_THRESHOLD) {
      timeInRedZone += deltaTime;
    } else {
      timeInRedZone = 0;
    }

    if (
      timeInRedZone >= TIME_IN_RED_ZONE_TO_TRIGGER &&
      !hyperspaceEffect.active &&
      !activeTransition.inProgress &&
      audioContext.currentTime > lastHyperspaceTriggerTime + HYPERSPACE_COOLDOWN &&
      hyperspaceJumpCount < MAX_HYPERSPACE_JUMPS
    ) {
      hyperspaceEffect.active = true;
      hyperspaceEffect.timer = hyperspaceEffect.duration;
      lastHyperspaceTriggerTime = audioContext.currentTime;
      hyperspaceJumpCount++;
      timeInRedZone = 0;

      activeTransition.inProgress = true;
      const fromEnv = currentEnvironment;
      const nextEnv = (currentEnvironment + 1) % 3;

      const fromGroup = fromEnv === EnvironmentState.SPACE ? spaceGroup : (fromEnv === EnvironmentState.CITY ? cityGroup : solarSystemGroup);
      const toGroup = nextEnv === EnvironmentState.SPACE ? spaceGroup : (nextEnv === EnvironmentState.CITY ? cityGroup : solarSystemGroup);

      const fadeDuration = hyperspaceEffect.duration / 2;

      fade(fromGroup, 0, fadeDuration, () => {
        if (fromGroup) fromGroup.visible = false;
        if (fromEnv === EnvironmentState.CITY) {
          cityBackgroundSphere.visible = false;
        }

        setActiveEnvironment(nextEnv);

        if (toGroup) toGroup.visible = true;
        if (nextEnv === EnvironmentState.CITY) {
          cityBackgroundSphere.visible = true;
        }

        fade(toGroup, 1, fadeDuration);
        if (nextEnv === EnvironmentState.CITY) {
          fade(cityBackgroundSphere, 1, fadeDuration);
        }
      });

      if (fromEnv === EnvironmentState.CITY) {
        fade(cityBackgroundSphere, 0, fadeDuration);
      }

      setTimeout(() => {
        console.log(`Переход из ${EnvironmentState[fromEnv]} в ${EnvironmentState[nextEnv]} ЗАВЕРШЕН.`);
        currentEnvironment = nextEnv;
        activeTransition.inProgress = false;
      }, hyperspaceEffect.duration * 1000);
    }

    let baseFov = 75 + currentEnergy * 20;
    const normalStarfieldMat = normalStarfield.material as THREE.PointsMaterial;
    const streaksMat = hyperspaceStreaks.material as THREE.LineBasicMaterial;
    const defaultStarOpacity = 0.7;

    if (hyperspaceEffect.active && hyperspaceEffect.timer > 0) {
      hyperspaceEffect.timer -= deltaTime;

      const t = 1.0 - (hyperspaceEffect.timer / hyperspaceEffect.duration);
      const effectProgress = Math.sin(t * Math.PI);

      baseFov += effectProgress * 80;

      normalStarfieldMat.opacity = defaultStarOpacity * (1.0 - effectProgress);
      streaksMat.opacity = effectProgress;
      hyperspaceStreaks.visible = streaksMat.opacity > 0;

      const streakPositions = (hyperspaceStreaks.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      const stretchLength = effectProgress * 500;

      for (let i = 0; i < STAR_COUNT; i++) {
        const i3 = i * 3;
        const i6 = i * 6;

        const headX = STAR_POSITIONS[i3 + 0];
        const headY = STAR_POSITIONS[i3 + 1];
        const headZ = STAR_POSITIONS[i3 + 2];

        streakPositions[i6 + 0] = headX;
        streakPositions[i6 + 1] = headY;
        streakPositions[i6 + 2] = headZ;

        streakPositions[i6 + 3] = headX;
        streakPositions[i6 + 4] = headY;
        streakPositions[i6 + 5] = headZ - stretchLength;
      }
      hyperspaceStreaks.geometry.attributes.position.needsUpdate = true;

      if (hyperspaceEffect.timer <= 0) {
        hyperspaceEffect.active = false;

        if (currentEnvironment === EnvironmentState.CITY) {
          if (cityGroup) cityGroup.visible = true;
          if (cityBackgroundSphere) cityBackgroundSphere.visible = true;

          cityFadeIn.active = true;
          cityFadeIn.progress = 0;

        } else if (currentEnvironment === EnvironmentState.SOLAR_SYSTEM) {
          if (solarSystemGroup) solarSystemGroup.visible = true;
        }
      }
    } else {
      normalStarfieldMat.opacity = THREE.MathUtils.lerp(normalStarfieldMat.opacity, defaultStarOpacity, 0.1);
      streaksMat.opacity = THREE.MathUtils.lerp(streaksMat.opacity, 0, 0.1);
      if (streaksMat.opacity < 0.01) {
        hyperspaceStreaks.visible = false;
      }
    }

    camera.fov = baseFov;
    camera.updateProjectionMatrix();

    if (shakeTime > 0) {
      const shakeVector = new THREE.Vector3((Math.random() - 0.5) * shakeIntensity, (Math.random() - 0.5) * shakeIntensity, 0).applyQuaternion(camera.quaternion);
      camera.position.add(shakeVector);
      shakeTime -= deltaTime;
    } else {
      shakeIntensity = 0;
    }

    trackGroup.children.forEach((c: any) => {
      if (c.material?.emissive) c.material.emissiveIntensity = 0.6 + bass * 1.2;
    });

    if (backgroundSphere) {
      backgroundSphere.position.copy(camera.position);
    }

    nebulaParticles.position.z = camera.position.z - 300;
    normalStarfield.position.z = camera.position.z;
    hyperspaceStreaks.position.z = camera.position.z;
    meteorShower.position.z = camera.position.z - 500;

    const redZoneEnergy = Math.max(0, (currentEnergy - 0.75) / 0.25);
    meteorShower.visible = redZoneEnergy > 0;
    if (meteorShower.visible) {
      meteorShower.material.opacity = redZoneEnergy;
      const positions = meteorShower.geometry.attributes.position.array;
      for (let i = 0; i < positions.length / 3; i++) {
        positions[i * 3 + 1] -= (10 + currentEnergy * 20) * deltaTime;
        if (positions[i * 3 + 1] < -200) positions[i * 3 + 1] = 200;
      }
      meteorShower.geometry.attributes.position.needsUpdate = true;
    }

    if (positiveBurst.visible) {
      const positions = positiveBurst.geometry.attributes.position.array;
      for (let i = 0; i < positiveBurst.userData.velocities.length; i++) {
        positions[i * 3] += positiveBurst.userData.velocities[i].x * deltaTime;
        positions[i * 3 + 1] += positiveBurst.userData.velocities[i].y * deltaTime;
        positions[i * 3 + 2] += positiveBurst.userData.velocities[i].z * deltaTime;
      }
      positiveBurst.geometry.attributes.position.needsUpdate = true;
      positiveBurst.material.opacity -= 2.0 * deltaTime;
      if (positiveBurst.material.opacity <= 0) positiveBurst.visible = false;
    }

    const time = clock.getElapsedTime();

    for (const block of allBlocks) {
      if (block.mesh && block.type === 'color') {
        // (block.mesh.material as THREE.MeshStandardMaterial).color.copy(currentColor).multiplyScalar(0.8);
        // (block.mesh.material as THREE.MeshStandardMaterial).emissive.copy(currentColor).multiplyScalar(0.3);
        (block.mesh.material as THREE.MeshBasicMaterial).color.copy(currentColor);
      }
    }

    updateSceneColors(getTargetColor(lerpedEnergy));
    updateBlocks();
    checkCollisions();
    updateEnvironmentElements();

    if (isARankEffectActive) {
      updateVideoScreensPosition();
    }

    if (isARankEffectActive) {
      videoScreensGroup.children.forEach(screen => {
        if (screen.userData.isReady) {
          const material = (screen as THREE.Mesh).material as THREE.MeshStandardMaterial;
          if (material.opacity < 0.9) {
            material.opacity += 0.5 * deltaTime;
          }

          const video = ((material.emissiveMap as THREE.VideoTexture).source.data as HTMLVideoElement);
          if (video.paused) {
            video.play().catch(e => {});
          }
        }
      });
    } else if (videoScreensGroup.children.length > 0) {
      let allFadedOut = true;
      videoScreensGroup.children.forEach(screen => {
        const material = (screen as THREE.Mesh).material as THREE.MeshStandardMaterial;
        if (material.opacity > 0) {
          allFadedOut = false;
          material.opacity -= 1.0 * deltaTime;
        }
      });

      if (allFadedOut && videoScreensGroup.visible) {
        videoScreensGroup.visible = false;
        videoElements.forEach(video => video.pause());
      }
    }
  } else {
    updateMenuEqualizer(time);

    if (equalizerGroup) {
      const Z_DISTANCE = 12;
      const Y_OFFSET_FACTOR = 2.0;
      const TILT_ANGLE = -Math.PI / 10;

      const vFOV = THREE.MathUtils.degToRad(camera.fov);
      const targetHeight = 2 * Math.tan(vFOV / 2) * Z_DISTANCE;

      const targetPosition = new THREE.Vector3(0, -targetHeight / Y_OFFSET_FACTOR, -Z_DISTANCE);

      targetPosition.applyMatrix4(camera.matrixWorld);

      equalizerGroup.position.copy(targetPosition);
      equalizerGroup.quaternion.copy(camera.quaternion);
      // equalizerGroup.rotateX(TILT_ANGLE);
    }

    if (backgroundSphere) {
      const time = clock.getElapsedTime();
      (backgroundSphere.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.2 + (Math.sin(time * 0.5) * 0.5 + 0.5) * 0.2;
      backgroundSphere.rotation.y += 0.0005;
    }
  }
  renderer.setClearColor(0x000000);
  camera.layers.set(BLOOM_SCENE);
  bloomComposer.render();

  renderer.setClearColor(0x000000);
  camera.layers.set(ENTIRE_SCENE);
  composer.render();
}

async function endGame() {
  if (!gameStarted) return;
  gameStarted = false;
  if (consecutiveHits > maxCombo) {
    maxCombo = consecutiveHits;
  }

  function calculatePerformanceRank(): string {
    if (rankHistory.length === 0) return 'D';

    const averageRankIndex = rankHistory.reduce((a, b) => a + b, 0) / rankHistory.length;

    const penalty = totalMisses * 0.15;
    const finalRankValue = averageRankIndex - penalty;

    if (finalRankValue >= 5.5) return 'SSS';
    if (finalRankValue >= 4.5) return 'SS';
    if (finalRankValue >= 3.5) return 'S';
    if (finalRankValue >= 2.5) return 'A';
    if (finalRankValue >= 1.5) return 'B';
    if (finalRankValue >= 0.5) return 'C';
    return 'D';
  }

  const performanceRank = calculatePerformanceRank();

  const telegramUserId = 'user123';

  const gameData = {
    userId: telegramUserId,
    trackName: currentTrackName,
    videoId: currentVideoId,
    score: score,
    rank: performanceRank,
    maxCombo: maxCombo,
    misses: totalMisses
  };

  try {
    console.log('[API] Отправляю результаты игры на сервер:', gameData);
    const response = await fetch('http://localhost:3001/api/game-end', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(gameData),
    });

    if (response.ok) {
      console.log('[API] Результаты успешно сохранены.');
      loadTotalScore();
    } else {
      console.error('[API] Ошибка при сохранении результатов:', await response.json());
    }
  } catch (error) {
    console.error('[API] Не удалось подключиться к серверу для сохранения результатов:', error);
  }

  gameHud.classList.add('hidden');
  styleRankContainer.classList.add('hidden');
  finalScoreEl.textContent = score.toString();
  endScreen.classList.remove('hidden');
  cancelAnimationFrame(animationFrameId);
  videoElements.forEach(video => {
    video.pause();
    video.src = '';
    video.remove();
  });
  videoElements.length = 0;
  if(videoScreensGroup) {
    while(videoScreensGroup.children.length > 0){
      videoScreensGroup.remove(videoScreensGroup.children[0]);
    }
  }
  // if(videoScreensGroup) camera.remove(videoScreensGroup);
  isARankEffectActive = false;
}

function setupAndPositionVideoScreens() {
  if (videoElements.length === 0) {
    console.warn("Видео-элементы не были предзагружены.");
    return;
  }

  const screenWidth = 22;
  const screenHeight = screenWidth * (9 / 16);
  const geometry = new THREE.PlaneGeometry(screenWidth, screenHeight);

  for (let i = 0; i < videoElements.length; i++) {
    const video = videoElements[i] as any;

    const texture = new THREE.VideoTexture(video);
    const material = new THREE.MeshStandardMaterial({
      emissive: 0xffffff,
      emissiveIntensity: 0.5,
      emissiveMap: texture,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
      color: 0x000000,
      fog: false
    });

    const screenMesh = new THREE.Mesh(geometry, material);

    screenMesh.userData.isReady = video.isReady;

    videoScreensGroup.add(screenMesh);
  }
}

/**
 * Управляет видимостью и воспроизведением видео на экранах.
 */
function updateVideoScreensVisibility(visible: boolean) {
  if (videoElements.length === 0) return;

  if (visible) {
    videoScreensGroup.visible = true;
  }
}

/**
 * Обновляет мировые координаты и ОРИЕНТАЦИЮ видео-экранов,
 * основываясь на текущем кадре ТРАССЫ.
 */

const _screenPos = new THREE.Vector3();
const _lookAtMatrix = new THREE.Matrix4();
const _parallelQuat = new THREE.Quaternion();
const _lookAtQuat = new THREE.Quaternion();

function updateVideoScreensPosition() {
  if (!videoScreensGroup.visible) return;

  const _playerFrame = { point: new THREE.Vector3(), tangent: new THREE.Vector3(), normal: new THREE.Vector3(), binormal: new THREE.Vector3() };
  const _screenFrameForLoop = { point: new THREE.Vector3(), tangent: new THREE.Vector3(), normal: new THREE.Vector3(), binormal: new THREE.Vector3() };

  const START_AHEAD_UNITS = 15;
  const SPACING_UNITS = 25;
  const SIDE_OFFSET_UNITS = 30;
  const VERTICAL_OFFSET_UNITS = 5;

  getInterpolatedFrame(playerProgress, _playerFrame);
  const playerLookAtTarget = _playerFrame.point;

  videoScreensGroup.children.forEach((screen, index) => {
    const isLeftSide = index < NUM_SCREENS / 2;
    const sideMultiplier = isLeftSide ? -1 : 1;
    const indexOnSide = index % (NUM_SCREENS / 2);

    const screenProgress = playerProgress + (START_AHEAD_UNITS + indexOnSide * SPACING_UNITS) / trackCurve.getLength();

    if (screenProgress >= 1.0) {
      screen.visible = false;
      return;
    }
    screen.visible = true;

    const screenFrame = getInterpolatedFrame(screenProgress, _screenFrameForLoop);

    _screenPos.copy(screenFrame.point)
      .add(screenFrame.binormal.clone().multiplyScalar(sideMultiplier * SIDE_OFFSET_UNITS))
      .add(screenFrame.normal.clone().multiplyScalar(VERTICAL_OFFSET_UNITS));
    screen.position.copy(_screenPos);

    const tangent = screenFrame.tangent;
    const normal = screenFrame.normal;
    const binormal = screenFrame.binormal.clone().multiplyScalar(-sideMultiplier);

    _lookAtMatrix.makeBasis(tangent, normal, binormal);
    _parallelQuat.setFromRotationMatrix(_lookAtMatrix);

    _lookAtMatrix.lookAt(screen.position, playerLookAtTarget, normal);
    _lookAtQuat.setFromRotationMatrix(_lookAtMatrix);

    _parallelQuat.slerp(_lookAtQuat, 0.7);

    screen.quaternion.copy(_parallelQuat);
  });
}

/**
 * ЗАРАНЕЕ загружает все видео-чанки в фоне, не создавая 3D-объектов.
 * Вызывается сразу после выбора файла.
 */
async function preloadVideoScreens() {
  if (!videoUrl.trim()) return;
  console.log("Начинаю предзагрузку видео-чанков...");

  const assumedDuration = 240;
  const segmentDuration = assumedDuration / NUM_SCREENS;

  for (let i = 0; i < NUM_SCREENS; i++) {
    const startTime = Math.floor(i * segmentDuration);
    const chunkUrl = `http://localhost:3001/get-video-chunk?url=${encodeURIComponent(videoUrl)}&startTime=${startTime}&duration=${segmentDuration}`;

    const video = document.createElement('video');
    (video as any).isReady = false;

    video.style.display = 'none';
    video.src = chunkUrl;
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.loop = true;
    video.preload = 'auto';
    document.body.appendChild(video);
    videoElements.push(video);

    video.addEventListener('canplaythrough', () => {
      (video as any).isReady = true;
    }, { once: true });

    video.addEventListener('error', () => {
      (video as any).isReady = false;
    }, { once: true });
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  if (sketchPass) {
    sketchPass.uniforms.resolution.value.x = window.innerWidth * window.devicePixelRatio;
    sketchPass.uniforms.resolution.value.y = window.innerHeight * window.devicePixelRatio;
  }

  if (equalizerGroup && !gameStarted) {
    scene.remove(equalizerGroup);
    equalizerGroup.children.forEach((child: any) => {
      child.geometry.dispose();
      child.material.dispose();
    });
    createMenuEqualizer();
  }
}

init();
