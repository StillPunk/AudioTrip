import * as THREE from 'three';
import { state } from '@/shared/model/gameState';
import * as config from '@/shared/config';
import * as audio from '@/entities/audio';
import * as ui from '@/entities/ui';
import * as graphics from '@/entities/graphics';
import * as utils from '@/shared/lib/utils';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export function trySpawnWhiteHole() {
    const isRankHighEnough = state.currentRankIndex >= 4;
    if (!state.isSketchModeActive &&
        state.audioContext.currentTime > state.nextWormholeSpawnTime &&
        isRankHighEnough &&
        !state.hasSketchModeBeenTriggeredThisSong) {
        const wormholeMesh = utils.getFromPool(state.wormholePool, () => graphics.createWormholeMesh(false));
        const SPAWN_TIME_AHEAD = 2.0;
        const progress = Math.min(state.playerProgress + (SPAWN_TIME_AHEAD / state.songData.duration), 1.0);
        state.specialEventObjects.push({
            progress: progress,
            type: 'white_hole',
            mesh: wormholeMesh,
            collected: false
        });
        state.nextWormholeSpawnTime = state.audioContext.currentTime + 20 + Math.random() * 20;
    }
}
export function updateSpecialEvents() {
    for (const event of state.specialEventObjects) {
        if (event.collected || !event.mesh)
            continue;
        const frame = utils.getInterpolatedFrame(event.progress);
        const point = frame.point.clone();
        event.mesh.position.copy(point);
        event.mesh.rotation.x += 0.05;
        event.mesh.rotation.y += 0.02;
        event.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), frame.tangent);
        if (state.playerProgress > event.progress + 0.01) {
            event.collected = true;
            utils.recycleObject(event.mesh, state.wormholePool);
        }
    }
}
export function checkSpecialCollisions() {
    for (const event of state.specialEventObjects) {
        if (event.collected)
            continue;
        if (state.playerProgress >= event.progress && state.lastPlayerProgress < event.progress) {
            event.collected = true;
            utils.recycleObject(event.mesh, state.wormholePool);
            if (event.type === 'white_hole') {
                state.isSketchModeActive = true;
                state.sketchModeTimer = config.SKETCH_MODE_DURATION;
                state.sketchPass.enabled = true;
                state.hasSketchModeBeenTriggeredThisSong = true;
                const exitProgress = state.playerProgress + ((config.SKETCH_MODE_DURATION - 1) / state.songData.duration);
                const exitHoleMesh = utils.getFromPool(state.wormholePool, () => graphics.createWormholeMesh(true));
                state.specialEventObjects.push({
                    progress: exitProgress,
                    type: 'black_hole',
                    mesh: exitHoleMesh,
                    collected: false
                });
            }
            else if (event.type === 'black_hole') {
                state.isSketchModeActive = false;
                state.sketchModeTimer = 0;
                state.sketchPass.enabled = false;
            }
        }
    }
    for (let i = state.specialEventObjects.length - 1; i >= 0; i--) {
        if (state.specialEventObjects[i].collected) {
            state.specialEventObjects.splice(i, 1);
        }
    }
}
export async function onFileSelect(event: Event) {
    if (state.menuMusic) {
        state.menuMusic.pause();
    }
    if (state.menuMusicSource) {
        if (state.menuMusicGain && state.systemAudioCtx) {
            state.menuMusicGain.gain.linearRampToValueAtTime(0, state.systemAudioCtx.currentTime + 0.5);
        }
        setTimeout(() => {
            if (state.menuMusicSource) {
                try {
                    state.menuMusicSource.stop();
                }
                catch { }
                state.menuMusicSource = null;
            }
        }, 500);
    }
    state.menuActive = false;
    audio.soundManager.playSound('characterselect');
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file)
        return;
    state.currentTrackName = file.name.replace(/\.[^/.]+$/, "");
    state.currentVideoId = `local_${file.name}_${file.size}`;
    if (state.equalizerGroup) {
        state.equalizerGroup.visible = false;
    }
    ui.setScreenLoading();
    
    
    
    requestAnimationFrame(async () => {
        // loadingText.classList.add('hidden');
        // analysisText.classList.remove('hidden');
        if (!state.cityEnvironmentInitialized) {
            graphics.createCityEnvironment();
            state.cityEnvironmentInitialized = true;
        }
        if (!state.solarSystemEnvironmentInitialized) {
            await graphics.createSolarSystemEnvironment();
            state.solarSystemEnvironmentInitialized = true;
        }
        await graphics.forceGpuPrewarm().then(() => {
            const searchAndPreload = (query: string) => {
                if (!query) {
                    console.warn("[ПОИСК] Не удалось сформировать поисковый запрос.");
                    return;
                }
                const cleanedQuery = utils.cleanSearchQuery(query);
                console.log(`[ПОИСК] Отправляю ОЧИЩЕННЫЙ запрос на сервер: "${cleanedQuery}"`);
                fetch(`https://audiotrip.space/search-video?q=${encodeURIComponent(cleanedQuery)}`)
                    .then(response => {
                    if (response.ok)
                        return response.json();
                    throw new Error('Клип не найден сервером.');
                })
                    .then(result => {
                    console.log("[ПОИСК] Успешно найден URL клипа:", result.videoUrl);
                    state.videoUrl = result.videoUrl;
                    graphics.preloadVideoScreens();
                })
                    .catch(error => console.warn(error.message));
            };
            jsmediatags.read(file, {
                onSuccess: (tag: any) => {
                    const tags = tag.tags;
                    let rawQuery = '';
                    if (tags.artist && tags.title) {
                        rawQuery = `${tags.artist} - ${tags.title}`;
                    }
                    else {
                        rawQuery = file.name;
                    }
                    searchAndPreload(rawQuery);
                },
                onError: (error: any) => {
                    console.warn(`[ПОИСК] Ошибка чтения тегов. Использую имя файла.`, error);
                    searchAndPreload(file.name);
                }
            });
            async function analyzeAndPlayAudio(audioFile: File) {
                try {
                    const arrayBuffer = await audioFile.arrayBuffer();
                    await analyzeAudioAndGenerateTrack(arrayBuffer.slice(0));
                    // analysisText.classList.add('hidden');
                    // loadingText.classList.remove('hidden');
                    audio.setupAndPlayAudio(arrayBuffer);
                }
                catch (error) {
                    console.error("Критическая ошибка при обработке файла:", error);
                    alert(ui.t('error_process'));
                    location.reload();
                }
            }
            analyzeAndPlayAudio(file);
        });
    });
}
export async function onSongSelectFromSearch(song: {
    title: string;
    videoId: string;
}) {
    if (state.menuMusic) {
        state.menuMusic.pause();
    }
    if (state.menuMusicSource) {
        if (state.menuMusicGain && state.systemAudioCtx) {
            state.menuMusicGain.gain.linearRampToValueAtTime(0, state.systemAudioCtx.currentTime + 0.5);
        }
        setTimeout(() => {
            if (state.menuMusicSource) {
                try {
                    state.menuMusicSource.stop();
                }
                catch { }
                state.menuMusicSource = null;
            }
        }, 500);
    }
    state.menuActive = false;
    state.currentTrackName = song.title;
    audio.soundManager.playSound('characterselect');
    ui.hideSearchResults();
    
    if (state.equalizerGroup) {
        state.equalizerGroup.visible = false;
    }
    ui.setScreenLoading();
    
    
    
    requestAnimationFrame(async () => {
        ui.setLoadingTrack(song.title);
        // analysisText.classList.remove('hidden');
        // loadingText.classList.add('hidden');
        try {
            console.log(`[Frontend] Ищу видео для: ${song.title}`);
            const findResponse = await fetch(`https://audiotrip.space/search-video?q=${encodeURIComponent(song.title)}`);
            if (!findResponse.ok) {
                const errorText = await findResponse.text();
                throw new Error(ui.t('error_server') + errorText);
            }
            const videoData = await findResponse.json();
            state.currentVideoId = videoData.videoId;
            state.videoUrl = videoData.videoUrl;
            console.log(`[Frontend] Найдено видео: ${state.videoUrl}`);
            if (!state.cityEnvironmentInitialized) {
                graphics.createCityEnvironment();
                state.cityEnvironmentInitialized = true;
            }
            if (!state.solarSystemEnvironmentInitialized) {
                await graphics.createSolarSystemEnvironment();
                state.solarSystemEnvironmentInitialized = true;
            }
            await graphics.preloadVideoScreens();
            await graphics.forceGpuPrewarm();
            ui.setLoadingTrack(song.title);
            await new Promise(resolve => requestAnimationFrame(resolve));
            const audioResponse = await fetch(`https://audiotrip.space/get-audio?videoId=${state.currentVideoId}`);
            if (!audioResponse.ok) {
                throw new Error(`Сервер не смог отдать аудио`);
            }
            const arrayBuffer = await audioResponse.arrayBuffer();
            ui.setAnalysisState();
            await analyzeAudioAndGenerateTrack(arrayBuffer.slice(0));
            // analysisText.classList.add('hidden');
            // loadingText.classList.remove('hidden');
            audio.setupAndPlayAudio(arrayBuffer);
        }
        catch (error) {
            console.error("Критическая ошибка при обработке выбранной песни:", error);
            alert(ui.t('error_general'));
            location.reload();
        }
    });
}
export async function analyzeAudioAndGenerateTrack(arrayBuffer: ArrayBuffer) {
    const audioCtx = new (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext)(1, arrayBuffer.byteLength, 44100);
    const buffer = await audioCtx.decodeAudioData(arrayBuffer);
    const pcmData = buffer.getChannelData(0);
    const duration = buffer.duration;
    const numChunks = Math.floor(pcmData.length / config.ANALYSIS_CHUNK_SAMPLES);
    const energyMap: number[] = [];
    let maxRms = 0;
    for (let i = 0; i < numChunks; i++) {
        let sumOfSquares = 0;
        for (let j = 0; j < config.ANALYSIS_CHUNK_SAMPLES; j++) {
            const sample = pcmData[i * config.ANALYSIS_CHUNK_SAMPLES + j];
            sumOfSquares += sample * sample;
        }
        const rms = Math.sqrt(sumOfSquares / config.ANALYSIS_CHUNK_SAMPLES);
        if (rms > maxRms)
            maxRms = rms;
        energyMap.push(rms);
    }
    if (maxRms === 0)
        maxRms = 1;
    const normalizedEnergyMap = energyMap.map(rms => (rms / maxRms));
    const smoothedEnergyMap = utils.smoothArray(normalizedEnergyMap, 3);
    state.songData = { duration, energyMap: smoothedEnergyMap };
    state.trackCurve = createTrackPath(smoothedEnergyMap, duration);
    const trackSegments = Math.floor(duration * 30);
    state.trackFrames = generateTrackFrames(state.trackCurve, smoothedEnergyMap, trackSegments);
    pregenerateBlocks(smoothedEnergyMap);
    graphics.pregenerateEnvironmentElements(smoothedEnergyMap, duration);
    if (state.trackGroup)
        state.scene.remove(state.trackGroup);
    state.trackGroup = createTrackMesh(state.trackFrames);
    state.scene.add(state.trackGroup);
    graphics.generateTunnels();
}
export function generateTrackFrames(curve: THREE.CatmullRomCurve3, energyMap: number[], segments: number) {
    const frames: { point: THREE.Vector3; tangent: THREE.Vector3; normal: THREE.Vector3; binormal: THREE.Vector3 }[] = [];
    let lastUp = new THREE.Vector3(0, 1, 0);
    const INTENSE_ROLL_THRESHOLD = 0.85;
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
        if (isNaN(preRollNormal.x)) {
            preRollNormal.set(1, 0, 0);
        }
        const hillOffset = Math.sin(i * HILL_FREQUENCY) * energy * HILL_AMPLITUDE;
        point.add(preRollNormal.clone().multiplyScalar(hillOffset));
        const turnInfluence = Math.sin(progress * energyMap.length * 0.08);
        let rollDelta = 0;
        if (energy > INTENSE_ROLL_THRESHOLD) {
            const rollIntensity = (energy - INTENSE_ROLL_THRESHOLD) / (1.0 - INTENSE_ROLL_THRESHOLD);
            const MAX_ROLL = 1.0;
            rollDelta = turnInfluence * rollIntensity * -1.5;
            if (rollDelta > MAX_ROLL)
                rollDelta = MAX_ROLL;
            if (rollDelta < -MAX_ROLL)
                rollDelta = -MAX_ROLL;
        }
        const normal = lastUp.clone();
        normal.projectOnPlane(tangent).normalize();
        if (normal.lengthSq() < 0.001) {
            normal.copy(lastUp);
        }
        else {
            normal.normalize();
        }
        normal.applyAxisAngle(tangent, rollDelta);
        const binormal = new THREE.Vector3().crossVectors(tangent, normal);
        frames.push({ point, tangent, normal, binormal });
        lastUp = normal;
    }
    return frames;
}
export function createTrackPath(energyMap: number[], duration: number): THREE.CatmullRomCurve3 {
    const points: THREE.Vector3[] = [];
    const pos = new THREE.Vector3(0, 0, 0);
    const vel = new THREE.Vector3(0, 0, 0);
    points.push(pos.clone());
    const baseSegmentLengthPerSecond = 110;
    const PATH_SCALE = 0.55;
    const turnInfluence = 4.0;
    const climbInfluence = 3.5;
    const damping = 0.96;
    const baseCenteringForce = 0.003;
    const timePerSegment = duration / energyMap.length;
    const MAX_LATERAL_VELOCITY = 7.0;
    const MAX_SPEED_ENERGY_CAP = 0.65;
    for (let i = 0; i < energyMap.length; i++) {
        const energy = energyMap[i];
        const speedEnergy = Math.min(energy, MAX_SPEED_ENERGY_CAP);
        const speedMultiplier = 0.5 + speedEnergy * 2.5;
        const segmentLength = baseSegmentLengthPerSecond * timePerSegment * speedMultiplier;
        const effectMultiplier = Math.min(1.0, Math.max(0, (energy - 0.3) / 0.6));
        const turnForce = Math.sin(i * 0.15) * energy * turnInfluence * effectMultiplier * PATH_SCALE;
        const climbForce = (energy - 0.2) * climbInfluence * effectMultiplier * PATH_SCALE;
        let centeringForce = baseCenteringForce;
        if (Math.abs(pos.x) > 200 || Math.abs(pos.y) > 200) {
            centeringForce *= 2.5;
        }
        const centerPullX = -pos.x * centeringForce;
        const centerPullY = -pos.y * centeringForce;
        vel.x += turnForce + centerPullX;
        vel.y += climbForce + centerPullY;
        vel.multiplyScalar(damping);
        vel.clampLength(0, MAX_LATERAL_VELOCITY);
        pos.x += vel.x * PATH_SCALE;
        pos.y += vel.y * PATH_SCALE;
        pos.z -= segmentLength;
        points.push(pos.clone());
    }
    return new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
}
export function createTrackMesh(frames: any[]) {
    const group = new THREE.Group();
    const segments = frames.length - 1;
    const roadWidth = config.NUM_LANES * config.LANE_WIDTH;
    const leftRailPoints: THREE.Vector3[] = [];
    const rightRailPoints: THREE.Vector3[] = [];
    const leftLinePoints: THREE.Vector3[] = [];
    const rightLinePoints: THREE.Vector3[] = [];
    for (let i = 0; i < frames.length; i++) {
        const { point, binormal } = frames[i];
        const leftRailOffset = binormal.clone().multiplyScalar(-roadWidth / 2 - 0.2);
        const rightRailOffset = binormal.clone().multiplyScalar(roadWidth / 2 + 0.2);
        const leftLineOffset = binormal.clone().multiplyScalar(-config.LANE_WIDTH / 2);
        const rightLineOffset = binormal.clone().multiplyScalar(config.LANE_WIDTH / 2);
        leftRailPoints.push(point.clone().add(leftRailOffset));
        rightRailPoints.push(point.clone().add(rightRailOffset));
        leftLinePoints.push(point.clone().add(leftLineOffset));
        rightLinePoints.push(point.clone().add(rightLineOffset));
    }
    const railMat = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.clone(config.RailEqualizerMaterial.uniforms),
        vertexShader: config.RailEqualizerMaterial.vertexShader,
        fragmentShader: config.RailEqualizerMaterial.fragmentShader,
        side: THREE.DoubleSide
    });
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const leftRail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(leftRailPoints), segments, 0.2, 8, false), railMat.clone());
    leftRail.name = 'leftRail';
    leftRail.userData.originalVertices = leftRail.geometry.attributes.position.clone();
    leftRail.userData.isDeformed = false;
    leftRail.layers.enable(config.BLOOM_SCENE);
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
export function createColorBlock() {
    const blockWidth = 1.5;
    const geometry = new RoundedBoxGeometry(blockWidth, blockWidth, blockWidth * 2, 6, 0.5);
    const material = new THREE.MeshBasicMaterial({ fog: false });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.layers.enable(config.BLOOM_SCENE);
    return mesh;
}
export function createObstacleBlock() {
    const group = new THREE.Group();
    const blockWidth = 1.5;
    const geometry = new RoundedBoxGeometry(blockWidth, blockWidth, blockWidth * 2, 6, 0.5);
    const coreMaterial = new THREE.MeshStandardMaterial({
        color: 0x000000,
        roughness: 0.2,
        metalness: 0.1,
    });
    const coreMesh = new THREE.Mesh(geometry, coreMaterial);
    group.add(coreMesh);
    const outlineMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.BackSide,
        toneMapped: false,
    });
    const outlineMesh = new THREE.Mesh(geometry, outlineMaterial);
    outlineMesh.scale.set(1.08, 1.08, 1.08);
    outlineMesh.layers.enable(config.BLOOM_SCENE);
    group.add(outlineMesh);
    return group;
}
export function updateBlockMovement(deltaTime: number, currentEnergy: number) {
    const playerProgressPerSecond = 1.0 / state.songData.duration;
    const playerProgressThisFrame = playerProgressPerSecond * deltaTime;
    const blockSpeedFactor = THREE.MathUtils.lerp(config.MAX_BLOCK_SPEED_FACTOR, config.MIN_BLOCK_SPEED_FACTOR, currentEnergy);
    const blockProgressThisFrame = playerProgressThisFrame * blockSpeedFactor;
    for (const block of state.allBlocks) {
        if (!block.collected) {
            block.progress += blockProgressThisFrame;
        }
    }
}
export function pregenerateBlocks(energyMap: number[]) {
    state.allBlocks.length = 0;
    let lastLane = 1;
    let consecutiveObstacles = 0;
    // Базовый шанс появления препятствия
    const BASE_OBSTACLE_CHANCE = 0.1;
    // Насколько сложность растет к концу трека (шанс увеличится на 15%)
    const PROGRESSIVE_DIFFICULTY_FACTOR = 0.15;
    // Порог энергии для "усиленных" препятствий
    const HIGH_ENERGY_THRESHOLD = 0.7;
    // Шанс, что при высокой энергии появится "стенка" из двух блоков вместо одного
    const OBSTACLE_RUN_CHANCE_MODIFIER = 0.4;
    for (let i = 0; i < energyMap.length; i++) {
        const energy = energyMap[i];
        const progress = i / energyMap.length;
        const spawnChance = energy * 0.5;
        if (Math.random() > spawnChance) {
            continue;
        }
        const currentObstacleChance = BASE_OBSTACLE_CHANCE + progress * PROGRESSIVE_DIFFICULTY_FACTOR;
        if (Math.random() < currentObstacleChance && consecutiveObstacles < 2) {
            consecutiveObstacles++;
            const timeAtThisEnergyStep = i * (state.songData.duration / energyMap.length);
            const blockProgress = (timeAtThisEnergyStep + 0.5) / state.songData.duration;
            if (blockProgress >= 1.0)
                continue;
            if (energy > HIGH_ENERGY_THRESHOLD && Math.random() < OBSTACLE_RUN_CHANCE_MODIFIER) {
                const openLane = Math.floor(Math.random() * config.NUM_LANES);
                for (let lane = 0; lane < config.NUM_LANES; lane++) {
                    if (lane !== openLane) {
                        state.allBlocks.push({ progress: blockProgress, lane, type: 'obstacle', mesh: null, collected: false });
                    }
                }
            }
            else {
                const lane = Math.floor(Math.random() * config.NUM_LANES);
                state.allBlocks.push({ progress: blockProgress, lane, type: 'obstacle', mesh: null, collected: false });
            }
            lastLane = -1;
        }
        else {
            consecutiveObstacles = 0;
            const timeAtThisEnergyStep = i * (state.songData.duration / energyMap.length);
            const blockProgress = (timeAtThisEnergyStep + 0.5) / state.songData.duration;
            if (blockProgress >= 1.0)
                continue;
            const isMultiBlock = energy > 0.4 && Math.random() < (energy - 0.4);
            if (isMultiBlock) {
                const numBlocksToSpawn = Math.random() < 0.5 ? 1 : 2;
                const availableLanes = [0, 1, 2];
                for (let k = availableLanes.length - 1; k > 0; k--) {
                    const j = Math.floor(Math.random() * (k + 1));
                    [availableLanes[k], availableLanes[j]] = [availableLanes[j], availableLanes[k]];
                }
                for (let k = 0; k < numBlocksToSpawn; k++) {
                    state.allBlocks.push({ progress: blockProgress, lane: availableLanes[k], type: 'color', mesh: null, collected: false });
                }
            }
            else {
                if (lastLane === -1) {
                    lastLane = Math.floor(Math.random() * config.NUM_LANES);
                }
                let lane;
                const laneChoice = Math.random();
                if (laneChoice < 0.6)
                    lane = lastLane;
                else if (laneChoice < 0.8)
                    lane = (lastLane + 1) % config.NUM_LANES;
                else
                    lane = (lastLane + config.NUM_LANES - 1) % config.NUM_LANES;
                state.allBlocks.push({ progress: blockProgress, lane, type: 'color', mesh: null, collected: false });
                lastLane = lane;
            }
        }
    }
}
export function updateBlocks() {
    const activationZone = state.playerProgress + config.BLOCK_VIEW_DISTANCE;
    const deactivationZone = state.playerProgress - 0.02;
    const rotationMatrix = new THREE.Matrix4();
    const OBSTACLE_HOVER_HEIGHT = 1.0;
    const COLOR_BLOCK_HOVER_HEIGHT = 0.8;
    for (const block of state.allBlocks) {
        if (block.collected)
            continue;
        if (!block.mesh && block.progress > state.playerProgress && block.progress < activationZone) {
            block.mesh = utils.getFromPool(block.type === 'color' ? state.colorBlockPool : state.obstaclePool, block.type === 'color' ? createColorBlock : createObstacleBlock);
        }
        if (block.mesh && block.progress < deactivationZone) {
            utils.recycleToPool(block);
        }
        if (!block.mesh)
            continue;
        const frame = utils.getInterpolatedFrame(block.progress);
        const point = state._reusableVector1.copy(frame.point);
        const horizontalOffset = state._reusableVector2.copy(frame.binormal).multiplyScalar(config.LANE_POSITIONS[block.lane]);
        const height = block.type === 'obstacle' ? OBSTACLE_HOVER_HEIGHT : COLOR_BLOCK_HOVER_HEIGHT;
        const verticalOffset = state._reusableVector3.copy(frame.normal).multiplyScalar(height);
        point.add(horizontalOffset).add(verticalOffset);
        block.mesh.position.copy(point);
        rotationMatrix.makeBasis(frame.tangent, frame.normal, frame.binormal);
        block.mesh.quaternion.setFromRotationMatrix(rotationMatrix);
    }
}
export function checkCollisions() {
    for (const block of state.allBlocks) {
        if (block.mesh && !block.collected && Math.round(state.actualPlayerLane) === block.lane) {
            if (state.lastPlayerProgress < block.progress && state.playerProgress >= block.progress) {
                if (block.type === 'color') {
                    audio.soundManager.playSound('collision_color');
                    state.consecutiveHits++;
                    state.lastHitTime = state.audioContext.currentTime;
                    recalculateRank();
                    const baseMultiplier = state.currentRankIndex > -1 ? config.STYLE_RANKS[state.currentRankIndex].multiplier : 1;
                    const finalMultiplier = state.isSketchModeActive ? 20 : baseMultiplier;
                    state.score += 10 * finalMultiplier;
                    graphics.triggerPositiveBurst(block.mesh.position, block.mesh.material.color);
                }
                else {
                    if (!state.isSketchModeActive && !state.hyperspaceEffect.active) {
                        if (state.consecutiveHits > state.maxCombo) {
                            state.maxCombo = state.consecutiveHits;
                        }
                        state.totalMisses++;
                        audio.soundManager.playSound('collision_stone');
                        try {
                            (window as any).Telegram.WebApp.HapticFeedback.impactOccurred('heavy');
                        }
                        catch { }
                        state.consecutiveHits = 0;
                        state.score = Math.max(0, state.score - 100);
                        // Логика понижения ранга
                        if (state.currentRankIndex >= 4) { // Если ранг S, SS или SSS
                            state.currentRankIndex = 2; // Падаем до B (индекс 2)
                        }
                        else if (state.currentRankIndex > 0) { // Если C, B, A
                            state.currentRankIndex -= 2; // Падаем на 2 ранга
                        }
                        else { // Если D или нет ранга
                            state.currentRankIndex = -1; // Полный сброс
                        }
                        state.shakeTime = 0.4;
                        state.shakeIntensity = 0.3;
                        ui.setVignetteFlash();
                    }
                }
                ui.setScore(state.score);
                ui.updateStyleUI();
                block.collected = true;
                utils.recycleToPool(block);
            }
        }
    }
}
export function recalculateRank() {
    let newRankIndex = -1;
    for (let i = config.STYLE_RANKS.length - 1; i >= 0; i--) {
        if (state.consecutiveHits >= config.STYLE_RANKS[i].hitsNeeded) {
            newRankIndex = i;
            break;
        }
    }
    state.currentRankIndex = newRankIndex;
}
export async function endGame() {
    if (!state.gameStarted)
        return;
    state.gameStarted = false;
    if (state.consecutiveHits > state.maxCombo) {
        state.maxCombo = state.consecutiveHits;
    }
    function calculatePerformanceRank(): string {
        if (state.rankHistory.length === 0)
            return 'D';
        const averageRankIndex = state.rankHistory.reduce((a, b) => a + b, 0) / state.rankHistory.length;
        const penalty = state.totalMisses * 0.15;
        const finalRankValue = averageRankIndex - penalty;
        if (finalRankValue >= 5.5)
            return 'SSS';
        if (finalRankValue >= 4.5)
            return 'SS';
        if (finalRankValue >= 3.5)
            return 'S';
        if (finalRankValue >= 2.5)
            return 'A';
        if (finalRankValue >= 1.5)
            return 'B';
        if (finalRankValue >= 0.5)
            return 'C';
        return 'D';
    }
    const performanceRank = calculatePerformanceRank();
    const gameData = {
        userId: state.telegramUserId,
        trackName: state.currentTrackName,
        videoId: state.currentVideoId,
        score: state.score,
        rank: performanceRank,
        maxCombo: state.maxCombo,
        misses: state.totalMisses
    };
    try {
        console.log('[API] Отправляю результаты игры на сервер:', gameData);
        const response = await fetch('https://audiotrip.space/api/game-end', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(gameData),
        });
        if (response.ok) {
            console.log('[API] Результаты успешно сохранены.');
            ui.loadTotalScore();
        }
        else {
            console.error('[API] Ошибка при сохранении результатов:', await response.json());
        }
    }
    catch (error) {
        console.error('[API] Не удалось подключиться к серверу для сохранения результатов:', error);
    }
    
    
    ui.setFinalScore(state.score);
    ui.setScreenEnd();
    cancelAnimationFrame(state.animationFrameId);
    state.videoElements.forEach(video => {
        video.pause();
        video.src = '';
        video.remove();
    });
    state.videoElements.length = 0;
    if (state.videoScreensGroup) {
        while (state.videoScreensGroup.children.length > 0) {
            state.videoScreensGroup.remove(state.videoScreensGroup.children[0]);
        }
    }
    // if(videoScreensGroup) camera.remove(videoScreensGroup);
    state.isARankEffectActive = false;
}