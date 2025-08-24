// --- Imports ---
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';


// --- DOM Elements ---
const canvas = document.getElementById('webgl-canvas') as HTMLCanvasElement;
const fileInput = document.getElementById('audio-file-input') as HTMLInputElement;
const startScreen = document.getElementById('start-screen')!;
const startPrompt = document.getElementById('start-prompt') as HTMLParagraphElement;
const fileLabel = document.getElementById('file-label') as HTMLLabelElement;
const loadingScreen = document.getElementById('loading-screen')!;
const loadingText = document.getElementById('loading-text')!;
const analysisText = document.getElementById('analysis-text')!;
const scoreContainer = document.getElementById('score-container')!;
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

// --- 3D Scene Variables ---
let scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer, composer: EffectComposer;
let player: THREE.Group, trackGroup: THREE.Group, backgroundSphere: THREE.Mesh, nebulaParticles: THREE.Points,
  normalStarfield: THREE.Points, hyperspaceStreaks: THREE.LineSegments, meteorShower: any, positiveBurst: any;
let audioContext: AudioContext, analyser: AnalyserNode, source: AudioBufferSourceNode;
let frequencyData: Uint8Array;
let animationFrameId: number;
let score = 0;

// --- Game Data & State ---
let trackCurve: THREE.CatmullRomCurve3;
let trackFrames: {
  point: THREE.Vector3;
  tangent: THREE.Vector3;
  normal: THREE.Vector3;
  binormal: THREE.Vector3;
}[] = [];
let playerProgress = 0;
let lastPlayerProgress = 0; // To track progress between frames for accurate collision
let songData: { duration: number, energyMap: number[] } | null = null;
let gameStarted = false;
let isPaused = false;
let targetPlayerLane = 1; // The lane the player is moving towards
let actualPlayerLane = 1; // The player's current physical lane (can be fractional)
const keyState = {left: false, right: false}; // Keyboard state for controls
let timeInRedZone = 0; // Tracks how long player is in a high-energy zone

// --- Color & Effects State ---
let currentColor = new THREE.Color(0x00bfff);
let lerpedEnergy = 0;
let hyperspaceEffect = {active: false, timer: 0, duration: 1.5}; // Increased duration for a better effect
let lastHyperspaceTriggerTime = -Infinity;
let hyperspaceJumpCount = 0;

// --- Camera Shake & Effects ---
let shakeTime = 0;
let shakeIntensity = 0;

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


// --- Block Management ---
const allBlocks: any[] = [];
const colorBlockPool: any[] = [];
const greyBlockPool: any[] = [];

async function loadPlayerModel(): Promise<THREE.Group> {
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.load('hurricane_triplestar__low_poly.glb',
      (gltf) => {
        const modelGroup = gltf.scene;

        const box = new THREE.Box3().setFromObject(modelGroup);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 6 / maxDim; // Increased scale for better visibility
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
  // Предотвращаем стандартное поведение браузера (например, прокрутку страницы)
  event.preventDefault();

  // Получаем X-координату первого касания
  const touchX = event.touches[0].clientX;
  // Находим середину экрана
  const screenMidpoint = window.innerWidth / 2;

  if (touchX < screenMidpoint) {
    // Если касание в левой половине, имитируем нажатие "влево"
    keyState.left = true;
    keyState.right = false; // Убедимся, что правая кнопка "отпущена"
  } else {
    // Если касание в правой половине, имитируем нажатие "вправо"
    keyState.right = true;
    keyState.left = false; // Убедимся, что левая кнопка "отпущена"
  }
}

function handleTouchEnd(event: TouchEvent) {
  // Предотвращаем стандартное поведение
  event.preventDefault();

  // Когда пользователь убирает палец, "отпускаем" обе кнопки
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

async function init() {
  // Update UI for loading
  startPrompt.textContent = 'Loading spaceship...';
  fileLabel.classList.add('hidden');
  fileInput.disabled = true;

  // Basic scene setup
  scene = new THREE.Scene();

  // Add lighting to show model textures
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

  // Load model before proceeding
  try {
    player = await loadPlayerModel();
    scene.add(player);
    player.visible = false; // Keep it hidden until game starts
  } catch (error) {
    startPrompt.textContent = 'Error loading assets. Please refresh.';
    startPrompt.style.color = '#f55';
    return;
  }

  // Continue with the rest of the scene
  backgroundSphere = createBackgroundSphere();
  scene.add(backgroundSphere);

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

  // Unlock UI
  startPrompt.textContent = 'Choose a song to start your ride';
  fileLabel.classList.remove('hidden');
  fileInput.disabled = false;

  animate();
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
    emissive: 0x00aaff,
    emissiveIntensity: 0.2,
    side: THREE.BackSide,
    fog: false,
    wireframe: true,
    opacity: 0.4,
    transparent: true,
  });
  const sphere = new THREE.Mesh(geo, mat);
  sphere.position.set(450, 200, -1500); // Positioned to be visible from the track
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
  }); // Increased size
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

async function onFileSelect(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  startScreen.classList.add('hidden');
  loadingScreen.classList.remove('hidden');
  loadingText.classList.add('hidden');
  analysisText.classList.remove('hidden');

  try {
    const arrayBuffer = await file.arrayBuffer();
    await analyzeAudioAndGenerateTrack(arrayBuffer.slice(0));
    analysisText.classList.add('hidden');
    loadingText.classList.remove('hidden');
    setupAndPlayAudio(arrayBuffer);
  } catch (error) {
    console.error("Failed to analyze or play audio:", error);
    alert("Sorry, there was an error processing that audio file. Please try a different one.");
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
  // More responsive smoothing
  const smoothedEnergyMap = smoothArray(normalizedEnergyMap, 3);
  songData = {duration, energyMap: smoothedEnergyMap};

  trackCurve = createTrackPath(smoothedEnergyMap, duration);
  const trackSegments = Math.floor(duration * 30); // Lowered from 60 to 30 for performance
  trackFrames = generateTrackFrames(trackCurve, smoothedEnergyMap, trackSegments);

  pregenerateBlocks(smoothedEnergyMap);

  if (trackGroup) scene.remove(trackGroup);
  trackGroup = createTrackMesh(trackFrames);
  scene.add(trackGroup);
}

function generateTrackFrames(curve: THREE.CatmullRomCurve3, energyMap: number[], segments: number) {
  const frames = [];
  let lastUp = new THREE.Vector3(0, 1, 0);
  const INTENSE_ROLL_THRESHOLD = 0.82; // Lowered threshold for more frequent corkscrews
  const HILL_FREQUENCY = 0.4; // Controls how close the hills are. Lower is wider.
  const HILL_AMPLITUDE = 2.5; // Controls the max height of hills.

  for (let i = 0; i <= segments; i++) {
    const progress = i / segments;
    const point = curve.getPointAt(progress);
    const tangent = curve.getTangentAt(progress).normalize();

    const energyIndex = Math.min(Math.floor(progress * energyMap.length), energyMap.length - 1);
    const energy = energyMap[energyIndex] || 0;

    // --- HILL GENERATION ---
    // We need a stable "up" vector before applying roll.
    const preRollNormal = lastUp.clone();
    preRollNormal.projectOnPlane(tangent).normalize();

    // Calculate hill height based on a sine wave and music energy.
    const hillOffset = Math.sin(i * HILL_FREQUENCY) * energy * HILL_AMPLITUDE;
    point.add(preRollNormal.clone().multiplyScalar(hillOffset));
    // --- END HILL GENERATION ---

    // Use a low-frequency sine wave for long, majestic rolls.
    const turnInfluence = Math.sin(progress * energyMap.length * 0.08);

    let rollDelta = 0;
    // Only apply roll on very high energy parts to make it a special event
    if (energy > INTENSE_ROLL_THRESHOLD) {
      // The amount of roll increases as energy goes from threshold to 1.0
      const rollIntensity = (energy - INTENSE_ROLL_THRESHOLD) / (1.0 - INTENSE_ROLL_THRESHOLD);
      rollDelta = turnInfluence * rollIntensity * -1.5; // Tunable: -1.5 is the max roll factor
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

  const turnInfluence = 4.0;
  const climbInfluence = 3.5;
  const damping = 0.96;
  const centeringForce = 0.003;
  const baseSegmentLengthPerSecond = 150;
  const timePerSegment = duration / energyMap.length;

  for (let i = 0; i < energyMap.length; i++) {
    const energy = energyMap[i];

    // Speed multiplier: Slower on calm parts, much faster on intense parts
    const speedMultiplier = 0.5 + energy * 2.5; // Range from 0.5x to 3.0x
    const segmentLength = baseSegmentLengthPerSecond * timePerSegment * speedMultiplier;

    // Path variation (turns, climbs) multiplier.
    // More sensitive to make calm parts straighter.
    const effectMultiplier = Math.max(0, (energy - 0.3) / 0.6);

    const turnForce = Math.sin(i * 0.15) * energy * turnInfluence * effectMultiplier;
    const climbForce = (energy - 0.2) * climbInfluence * effectMultiplier;

    const centerPullX = -pos.x * centeringForce;
    const centerPullY = -pos.y * centeringForce;

    vel.x += turnForce + centerPullX;
    vel.y += climbForce + centerPullY;
    vel.multiplyScalar(damping);

    pos.x += vel.x;
    pos.y += vel.y;
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

  const railMat = new THREE.MeshStandardMaterial({emissiveIntensity: 1.0, side: THREE.DoubleSide});
  const lineMat = new THREE.MeshBasicMaterial({color: 0xffffff, side: THREE.DoubleSide});

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
    side: THREE.DoubleSide, transparent: true, opacity: 0.1, metalness: 0.2, roughness: 0.8
  });
  group.add(new THREE.Mesh(roadGeo, roadMat));

  return group;
}

function setupAndPlayAudio(arrayBuffer: ArrayBuffer) {
  if (audioContext) audioContext.close();
  audioContext = new AudioContext();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  frequencyData = new Uint8Array(analyser.frequencyBinCount);

  audioContext.decodeAudioData(arrayBuffer, (buffer) => {
    source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(analyser);
    analyser.connect(audioContext.destination);
    source.start(0);
    source.onended = endGame;

    if (player) player.visible = true;

    loadingScreen.classList.add('hidden');
    gameHud.classList.remove('hidden');
    score = 0;
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
    block.mesh.visible = false;
    scene.remove(block.mesh);
    const pool = block.type === 'color' ? colorBlockPool : greyBlockPool;
    pool.push(block.mesh);
    block.mesh = null;
  }
}

function createColorBlock() {
  const blockWidth = 1.5;
  const geometry = new RoundedBoxGeometry(blockWidth, blockWidth, blockWidth * 2, 6, 0.5);
  const material = new THREE.MeshStandardMaterial({emissiveIntensity: 0.4});
  return new THREE.Mesh(geometry, material);
}

function createGreyBlock() {
  const blockWidth = 1.5;
  const geometry = new RoundedBoxGeometry(blockWidth, blockWidth, blockWidth * 2, 6, 0.5);
  // Give grey blocks a subtle emissive property to ensure they are always visible
  const material = new THREE.MeshStandardMaterial({
    color: 0x666666, // A mid-grey
    metalness: 0.2,
    roughness: 0.7,
    emissive: 0xbbbbbb, // A light grey emissive color
    emissiveIntensity: 0.25 // Subtle glow so it doesn't distract
  });
  return new THREE.Mesh(geometry, material);
}

function pregenerateBlocks(energyMap: number[]) {
  allBlocks.length = 0;
  let lastLane = 1;
  let consecutiveObstacles = 0;

  for (let i = 0; i < energyMap.length; i++) {
    const energy = energyMap[i];
    const progress = i / energyMap.length;

    // Spawn chance based on energy. Less blocks on calm parts.
    const spawnChance = energy * 0.75;
    if (Math.random() > spawnChance) continue;

    // Obstacle runs (grey blocks) are for medium-high energy.
    const isObstacleRun = energy > 0.6 && Math.random() < (energy - 0.6) * 0.7 && consecutiveObstacles < 2;
    // Multi-blocks (full rows of color) for medium energy and up.
    const isMultiBlock = energy > 0.4 && Math.random() < (energy - 0.4);


    if (isObstacleRun) {
      const openLane = Math.floor(Math.random() * NUM_LANES);
      for (let lane = 0; lane < NUM_LANES; lane++) {
        if (lane !== openLane) {
          allBlocks.push({progress, lane, type: 'grey', mesh: null, collected: false});
        }
      }
      consecutiveObstacles++;
    } else if (isMultiBlock) {
      for (let lane = 0; lane < NUM_LANES; lane++) {
        if (Math.random() > 0.15) { // higher chance for multi-blocks
          allBlocks.push({progress, lane, type: 'color', mesh: null, collected: false});
        }
      }
      consecutiveObstacles = 0;
    } else {
      let lane;
      const laneChoice = Math.random();
      if (laneChoice < 0.6) lane = lastLane;
      else if (laneChoice < 0.8) lane = (lastLane + 1) % NUM_LANES;
      else lane = (lastLane + NUM_LANES - 1) % NUM_LANES;

      allBlocks.push({progress, lane, type: 'color', mesh: null, collected: false});
      lastLane = lane;
      consecutiveObstacles = 0;
    }
  }
}

function getInterpolatedFrame(progress: number) {
  const totalFrames = trackFrames.length - 1;
  const idx = progress * totalFrames;
  const i1 = Math.floor(idx);
  const i2 = Math.min(i1 + 1, totalFrames);
  const t = idx - i1;

  if (i1 >= trackFrames.length || i2 >= trackFrames.length) {
    return trackFrames[totalFrames];
  }
  if (i1 === i2) {
    return trackFrames[i1];
  }

  const frame1 = trackFrames[i1];
  const frame2 = trackFrames[i2];

  const interpolatedFrame = {
    point: new THREE.Vector3().lerpVectors(frame1.point, frame2.point, t),
    tangent: new THREE.Vector3().lerpVectors(frame1.tangent, frame2.tangent, t).normalize(),
    normal: new THREE.Vector3().lerpVectors(frame1.normal, frame2.normal, t).normalize(),
    binormal: new THREE.Vector3().lerpVectors(frame1.binormal, frame2.binormal, t).normalize()
  };

  // Re-orthogonalize the frame to be safe after interpolation
  interpolatedFrame.normal.projectOnPlane(interpolatedFrame.tangent).normalize();
  interpolatedFrame.binormal.crossVectors(interpolatedFrame.tangent, interpolatedFrame.normal);

  return interpolatedFrame;
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

    const point = frame.point.clone();
    point.add(frame.binormal.clone().multiplyScalar(LANE_POSITIONS[block.lane]));
    block.mesh.position.copy(point);

    rotationMatrix.makeBasis(frame.tangent, frame.normal, frame.binormal);

    block.mesh.quaternion.setFromRotationMatrix(rotationMatrix);
  }
}

function checkCollisions() {
  for (const block of allBlocks) {
    if (block.mesh && !block.collected && Math.round(actualPlayerLane) === block.lane) {
      // Check if the player's center has passed the block's center in the last frame.
      if (lastPlayerProgress < block.progress && playerProgress >= block.progress) {
        if (block.type === 'color') {
          score += 10;
          triggerPositiveBurst(block.mesh.position, block.mesh.material.color);
        } else {
          score = Math.max(0, score - 25);
          shakeTime = 0.4;
          shakeIntensity = 0.3;
          vignette.style.opacity = '1';
          setTimeout(() => {
            vignette.style.opacity = '0';
          }, 100);
        }
        scoreEl.textContent = score.toString();
        block.collected = true;
        recycleToPool(block);
      }
    }
  }
}

function getTargetColor(energy: number): THREE.Color {
  const calmLow = new THREE.Color(0x00bfff);      // blue: DeepSkyBlue
  const calmHigh = new THREE.Color(0x20c20e);     // green
  const mediumLow = new THREE.Color(0xffff00);    // yellow
  const mediumHigh = new THREE.Color(0xff4500);   // orange-red
  const intenseLow = new THREE.Color(0xff4500);   // orange-red
  const intenseHigh = new THREE.Color(0xdc143c);  // crimson

  const calmThreshold = 0.3;
  const mediumThreshold = 0.7; // Raised threshold for yellow/orange

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
  // Lerp the current color towards the target for smooth transitions
  currentColor.lerp(targetColor, 0.08);

  (composer.passes[1] as UnrealBloomPass).strength = 0.6 + lerpedEnergy * 1.2;

  if (trackGroup) {
    trackGroup.children.forEach((child: any) => {
      if (child.geometry.type === 'TubeGeometry' && child.material?.emissive) {
        child.material.color.copy(currentColor);
        child.material.emissive.copy(currentColor);
      }
    });
  }

  // Update background sphere emissive color for glow effect
  if (backgroundSphere && (backgroundSphere.material as THREE.MeshStandardMaterial).emissive) {
    (backgroundSphere.material as THREE.MeshStandardMaterial).emissive.copy(currentColor);
  }

  scene.fog.color.copy(currentColor);
}


const clock = new THREE.Clock();

function animate() {
  animationFrameId = requestAnimationFrame(animate);
  const deltaTime = clock.getDelta();

  if (gameStarted && !isPaused && trackCurve && songData && trackFrames.length > 0) {
    lastPlayerProgress = playerProgress;
    playerProgress = Math.min(audioContext.currentTime / songData.duration, 1.0);

    const energyIndex = Math.min(Math.floor(playerProgress * songData.energyMap.length), songData.energyMap.length - 1);
    const currentEnergy = songData.energyMap[energyIndex] || 0;

    // Use a lerped energy for smooth color and effect transitions
    lerpedEnergy = THREE.MathUtils.lerp(lerpedEnergy, currentEnergy, 0.05);

    // --- Core track vectors for this frame ---
    const currentFrame = getInterpolatedFrame(playerProgress);
    const {point: currentPoint, tangent, normal: trackNormal, binormal} = currentFrame;

    // --- Player Logic ---
    if (keyState.left) {
      targetPlayerLane = 0;
    } else if (keyState.right) {
      targetPlayerLane = 2;
    } else {
      targetPlayerLane = 1;
    }
    actualPlayerLane = THREE.MathUtils.lerp(actualPlayerLane, targetPlayerLane, 0.35);
    const horizontalOffset = binormal.clone().multiplyScalar(THREE.MathUtils.lerp(LANE_POSITIONS[0], LANE_POSITIONS[2], actualPlayerLane / 2));
    const SHIP_HOVER_HEIGHT = 1.2;
    const verticalOffset = trackNormal.clone().multiplyScalar(SHIP_HOVER_HEIGHT);
    player.position.copy(currentPoint).add(horizontalOffset).add(verticalOffset);
    const lookAheadProgress = 0.003;
    const futureProgress = Math.min(playerProgress + lookAheadProgress, 1.0);
    const futureFrame = getInterpolatedFrame(futureProgress);
    const futureHorizontalOffset = futureFrame.binormal.clone().multiplyScalar(THREE.MathUtils.lerp(LANE_POSITIONS[0], LANE_POSITIONS[2], actualPlayerLane / 2));
    const futureVerticalOffset = futureFrame.normal.clone().multiplyScalar(SHIP_HOVER_HEIGHT);
    const lookAtTargetPoint = futureFrame.point.clone().add(futureHorizontalOffset).add(futureVerticalOffset);
    player.up.copy(trackNormal);
    player.lookAt(lookAtTargetPoint);
    player.rotateY(Math.PI);

    // --- Camera Logic ---
    const CAM_HEIGHT = 6.0;
    const CAM_DISTANCE_BEHIND = 10.0;
    const cameraVerticalOffset = trackNormal.clone().multiplyScalar(CAM_HEIGHT);
    const cameraBehindOffset = tangent.clone().multiplyScalar(-CAM_DISTANCE_BEHIND);
    const idealCameraPos = currentPoint.clone().add(cameraVerticalOffset).add(cameraBehindOffset);
    camera.position.lerp(idealCameraPos, 1.0);
    camera.up.copy(trackNormal);
    const LOOK_AHEAD_DISTANCE = 40.0;
    const cameraLookAtTarget = currentPoint.clone().add(tangent.clone().multiplyScalar(LOOK_AHEAD_DISTANCE));
    camera.lookAt(cameraLookAtTarget);

    // --- Effects and Visuals ---

    // HYPERSPACE LOGIC: Reactive trigger based on sustained time in a high-energy zone.
    const HYPERSPACE_THRESHOLD = 0.70;
    const HYPERSPACE_COOLDOWN = 40;
    const TIME_IN_RED_ZONE_TO_TRIGGER = 0.25;

    if (currentEnergy >= HYPERSPACE_THRESHOLD) {
      timeInRedZone += deltaTime;
    } else {
      timeInRedZone = 0;
    }

    // Check for trigger condition
    if (
      timeInRedZone >= TIME_IN_RED_ZONE_TO_TRIGGER &&
      !hyperspaceEffect.active &&
      audioContext.currentTime > lastHyperspaceTriggerTime + HYPERSPACE_COOLDOWN &&
      hyperspaceJumpCount < MAX_HYPERSPACE_JUMPS
    ) {
      hyperspaceEffect.active = true;
      hyperspaceEffect.timer = hyperspaceEffect.duration;
      lastHyperspaceTriggerTime = audioContext.currentTime;
      hyperspaceJumpCount++;
      timeInRedZone = 0;
    }

    // Dynamic FOV and Hyperspace Update
    let baseFov = 75 + currentEnergy * 20;
    const normalStarfieldMat = normalStarfield.material as THREE.PointsMaterial;
    const streaksMat = hyperspaceStreaks.material as THREE.LineBasicMaterial;
    const defaultStarOpacity = 0.7;

    if (hyperspaceEffect.active && hyperspaceEffect.timer > 0) {
      hyperspaceEffect.timer -= deltaTime;

      // t is the overall progress of the effect, from 0 to 1
      const t = 1.0 - (hyperspaceEffect.timer / hyperspaceEffect.duration);
      // effectProgress uses a sine curve to smoothly go from 0 -> 1 -> 0
      const effectProgress = Math.sin(t * Math.PI);

      baseFov += effectProgress * 80;

      // --- Crossfade Opacity ---
      normalStarfieldMat.opacity = defaultStarOpacity * (1.0 - effectProgress);
      streaksMat.opacity = effectProgress;
      hyperspaceStreaks.visible = streaksMat.opacity > 0;

      // --- Star Stretching ---
      const streakPositions = (hyperspaceStreaks.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      const stretchLength = effectProgress * 500; // Max length of the streak

      for (let i = 0; i < STAR_COUNT; i++) {
        const i3 = i * 3; // Index for original star position
        const i6 = i * 6; // Index for line segment (2 vertices)

        const headX = STAR_POSITIONS[i3 + 0];
        const headY = STAR_POSITIONS[i3 + 1];
        const headZ = STAR_POSITIONS[i3 + 2];

        // Set the start point of the line (head)
        streakPositions[i6 + 0] = headX;
        streakPositions[i6 + 1] = headY;
        streakPositions[i6 + 2] = headZ;

        // Set the end point of the line (tail) by stretching it along Z
        streakPositions[i6 + 3] = headX;
        streakPositions[i6 + 4] = headY;
        streakPositions[i6 + 5] = headZ - stretchLength;
      }
      hyperspaceStreaks.geometry.attributes.position.needsUpdate = true;

      if (hyperspaceEffect.timer <= 0) {
        hyperspaceEffect.active = false;
      }
    } else {
      // Smoothly transition back to normal state
      normalStarfieldMat.opacity = THREE.MathUtils.lerp(normalStarfieldMat.opacity, defaultStarOpacity, 0.1);
      streaksMat.opacity = THREE.MathUtils.lerp(streaksMat.opacity, 0, 0.1);
      if (streaksMat.opacity < 0.01) {
        hyperspaceStreaks.visible = false;
      }
    }

    camera.fov = baseFov;
    camera.updateProjectionMatrix();

    // Camera Shake Effect
    if (shakeTime > 0) {
      const shakeVector = new THREE.Vector3((Math.random() - 0.5) * shakeIntensity, (Math.random() - 0.5) * shakeIntensity, 0).applyQuaternion(camera.quaternion);
      camera.position.add(shakeVector);
      shakeTime -= deltaTime;
    } else {
      shakeIntensity = 0;
    }

    // Update other scene elements
    analyser.getByteFrequencyData(frequencyData);
    const bass = (frequencyData[1] + frequencyData[2]) / 2 / 255;
    trackGroup.children.forEach((c: any) => {
      if (c.material?.emissive) c.material.emissiveIntensity = 0.6 + bass * 1.2;
    });

    if (backgroundSphere) {
      (backgroundSphere.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.2 + bass * 1.5;
    }

    nebulaParticles.position.z = camera.position.z - 300;
    normalStarfield.position.z = camera.position.z;
    hyperspaceStreaks.position.z = camera.position.z;
    meteorShower.position.z = camera.position.z - 500;

    // Intense red zone visual effects
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

    for (const block of allBlocks) {
      if (block.mesh && block.type === 'color') {
        // Use the main scene color for blocks for consistency
        (block.mesh.material as THREE.MeshStandardMaterial).color.copy(currentColor).multiplyScalar(0.8);
        (block.mesh.material as THREE.MeshStandardMaterial).emissive.copy(currentColor).multiplyScalar(0.3);
      }
    }

    updateSceneColors(getTargetColor(lerpedEnergy));
    updateBlocks();
    checkCollisions();
  } else {
    if (backgroundSphere) {
      const time = clock.getElapsedTime();
      (backgroundSphere.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.2 + (Math.sin(time * 0.5) * 0.5 + 0.5) * 0.2; // Gentle pulse
      backgroundSphere.rotation.y += 0.0005;
    }
  }
  composer.render();
}

function endGame() {
  if (!gameStarted) return;
  gameStarted = false;
  gameHud.classList.add('hidden');
  finalScoreEl.textContent = score.toString();
  endScreen.classList.remove('hidden');
  cancelAnimationFrame(animationFrameId);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}

init();
