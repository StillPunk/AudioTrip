// TypeScript declarations for Three.js global objects from CDN scripts
declare var THREE: any;

// --- DOM Elements ---
const canvas = document.getElementById('webgl-canvas') as HTMLCanvasElement;
const fileInput = document.getElementById('audio-file-input') as HTMLInputElement;
const startScreen = document.getElementById('start-screen')!;
const loadingScreen = document.getElementById('loading-screen')!;
const loadingText = document.getElementById('loading-text')!;
const analysisText = document.getElementById('analysis-text')!;
const scoreContainer = document.getElementById('score-container')!;
const scoreEl = document.getElementById('score')!;
const endScreen = document.getElementById('end-screen')!;
const finalScoreEl = document.getElementById('final-score')!;
const restartButton = document.getElementById('restart-button')!;
const vignette = document.getElementById('vignette')!;

// --- 3D Scene Variables ---
let scene: any, camera: any, renderer: any, composer: any;
let player: any, playerTrail: any, trackGroup: any, backgroundTunnel: any, nebulaParticles: any, starBursts: any, meteorShower: any, positiveBurst: any;
let audioContext: AudioContext, analyser: AnalyserNode, source: AudioBufferSourceNode;
let frequencyData: Uint8Array;
let animationFrameId: number;
let score = 0;

// --- Game Data & State ---
let trackCurve: any;
let playerProgress = 0;
let songData: { duration: number, energyMap: number[] } | null = null;
let gameStarted = false;
let targetPlayerLane = 1; // The lane the player is moving towards
let actualPlayerLane = 1; // The player's current physical lane (can be fractional)
const keyState = { left: false, right: false }; // Keyboard state for controls

// --- Camera Shake & Effects ---
let shakeTime = 0;
let shakeIntensity = 0;

// --- Game Constants ---
const LANE_WIDTH = 4;
const NUM_LANES = 3;
const LANE_POSITIONS = [-(NUM_LANES - 1) / 2 * LANE_WIDTH, 0, (NUM_LANES - 1) / 2 * LANE_WIDTH];
const ANALYSIS_CHUNK_SAMPLES = 4096;
const BLOCK_VIEW_DISTANCE = 0.1;

// --- Block Management ---
const allBlocks: any[] = [];
const colorBlockPool: any[] = [];
const greyBlockPool: any[] = [];

function init() {
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x000000, 10, 250);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0, 5, 20);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(0x000000);

  player = createPlayer();
  scene.add(player);

  backgroundTunnel = createBackgroundTunnel();
  scene.add(backgroundTunnel);
  
  nebulaParticles = createNebulas();
  scene.add(nebulaParticles);

  starBursts = createStarBursts();
  scene.add(starBursts);

  meteorShower = createMeteorShower();
  scene.add(meteorShower);

  positiveBurst = createPositiveBurst();
  scene.add(positiveBurst);

  const renderScene = new THREE.RenderPass(scene, camera);
  const bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
  bloomPass.threshold = 0.2;
  bloomPass.strength = 1.2;
  bloomPass.radius = 0.5;

  composer = new THREE.EffectComposer(renderer);
  composer.addPass(renderScene);
  composer.addPass(bloomPass);

  window.addEventListener('resize', onWindowResize);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  fileInput.addEventListener('change', onFileSelect);
  restartButton.addEventListener('click', () => location.reload());

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

function createPlayer() {
    const playerGroup = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ 
        color: 0x00aaff, 
        emissive: 0x00ffff,
        emissiveIntensity: 2.0,
        metalness: 0.8, 
        roughness: 0.4 
    });
    
    const bodyGeo = new THREE.ConeGeometry(0.8, 3, 8);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.rotation.x = Math.PI / 2;
    playerGroup.add(body);
    
    const wingGeo = new THREE.BoxGeometry(3.5, 0.2, 1.5);
    const mainWing = new THREE.Mesh(wingGeo, bodyMat);
    mainWing.position.z = -0.8;
    playerGroup.add(mainWing);

    const trailGeo = new THREE.PlaneGeometry(1.5, 10, 1, 10);
    const trailMat = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
    });
    playerTrail = new THREE.Mesh(trailGeo, trailMat);
    playerTrail.rotation.x = Math.PI / 2;
    playerTrail.position.z = -6;
    playerGroup.add(playerTrail);
    
    return playerGroup;
}


function createBackgroundTunnel() {
    const group = new THREE.Group();
    const tunnelGeo = new THREE.CylinderGeometry(80, 80, 4000, 32, 100, true);
    const tunnelMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true, side: THREE.BackSide, transparent: true, opacity: 0.1 });
    const tunnel1 = new THREE.Mesh(tunnelGeo, tunnelMat);
    tunnel1.rotation.x = Math.PI / 2;
    group.add(tunnel1);

    const tunnel2Geo = new THREE.CylinderGeometry(120, 120, 4000, 24, 100, true);
    const tunnel2Mat = new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true, side: THREE.BackSide, transparent: true, opacity: 0.08 });
    const tunnel2 = new THREE.Mesh(tunnel2Geo, tunnel2Mat);
    tunnel2.rotation.x = Math.PI / 2;
    group.add(tunnel2);

    return group;
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
    const mat = new THREE.PointsMaterial({ size: 0.5, vertexColors: true, transparent: true, opacity: 0.5, fog: false, blending: THREE.AdditiveBlending });
    return new THREE.Points(geo, mat);
}

function createStarBursts() {
    const geo = new THREE.BufferGeometry();
    const positions = [];
    const numPoints = 2000;
    for (let i = 0; i < numPoints; i++) {
        const side = Math.random() < 0.5 ? -1 : 1;
        const radius = 150 + Math.random() * 150;
        const angle = Math.random() * Math.PI * 2;
        const y = (Math.random() - 0.5) * 200;
        positions.push(Math.cos(angle) * radius * side, y, Math.sin(angle) * radius);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    
    const sprite = new THREE.TextureLoader().load('https://threejs.org/examples/textures/sprites/spark1.png');
    const mat = new THREE.PointsMaterial({
        size: 10, map: sprite, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0
    });
    return new THREE.Points(geo, mat);
}

function createPositiveBurst() {
    const geo = new THREE.BufferGeometry();
    const positions = [];
    const numPoints = 50;
    for (let i = 0; i < numPoints; i++) {
        positions.push(0,0,0);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ size: 0.5, color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, opacity: 0, fog: false });
    const burst = new THREE.Points(geo, mat);
    burst.velocities = [];
    for (let i = 0; i < numPoints; i++) {
        burst.velocities.push(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(Math.random() * 20));
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
    for(let i=0; i < positions.length; i++) {
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
        color: 0xffffff, size: 30, blending: THREE.AdditiveBlending, transparent: true, opacity: 0, map: new THREE.TextureLoader().load('https://threejs.org/examples/textures/sprites/rain.png')
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
    const smoothedEnergyMap = smoothArray(normalizedEnergyMap, 5);
    songData = { duration, energyMap: smoothedEnergyMap };
    
    trackCurve = createTrackPath(smoothedEnergyMap, duration);
    
    pregenerateBlocks(smoothedEnergyMap);
    
    if (trackGroup) scene.remove(trackGroup);
    trackGroup = createTrackMesh(trackCurve);
    scene.add(trackGroup);
}

function createTrackPath(energyMap: number[], duration: number): any {
    const points: any[] = [];
    const totalTrackLength = duration * 150; 
    
    let pos = new THREE.Vector3(0, 0, 0); 
    let vel = new THREE.Vector3(0, 0, 0);

    points.push(pos.clone());

    const turnInfluence = 3.0;
    const climbInfluence = 2.5;
    const damping = 0.96;
    const centeringForce = 0.003;

    for (let i = 0; i < energyMap.length; i++) {
        const energy = energyMap[i];
        
        const turnForce = Math.sin(i * 0.15) * energy * turnInfluence;
        const climbForce = (energy - 0.2) * climbInfluence; 
        
        const centerPullX = -pos.x * centeringForce;
        const centerPullY = -pos.y * centeringForce; 

        vel.x += turnForce + centerPullX;
        vel.y += climbForce + centerPullY;
        
        vel.multiplyScalar(damping);

        pos.x += vel.x;
        pos.y += vel.y;
        pos.z = -(i / energyMap.length) * totalTrackLength;
        
        points.push(pos.clone());
    }

    return new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
}

function createTrackMesh(curve: any) {
    const group = new THREE.Group();
    const segments = Math.floor(curve.points.length * 1.5);
    const roadWidth = NUM_LANES * LANE_WIDTH;

    const up = new THREE.Vector3(0, 1, 0);
    
    const curvePoints = curve.getPoints(segments);
    const leftRailPoints: any[] = [];
    const rightRailPoints: any[] = [];
    const leftLinePoints: any[] = [];
    const rightLinePoints: any[] = [];

    for (let i = 0; i < curvePoints.length; i++) {
        const point = curvePoints[i];
        const tangent = curve.getTangentAt(i / curvePoints.length).normalize();
        const binormal = new THREE.Vector3().crossVectors(up, tangent).normalize();

        const leftRailOffset = binormal.clone().multiplyScalar(-roadWidth / 2 - 0.2);
        const rightRailOffset = binormal.clone().multiplyScalar(roadWidth / 2 + 0.2);
        const leftLineOffset = binormal.clone().multiplyScalar(-LANE_WIDTH / 2);
        const rightLineOffset = binormal.clone().multiplyScalar(LANE_WIDTH / 2);

        leftRailPoints.push(point.clone().add(leftRailOffset));
        rightRailPoints.push(point.clone().add(rightRailOffset));
        leftLinePoints.push(point.clone().add(leftLineOffset));
        rightLinePoints.push(point.clone().add(rightLineOffset));
    }

    const railMat = new THREE.MeshStandardMaterial({ emissiveIntensity: 1.0, side: THREE.DoubleSide });
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });

    group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(leftRailPoints), segments, 0.2, 8, false), railMat.clone()));
    group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rightRailPoints), segments, 0.2, 8, false), railMat.clone()));
    group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(leftLinePoints), segments, 0.05, 8, false), lineMat.clone()));
    group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rightLinePoints), segments, 0.05, 8, false), lineMat.clone()));

    const roadGeo = new THREE.BufferGeometry();
    const vertices: number[] = [];
    for (let i = 0; i < curvePoints.length - 1; i++) {
        const p1 = curvePoints[i]; const t1 = curve.getTangentAt(i/curvePoints.length); const b1 = new THREE.Vector3().crossVectors(up,t1).normalize();
        const p2 = curvePoints[i+1]; const t2 = curve.getTangentAt((i+1)/curvePoints.length); const b2 = new THREE.Vector3().crossVectors(up,t2).normalize();
        const v1 = p1.clone().add(b1.clone().multiplyScalar(-roadWidth/2)); const v2 = p1.clone().add(b1.clone().multiplyScalar(roadWidth/2));
        const v3 = p2.clone().add(b2.clone().multiplyScalar(roadWidth/2)); const v4 = p2.clone().add(b2.clone().multiplyScalar(-roadWidth/2));
        vertices.push(v1.x, v1.y, v1.z,  v4.x, v4.y, v4.z,  v2.x, v2.y, v2.z, v2.x, v2.y, v2.z,  v4.x, v4.y, v4.z,  v3.x, v3.y, v3.z);
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

        loadingScreen.classList.add('hidden');
        scoreContainer.classList.remove('hidden');
        score = 0;
        playerProgress = 0;
        scoreEl.textContent = '0';
        gameStarted = true;
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
    const geometry = new THREE.BoxGeometry(LANE_WIDTH * 0.8, 1, 2);
    const material = new THREE.MeshStandardMaterial({ emissiveIntensity: 1.5 });
    return new THREE.Mesh(geometry, material);
}

function createGreyBlock() {
    const geometry = new THREE.BoxGeometry(LANE_WIDTH * 0.8, 3, 2);
    const material = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.5, roughness: 0.6 });
    return new THREE.Mesh(geometry, material);
}

function pregenerateBlocks(energyMap: number[]) {
    allBlocks.length = 0;
    let lastLane = 1;
    let consecutiveObstacles = 0;

    for (let i = 0; i < energyMap.length; i++) {
        const energy = energyMap[i];
        const progress = i / energyMap.length;

        const baseSpawnChance = 0.3;
        if (Math.random() > baseSpawnChance + energy * 0.6) continue;

        const isObstacleRun = energy > 0.6 && Math.random() < 0.4 && consecutiveObstacles < 2;
        const isMultiBlock = energy > 0.4 && Math.random() < energy;
        
        if (isObstacleRun) {
            const openLane = Math.floor(Math.random() * NUM_LANES);
            for (let lane = 0; lane < NUM_LANES; lane++) {
                if (lane !== openLane) {
                    allBlocks.push({ progress, lane, type: 'grey', mesh: null, collected: false });
                }
            }
            consecutiveObstacles++;
        } else if (isMultiBlock) {
            for (let lane = 0; lane < NUM_LANES; lane++) {
                if (Math.random() > 0.1) {
                    allBlocks.push({ progress, lane, type: 'color', mesh: null, collected: false });
                }
            }
            consecutiveObstacles = 0;
        } else {
            let lane;
            const laneChoice = Math.random();
            if (laneChoice < 0.6) lane = lastLane;
            else if (laneChoice < 0.8) lane = (lastLane + 1) % NUM_LANES;
            else lane = (lastLane + NUM_LANES - 1) % NUM_LANES;
            
            allBlocks.push({ progress, lane, type: 'color', mesh: null, collected: false });
            lastLane = lane;
            consecutiveObstacles = 0;
        }
    }
}

function updateBlocks() {
    const activationZone = playerProgress + BLOCK_VIEW_DISTANCE;
    const deactivationZone = playerProgress - 0.02;

    for (const block of allBlocks) {
        if (block.collected) continue;
        if (!block.mesh && block.progress > playerProgress && block.progress < activationZone) {
            block.mesh = getFromPool( block.type === 'color' ? colorBlockPool : greyBlockPool, block.type === 'color' ? createColorBlock : createGreyBlock );
        }
        if (block.mesh && block.progress < deactivationZone) { recycleToPool(block); }
        if (!block.mesh) continue;

        const point = trackCurve.getPointAt(block.progress);
        const tangent = trackCurve.getTangentAt(block.progress);
        const up = new THREE.Vector3(0, 1, 0);
        // CORRECTED BINORMAL FOR BLOCK PLACEMENT
        const binormal = new THREE.Vector3().crossVectors(tangent, up).normalize();
        point.add(binormal.multiplyScalar(LANE_POSITIONS[block.lane]));
        
        block.mesh.position.copy(point);
        block.mesh.lookAt(trackCurve.getPointAt(Math.min(block.progress + 0.01, 1)));
    }
}

function checkCollisions() {
    const collisionThreshold = 0.005; 
    for (const block of allBlocks) {
        if (block.mesh && !block.collected && Math.round(actualPlayerLane) === block.lane && Math.abs(block.progress - playerProgress) < collisionThreshold) {
            if (block.type === 'color') {
                score += 10;
                triggerPositiveBurst(block.mesh.position, block.mesh.material.color);
            } else {
                score = Math.max(0, score - 25);
                shakeTime = 0.4;
                shakeIntensity = 0.3;
                vignette.style.opacity = '1';
                setTimeout(() => { vignette.style.opacity = '0'; }, 100);
            }
            scoreEl.textContent = score.toString();
            block.collected = true; 
            recycleToPool(block);
        }
    }
}

function updateSceneColors(energy: number) {
    const calmColor = new THREE.Color(0x0077ff);    // Vibrant Blue
    const midColor = new THREE.Color(0xffa500);     // Orange
    const intenseColor = new THREE.Color(0xdc143c); // Crimson Red

    let finalColor = new THREE.Color();
    if (energy < 0.25) {
        finalColor.set(0x002266).lerp(calmColor, energy / 0.25);
    } else if (energy < 0.55) {
        finalColor.set(calmColor).lerp(midColor, (energy - 0.25) / 0.3);
    } else {
        finalColor.set(midColor).lerp(intenseColor, Math.min((energy - 0.55) / 0.45, 1.0));
    }
    
    composer.passes[1].strength = 0.8 + energy * 1.5;
    
    const lerpFactor = 0.05;
    
    if (trackGroup && playerTrail && backgroundTunnel) {
        trackGroup.children.forEach((child: any) => {
            if (child.material && (child.geometry.type !== 'TubeGeometry' || child.material.emissive)) {
                child.material.color.lerp(finalColor, lerpFactor);
            }
            if (child.material.emissive) { child.material.emissive.lerp(finalColor, lerpFactor); }
        });

        playerTrail.material.color.lerp(finalColor, lerpFactor);
        backgroundTunnel.children.forEach(c => c.material.color.lerp(finalColor, lerpFactor));
    }
    scene.fog.color.lerp(finalColor, lerpFactor);
}

const clock = new THREE.Clock();
function animate() {
    animationFrameId = requestAnimationFrame(animate);
    const deltaTime = clock.getDelta();

    if (gameStarted && trackCurve && songData) {
        playerProgress = Math.min(audioContext.currentTime / songData.duration, 1.0);

        const energyIndex = Math.min(Math.floor(playerProgress * songData.energyMap.length), songData.energyMap.length - 1);
        const currentEnergy = songData.energyMap[energyIndex] || 0;

        const currentPoint = trackCurve.getPointAt(playerProgress);
        const tangent = trackCurve.getTangentAt(playerProgress).normalize();
        
        // 1. Determine target lane from keyboard controls
        if (keyState.left) {
            targetPlayerLane = 0; // Left lane
        } else if (keyState.right) {
            targetPlayerLane = 2; // Right lane
        } else {
            targetPlayerLane = 1; // Center lane
        }

        // 2. Smoothly move towards target lane
        actualPlayerLane = THREE.MathUtils.lerp(actualPlayerLane, targetPlayerLane, 0.15);

        // 3. Calculate Player's position
        const up = new THREE.Vector3(0, 1, 0);
        // CORRECTED: Flipped cross product to fix inverted controls
        const binormal = new THREE.Vector3().crossVectors(tangent, up).normalize();
        // Use lerp to find the exact position between lanes
        const laneOffsetValue = THREE.MathUtils.lerp(LANE_POSITIONS[0], LANE_POSITIONS[2], actualPlayerLane / 2);
        const finalLaneOffset = binormal.clone().multiplyScalar(laneOffsetValue);
        player.position.copy(currentPoint).add(finalLaneOffset);
        
        // 4. Update player orientation
        const lookAtPoint = trackCurve.getPointAt(Math.min(playerProgress + 0.01, 1));
        player.lookAt(lookAtPoint);

        // 5. CAMERA LOGIC REWRITE - CRITICAL FIX
        const backwardsOffset = tangent.clone().multiplyScalar(-15.0);
        const upOffset = new THREE.Vector3(0, 6.0, 0);
        
        const idealCameraPos = player.position.clone().add(backwardsOffset).add(upOffset);
        camera.position.lerp(idealCameraPos, 0.15);
        
        // "Nail" the camera to the player's back for a stable third-person view
        camera.lookAt(player.position);
        
        // Camera Shake
        if (shakeTime > 0) {
            camera.position.x += (Math.random() - 0.5) * shakeIntensity;
            camera.position.y += (Math.random() - 0.5) * shakeIntensity;
            shakeTime -= deltaTime;
        } else {
            shakeIntensity = 0;
        }

        // DYNAMIC FOV for speed effect
        camera.fov = 75 + currentEnergy * 25;
        camera.updateProjectionMatrix();

        // Update other scene elements
        analyser.getByteFrequencyData(frequencyData);
        const bass = (frequencyData[1] + frequencyData[2]) / 2 / 255;
        trackGroup.children.forEach((c: any) => { if(c.material?.emissive) c.material.emissiveIntensity = 0.8 + bass * 2.0;});
        
        backgroundTunnel.rotation.z += (0.001 + bass * 0.005);
        nebulaParticles.position.z = camera.position.z - 300;
        starBursts.position.z = camera.position.z - 500;
        meteorShower.position.z = camera.position.z - 500;
        
        // Update high-energy FX
        starBursts.material.opacity = THREE.MathUtils.lerp(starBursts.material.opacity, currentEnergy > 0.6 ? (currentEnergy-0.6)*2 : 0, 0.1);
        meteorShower.visible = currentEnergy > 0.75;
        if(meteorShower.visible) {
            meteorShower.material.opacity = Math.min((currentEnergy - 0.75)*4, 1.0);
            const positions = meteorShower.geometry.attributes.position.array;
            for(let i=0; i < positions.length/3; i++){
                positions[i*3+1] -= (10 + currentEnergy * 20) * deltaTime; // Move down
                if(positions[i*3+1] < -200) positions[i*3+1] = 200; // Reset
            }
            meteorShower.geometry.attributes.position.needsUpdate = true;
        }

        // Update positive burst effect
        if(positiveBurst.visible) {
            const positions = positiveBurst.geometry.attributes.position.array;
            for(let i=0; i<positiveBurst.velocities.length; i++) {
                positions[i*3] += positiveBurst.velocities[i].x * deltaTime;
                positions[i*3+1] += positiveBurst.velocities[i].y * deltaTime;
                positions[i*3+2] += positiveBurst.velocities[i].z * deltaTime;
            }
            positiveBurst.geometry.attributes.position.needsUpdate = true;
            positiveBurst.material.opacity -= 2.0 * deltaTime;
            if(positiveBurst.material.opacity <= 0) positiveBurst.visible = false;
        }

        for (const block of allBlocks) {
            if (block.mesh && block.type === 'color') {
                const h = 0.6 - (currentEnergy * 0.6); // cyan to red
                block.mesh.material.color.setHSL(h, 1, 0.6);
                block.mesh.material.emissive.setHSL(h, 1, 0.5);
                block.mesh.scale.y = 1 + currentEnergy * 2;
            }
        }

        updateSceneColors(currentEnergy);
        updateBlocks();
        checkCollisions();
    } else {
        backgroundTunnel.children[0].rotation.z += 0.0005;
        backgroundTunnel.children[1].rotation.z -= 0.0003;
    }
    composer.render();
}

function endGame() {
    if (!gameStarted) return;
    gameStarted = false;
    scoreContainer.classList.add('hidden');
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
