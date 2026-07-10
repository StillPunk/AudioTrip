import * as THREE from 'three';
import { gsap } from 'gsap';
import { state } from './state';
import * as config from './config';
import * as audio from './audio';
import * as ui from './ui';
import * as graphics from './graphics';
import * as game from './game';
import * as utils from './utils';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

async function init() {
    ui.initLocalization();
    const urlParams = new URLSearchParams(window.location.search);
    const debugMode = urlParams.get('debug_admin');
    const unlockAudioHandler = () => {
        console.log("[Audio] Unlocking iOS Audio...");
        audio.initSystemAudio();
        audio.soundManager.loadSounds();
        document.removeEventListener('touchstart', unlockAudioHandler);
        document.removeEventListener('click', unlockAudioHandler);
    };
    document.addEventListener('touchstart', unlockAudioHandler, { once: true, passive: false });
    document.addEventListener('click', unlockAudioHandler, { once: true });
    if (debugMode === 'true') {
        state.telegramUserId = 'user123';
        console.log(`[Debug] User ID установлен принудительно: ${state.telegramUserId}`);
    }
    else {
        try {
            const tg = window.Telegram?.WebApp;
            const platform = tg?.platform;
            const userId = tg?.initDataUnsafe?.user?.id;
            if (userId && platform !== 'web' && platform !== 'weba') {
                state.telegramUserId = window.Telegram.WebApp.initDataUnsafe.user.id.toString();
                console.log(`[Telegram] User ID получен: ${state.telegramUserId}`);
            }
            else {
                document.body.innerHTML = `
          <div id="tg-fallback">
            <h1>AudioTrip</h1>
            <p>Эта игра предназначена для запуска только внутри Telegram.</p>
            <a href="https://t.me/AudioTripBot" class="tg-link">Запустить через Telegram</a>
          </div>
          <style>
            body { background-color: #000; color: #fff; font-family: 'Jura', sans-serif; text-shadow: 0 0 5px #0ff; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            #tg-fallback { text-align: center; border: 2px solid #0ff; padding: 40px; border-radius: 15px; box-shadow: 0 0 15px #0ff; }
            #tg-fallback h1 { color: #0ff; font-family: 'Orbitron', sans-serif; }
            .tg-link { display: inline-block; margin-top: 20px; padding: 15px 30px; border: 2px solid #0ff; color: #0ff; text-decoration: none; border-radius: 5px; transition: all 0.3s; }
            .tg-link:hover { background-color: #0ff; color: #000; box-shadow: 0 0 20px #0ff; }
          </style>
        `;
                return;
            }
        }
        catch (e) {
            console.error("Ошибка при проверке Telegram API:", e);
            return;
        }
    }
    audio.soundManager.loadSounds();
    ui.startPrompt.textContent = ui.t('loading_track');
    ui.fileLabel.classList.add('hidden');
    ui.fileInput.disabled = true;
    state.scene = new THREE.Scene();
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    state.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(5, 5, 5);
    state.scene.add(directionalLight);
    state.scene.fog = new THREE.Fog(0x000000, 10, 250);
    state.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
    state.camera.position.set(0, 5, 20);
    state.camera.lookAt(0, 0, 0);
    state.renderer = new THREE.WebGLRenderer({ canvas: ui.canvas, antialias: true });
    state.renderer.setSize(window.innerWidth, window.innerHeight);
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    state.renderer.setClearColor(0x000000);
    try {
        state.player = await graphics.loadPlayerModel();
        state.scene.add(state.player);
        state.player.visible = false;
    }
    catch (error) {
        ui.startPrompt.textContent = ui.t('error_load');
        ui.startPrompt.style.color = '#f55';
        return;
    }
    state.backgroundSphere = graphics.createBackgroundSphere();
    state.scene.add(state.backgroundSphere);
    state.backgroundSphere.visible = true;
    state.nebulaParticles = graphics.createNebulas();
    state.scene.add(state.nebulaParticles);
    state.normalStarfield = graphics.createNormalStarfield();
    state.scene.add(state.normalStarfield);
    state.hyperspaceStreaks = graphics.createHyperspaceStreaks();
    state.scene.add(state.hyperspaceStreaks);
    state.meteorShower = graphics.createMeteorShower();
    // scene.add(meteorShower);
    state.positiveBurst = graphics.createPositiveBurst();
    state.scene.add(state.positiveBurst);
    const renderScene = new RenderPass(state.scene, state.camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.7, 0.3, 0.9);
    bloomPass.threshold = 0.25;
    bloomPass.strength = 0.8;
    bloomPass.radius = 0.3;
    state.composer = new EffectComposer(state.renderer);
    state.composer.addPass(renderScene);
    state.composer.addPass(bloomPass);
    state.bloomComposer = new EffectComposer(state.renderer);
    state.bloomComposer.renderToScreen = false;
    state.bloomComposer.addPass(renderScene);
    state.bloomComposer.addPass(bloomPass);
    const finalPass = new ShaderPass(new THREE.ShaderMaterial({
        uniforms: {
            baseTexture: { value: null },
            bloomTexture: { value: state.bloomComposer.renderTarget2.texture }
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
    }), "baseTexture");
    finalPass.needsSwap = true;
    state.composer = new EffectComposer(state.renderer);
    state.composer.addPass(renderScene);
    state.composer.addPass(finalPass);
    const fadeGeometry = new THREE.PlaneGeometry(2, 2);
    const fadeMaterial = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0,
        depthTest: false
    });
    state.fadeOutPlane = new THREE.Mesh(fadeGeometry, fadeMaterial);
    state.fadeOutPlane.renderOrder = 999;
    state.scene.add(state.fadeOutPlane);
    state.storm.lightningFlash = new THREE.PointLight(0xaaccee, 0, 0, 2);
    state.scene.add(state.storm.lightningFlash);
    state.storm.ambientLight = new THREE.AmbientLight(0x99aaff, 0);
    state.scene.add(state.storm.ambientLight);
    for (let i = 0; i < config.MAX_BOLTS_IN_POOL; i++) {
        state.lightningBolts.push(graphics.createLightningBolt());
    }
    state.videoScreensGroup = new THREE.Group();
    state.scene.add(state.videoScreensGroup);
    state.composer = new EffectComposer(state.renderer);
    state.composer.addPass(renderScene);
    state.composer.addPass(bloomPass);
    state.sketchPass = new ShaderPass(config.SketchShader);
    state.sketchPass.uniforms.resolution.value.x = window.innerWidth * window.devicePixelRatio;
    state.sketchPass.uniforms.resolution.value.y = window.innerHeight * window.devicePixelRatio;
    state.sketchPass.enabled = false;
    state.composer.addPass(state.sketchPass);
    state.spaceGroup = new THREE.Group();
    state.scene.add(state.spaceGroup);
    state.spaceGroup.add(state.nebulaParticles);
    state.spaceGroup.add(state.normalStarfield);
    state.circularFramesGroup = new THREE.Group();
    state.scene.add(state.circularFramesGroup);
    state.tunnelGroup = new THREE.Group();
    state.scene.add(state.tunnelGroup);
    for (let i = 0; i < config.FRAME_POOL_SIZE; i++) {
        state.framePool.push(graphics.createCircularFrameMesh());
    }
    for (let i = 0; i < config.TUNNEL_SEGMENT_POOL_SIZE; i++) {
        state.tunnelSegmentPool.push(graphics.createTunnelSegmentMesh());
    }
    state.cityBackgroundSphere = graphics.createCityBackground();
    state.cityBackgroundSphere.visible = false;
    state.scene.add(state.cityBackgroundSphere);
    window.addEventListener('resize', ui.onWindowResize);
    document.addEventListener('keydown', ui.onKeyDown);
    document.addEventListener('keyup', ui.onKeyUp);
    ui.canvas.addEventListener('touchstart', ui.handleTouchStart, { passive: false });
    ui.canvas.addEventListener('touchend', ui.handleTouchEnd, { passive: false });
    ui.canvas.addEventListener('touchcancel', ui.handleTouchEnd, { passive: false });
    ui.fileInput.addEventListener('change', game.onFileSelect);
    ui.restartButton.addEventListener('click', () => location.reload());
    ui.pauseButton.addEventListener('click', audio.togglePause);
    ui.resumeButton.addEventListener('click', audio.togglePause);
    ui.mainMenuButton.addEventListener('click', () => location.reload());
    const uiClickableElements = document.querySelectorAll('button, .file-label');
    uiClickableElements.forEach(element => {
        element.addEventListener('click', () => {
            audio.soundManager.playSound('buttonclick');
        });
        element.addEventListener('mouseenter', () => {
            audio.soundManager.playSound('buttonhover');
        });
    });
    ui.searchInput.addEventListener('input', ui.onSearchInput);
    document.addEventListener('click', (e) => {
        if (e.target !== ui.searchInput) {
            ui.autocompleteResults.classList.add('hidden');
        }
    });
    ui.historyButton.addEventListener('click', ui.showHistoryScreen);
    ui.historyCloseButton.addEventListener('click', () => ui.historyScreen.classList.add('hidden'));
    ui.leaderboardButton.addEventListener('click', () => ui.leaderboardScreen.classList.remove('hidden'));
    ui.leaderboardCloseButton.addEventListener('click', () => ui.leaderboardScreen.classList.add('hidden'));
    ui.claimButton.addEventListener('click', () => ui.claimScreen.classList.remove('hidden'));
    ui.claimCloseButton.addEventListener('click', () => ui.claimScreen.classList.add('hidden'));
    // createCityEnvironment();
    // createSolarSystemEnvironment();
    graphics.createMenuEqualizer();
    ui.startPrompt.innerHTML = `${ui.t('start_prompt')}<br><small>${ui.t('start_vpn')}</small>`;
    ui.fileLabel.classList.remove('hidden');
    ui.fileInput.disabled = false;
    ui.loadTotalScore();
    if (sessionStorage.getItem('warningSeen') === 'true') {
        ui.startScreen.classList.remove('hidden');
        ui.totalScoreContainer.classList.remove('hidden');
        ui.claimButton.classList.remove('hidden');
        ui.startScreen.style.pointerEvents = 'all';
        gsap.set(ui.startScreen, { opacity: 1, scale: 1, y: "0px" });
        state.menuActive = true;
        audio.playMenuMusic();
    }
    else {
        ui.entryBox.classList.remove('hidden');
        gsap.set(ui.startScreen, { scale: 0.7, opacity: 0, y: "100px" });
        ui.entryButton.addEventListener('click', async () => {
            audio.initSystemAudio();
            await audio.soundManager.loadSounds();
            sessionStorage.setItem('warningSeen', 'true');
            state.menuActive = true;
            audio.playMenuMusic();
            gsap.to(ui.entryBox, {
                duration: 0.5,
                scale: 0.8,
                y: "-200px",
                opacity: 0,
                ease: "power2.in",
                onComplete: () => {
                    ui.entryBox.classList.add('hidden');
                    ui.totalScoreContainer.classList.remove('hidden');
                    ui.claimButton.classList.remove('hidden');
                }
            });
            ui.startScreen.classList.remove('hidden');
            ui.startScreen.style.pointerEvents = 'all';
            gsap.timeline()
                .to(ui.startScreen, {
                duration: 0.7,
                scale: 1.05,
                opacity: 1,
                y: "0px",
                ease: "power3.out",
                delay: 0.2
            })
                .to(ui.startScreen, {
                duration: 0.4,
                scale: 1,
                ease: "back.out(1.7)"
            });
        }, { once: true });
    }
    try {
        if (window.Telegram && window.Telegram.WebApp) {
            window.Telegram.WebApp.ready();
            window.Telegram.WebApp.expand();
            setTimeout(async () => {
                await window.Telegram.WebApp.requestFullscreen();
            }, 1000);
        }
    }
    catch (e) {
        console.error("Telegram WebApp API error:", e);
    }
    animate();
}
function animate() {
    state.animationFrameId = requestAnimationFrame(animate);
    const deltaTime = state.clock.getDelta();
    const time = state.clock.getElapsedTime();
    if (state.gameStarted && !state.isPaused && state.trackCurve && state.songData && state.trackFrames.length > 0) {
        state.lastPlayerProgress = state.playerProgress;
        state.playerProgress = Math.min(state.audioContext.currentTime / state.songData.duration, 1.0);
        const energyIndex = Math.min(Math.floor(state.playerProgress * state.songData.energyMap.length), state.songData.energyMap.length - 1);
        const currentEnergy = state.songData.energyMap[energyIndex] || 0;
        state.lerpedEnergy = THREE.MathUtils.lerp(state.lerpedEnergy, currentEnergy, 0.05);
        game.updateBlockMovement(deltaTime, currentEnergy);
        state.analyser.getByteFrequencyData(state.frequencyData);
        const bass = (state.frequencyData[1] + state.frequencyData[2]) / 2 / 255;
        const currentFrame = utils.getInterpolatedFrame(state.playerProgress, state._reusableFrame);
        const { point: currentPoint, tangent, normal: trackNormal, binormal } = currentFrame;
        if (state.keyState.left) {
            state.targetPlayerLane = 0;
        }
        else if (state.keyState.right) {
            state.targetPlayerLane = 2;
        }
        else {
            state.targetPlayerLane = 1;
        }
        state.actualPlayerLane = THREE.MathUtils.lerp(state.actualPlayerLane, state.targetPlayerLane, 0.35);
        const horizontalOffset = state._reusableVector1.copy(binormal).multiplyScalar(THREE.MathUtils.lerp(config.LANE_POSITIONS[0], config.LANE_POSITIONS[2], state.actualPlayerLane / 2));
        const SHIP_HOVER_HEIGHT = 1.2;
        const verticalOffset = state._reusableVector2.copy(trackNormal).multiplyScalar(SHIP_HOVER_HEIGHT);
        state.player.position.copy(currentPoint).add(horizontalOffset).add(verticalOffset);
        const lookAheadProgress = 0.003;
        const futureProgress = Math.min(state.playerProgress + lookAheadProgress, 1.0);
        const futureFrame = utils.getInterpolatedFrame(futureProgress, { point: state._reusableVector3, tangent: state._reusableVector4, normal: state._reusableVector2, binormal: state._reusableVector1 });
        const futureHorizontalOffset = futureFrame.binormal.clone().multiplyScalar(THREE.MathUtils.lerp(config.LANE_POSITIONS[0], config.LANE_POSITIONS[2], state.actualPlayerLane / 2));
        const futureVerticalOffset = futureFrame.normal.clone().multiplyScalar(SHIP_HOVER_HEIGHT);
        const lookAtTargetPoint = state._reusableVector3.copy(futureFrame.point).add(futureHorizontalOffset).add(futureVerticalOffset);
        state.player.up.copy(trackNormal);
        state.player.lookAt(lookAtTargetPoint);
        state.player.rotateY(Math.PI);
        // --- Camera Logic ---
        const CAM_HEIGHT = 6.0;
        const CAM_DISTANCE_BEHIND = 10.0;
        const cameraVerticalOffset = state._reusableVector1.copy(trackNormal).multiplyScalar(CAM_HEIGHT);
        const cameraBehindOffset = state._reusableVector2.copy(tangent).multiplyScalar(-CAM_DISTANCE_BEHIND);
        const idealCameraPos = state._reusableVector3.copy(currentPoint).add(cameraVerticalOffset).add(cameraBehindOffset);
        state.camera.position.lerp(idealCameraPos, 1.0);
        state.camera.up.copy(trackNormal);
        const LOOK_AHEAD_DISTANCE = 40.0;
        const cameraLookAtTarget = state._reusableVector4.copy(currentPoint).add(state._reusableVector1.copy(tangent).multiplyScalar(LOOK_AHEAD_DISTANCE));
        state.camera.lookAt(cameraLookAtTarget);
        // --- Effects and Visuals ---
        if (state.storm.active && state.storm.lightningFlash && state.storm.ambientLight) {
            state.storm.lightningFlash.intensity = Math.max(0, state.storm.lightningFlash.intensity - 250 * deltaTime);
            state.storm.ambientLight.intensity = Math.max(0, state.storm.ambientLight.intensity - 2.0 * deltaTime);
            state.lightningBolts.forEach(bolt => {
                if (bolt.userData.isActive) {
                    bolt.userData.life -= deltaTime;
                    bolt.material.opacity = Math.max(0, bolt.userData.life * 2);
                    if (bolt.userData.life <= 0) {
                        bolt.userData.isActive = false;
                        bolt.visible = false;
                    }
                }
            });
            const currentTime = state.audioContext.currentTime;
            if (currentTime > state.storm.lastFlashTime + state.storm.nextFlashDelay) {
                graphics.triggerLightning(currentFrame);
                state.storm.lastFlashTime = currentTime;
                state.storm.nextFlashDelay = 0.1 + Math.random() * 0.4;
            }
        }
        const isSssRank = state.currentRankIndex === config.STYLE_RANKS.length - 1;
        // const targetBackgroundColor = isSssRank ? SSS_SKY_COLOR : new THREE.Color(0x000000);
        // if (!(scene.background instanceof THREE.Color)) {
        //   scene.background = new THREE.Color(0x000000);
        // }
        // (scene.background as THREE.Color).lerp(targetBackgroundColor, 0.05);
        // scene.fog.color.copy(scene.background as THREE.Color);
        if (state.backgroundSphere && (state.backgroundSphere.material as THREE.MeshStandardMaterial).emissive) {
            state.backgroundSphere.position.copy(state.camera.position);
            (state.backgroundSphere.material as THREE.MeshStandardMaterial).emissive.copy(state.currentColor);
            const gridIntensity = isSssRank ? 1.0 : 0.2 + bass * 1.5;
            (state.backgroundSphere.material as THREE.MeshStandardMaterial).emissiveIntensity = gridIntensity;
        }
        if (state.scene.fog) {
            state.scene.fog.color.copy(state.currentSkyColor);
        }
        if (state.trackGroup) {
            const leftRail = state.trackGroup.getObjectByName('leftRail') as THREE.Mesh;
            const rightRail = state.trackGroup.getObjectByName('rightRail') as THREE.Mesh;
            if (state.storm.active && !state.sketchPass.enabled) {
                const bassValue = (state.frequencyData[2] + state.frequencyData[3] + state.frequencyData[4]) / 3 / 255.0;
                const midValue = state.frequencyData[Math.floor(state.frequencyData.length / 2)] / 255.0;
                const trebleValue = state.frequencyData[state.frequencyData.length - 20] / 255.0;
                [leftRail, rightRail].forEach(rail => {
                    if (rail && rail.material instanceof THREE.ShaderMaterial) {
                        const uniforms = rail.material.uniforms;
                        uniforms.uBass.value = bassValue;
                        uniforms.uMid.value = midValue;
                        uniforms.uTreble.value = trebleValue;
                        uniforms.uTime.value = state.audioContext.currentTime;
                    }
                });
            }
            else {
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
        if (state.currentEnvironment === config.EnvironmentState.CITY) {
            state.cityGroup.position.x = state.camera.position.x;
            state.cityGroup.position.z = state.camera.position.z;
            graphics.updateCityChunks();
        }
        else if (state.currentEnvironment === config.EnvironmentState.SOLAR_SYSTEM) {
            state.solarSystemGroup.position.copy(state.camera.position);
            state.planets.forEach((planet, index) => {
                planet.rotation.y += 0.0005 * (index + 1);
            });
        }
        if (state.cityBackgroundSphere) {
            state.cityBackgroundSphere.position.copy(state.camera.position);
        }
        game.trySpawnWhiteHole();
        game.updateSpecialEvents();
        game.checkSpecialCollisions();
        if (state.isSketchModeActive) {
            state.sketchModeTimer -= deltaTime;
            if (state.sketchModeTimer <= 0) {
                state.isSketchModeActive = false;
                state.sketchPass.enabled = false;
            }
        }
        if (state.cityFadeIn.active) {
            state.cityFadeIn.progress += deltaTime / state.cityFadeIn.duration;
            const currentOpacity = Math.min(state.cityFadeIn.progress, 1.0);
            if (state.buildingMaterial) {
                (state.buildingMaterial as THREE.Material).opacity = currentOpacity;
            }
            if (state.cityFadeIn.progress >= 1.0) {
                state.cityFadeIn.active = false;
            }
        }
        const FADE_START_TIME = state.songData.duration - 3;
        if (state.audioContext.currentTime > FADE_START_TIME) {
            const timeIntoFade = state.audioContext.currentTime - FADE_START_TIME;
            const fadeDuration = state.songData.duration - FADE_START_TIME;
            const fadeProgress = Math.min(timeIntoFade / fadeDuration, 1.0);
            (state.fadeOutPlane.material as THREE.MeshBasicMaterial).opacity = fadeProgress;
        }
        if (state.fadeOutPlane) {
            state.fadeOutPlane.position.copy(state.camera.position);
            state.fadeOutPlane.quaternion.copy(state.camera.quaternion);
            state.fadeOutPlane.translateZ(-0.11);
        }
        const HYPERSPACE_THRESHOLD = 0.70;
        const HYPERSPACE_COOLDOWN = 40;
        const TIME_IN_RED_ZONE_TO_TRIGGER = 0.25;
        if (currentEnergy >= HYPERSPACE_THRESHOLD) {
            state.timeInRedZone += deltaTime;
        }
        else {
            state.timeInRedZone = 0;
        }
        if (state.timeInRedZone >= TIME_IN_RED_ZONE_TO_TRIGGER &&
            !state.hyperspaceEffect.active &&
            !state.activeTransition.inProgress &&
            state.audioContext.currentTime > state.lastHyperspaceTriggerTime + HYPERSPACE_COOLDOWN &&
            state.hyperspaceJumpCount < config.MAX_HYPERSPACE_JUMPS) {
            state.hyperspaceEffect.active = true;
            state.hyperspaceEffect.timer = state.hyperspaceEffect.duration;
            state.lastHyperspaceTriggerTime = state.audioContext.currentTime;
            state.hyperspaceJumpCount++;
            state.timeInRedZone = 0;
            state.activeTransition.inProgress = true;
            const fromEnv = state.currentEnvironment;
            const nextEnv = (state.currentEnvironment + 1) % 3;
            const fromGroup = fromEnv === config.EnvironmentState.SPACE ? state.spaceGroup : (fromEnv === config.EnvironmentState.CITY ? state.cityGroup : state.solarSystemGroup);
            const toGroup = nextEnv === config.EnvironmentState.SPACE ? state.spaceGroup : (nextEnv === config.EnvironmentState.CITY ? state.cityGroup : state.solarSystemGroup);
            const fadeDuration = state.hyperspaceEffect.duration / 2;
            utils.fade(fromGroup, 0, fadeDuration, () => {
                if (fromGroup)
                    fromGroup.visible = false;
                if (fromEnv === config.EnvironmentState.CITY) {
                    state.cityBackgroundSphere.visible = false;
                }
                graphics.setActiveEnvironment(nextEnv);
                if (toGroup)
                    toGroup.visible = true;
                if (nextEnv === config.EnvironmentState.CITY) {
                    state.cityBackgroundSphere.visible = true;
                }
                utils.fade(toGroup, 1, fadeDuration);
                if (nextEnv === config.EnvironmentState.CITY) {
                    utils.fade(state.cityBackgroundSphere, 1, fadeDuration);
                }
            });
            if (fromEnv === config.EnvironmentState.CITY) {
                utils.fade(state.cityBackgroundSphere, 0, fadeDuration);
            }
            setTimeout(() => {
                console.log(`Переход из ${config.EnvironmentState[fromEnv]} в ${config.EnvironmentState[nextEnv]} ЗАВЕРШЕН.`);
                state.currentEnvironment = nextEnv;
                state.activeTransition.inProgress = false;
            }, state.hyperspaceEffect.duration * 1000);
        }
        let baseFov = 75 + currentEnergy * 20;
        const normalStarfieldMat = state.normalStarfield.material as THREE.PointsMaterial;
        const streaksMat = state.hyperspaceStreaks.material as THREE.LineBasicMaterial;
        const defaultStarOpacity = 0.7;
        if (state.hyperspaceEffect.active && state.hyperspaceEffect.timer > 0) {
            state.hyperspaceEffect.timer -= deltaTime;
            const t = 1.0 - (state.hyperspaceEffect.timer / state.hyperspaceEffect.duration);
            const effectProgress = Math.sin(t * Math.PI);
            baseFov += effectProgress * 80;
            normalStarfieldMat.opacity = defaultStarOpacity * (1.0 - effectProgress);
            streaksMat.opacity = effectProgress;
            state.hyperspaceStreaks.visible = streaksMat.opacity > 0;
            if (state.activeTransition.inProgress && t >= 0.5) {
                const nextEnv = (state.currentEnvironment + 1) % 3;
                if (state.spaceGroup)
                    state.spaceGroup.visible = false;
                if (state.cityGroup)
                    state.cityGroup.visible = false;
                if (state.solarSystemGroup)
                    state.solarSystemGroup.visible = false;
                if (state.cityBackgroundSphere)
                    state.cityBackgroundSphere.visible = false;
                graphics.setActiveEnvironment(nextEnv);
                state.currentEnvironment = nextEnv;
                if (nextEnv === config.EnvironmentState.SPACE)
                    state.spaceGroup.visible = true;
                if (nextEnv === config.EnvironmentState.CITY) {
                    state.cityGroup.visible = true;
                    state.cityBackgroundSphere.visible = true;
                    if (state.buildingMaterial)
                        state.buildingMaterial.transparent = false;
                    if (state.buildingMaterial)
                        state.buildingMaterial.opacity = 1.0;
                }
                if (nextEnv === config.EnvironmentState.SOLAR_SYSTEM)
                    state.solarSystemGroup.visible = true;
                state.activeTransition.inProgress = false;
            }
            const streakPositions = (state.hyperspaceStreaks.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
            const stretchLength = effectProgress * 500;
            for (let i = 0; i < config.STAR_COUNT; i++) {
                const i3 = i * 3;
                const i6 = i * 6;
                const headX = config.STAR_POSITIONS[i3 + 0];
                const headY = config.STAR_POSITIONS[i3 + 1];
                const headZ = config.STAR_POSITIONS[i3 + 2];
                streakPositions[i6 + 0] = headX;
                streakPositions[i6 + 1] = headY;
                streakPositions[i6 + 2] = headZ;
                streakPositions[i6 + 3] = headX;
                streakPositions[i6 + 4] = headY;
                streakPositions[i6 + 5] = headZ - stretchLength;
            }
            state.hyperspaceStreaks.geometry.attributes.position.needsUpdate = true;
            if (state.hyperspaceEffect.timer <= 0) {
                state.hyperspaceEffect.active = false;
                if (state.currentEnvironment === config.EnvironmentState.CITY) {
                    if (state.cityGroup)
                        state.cityGroup.visible = true;
                    if (state.cityBackgroundSphere)
                        state.cityBackgroundSphere.visible = true;
                    state.cityFadeIn.active = true;
                    state.cityFadeIn.progress = 0;
                }
                else if (state.currentEnvironment === config.EnvironmentState.SOLAR_SYSTEM) {
                    if (state.solarSystemGroup)
                        state.solarSystemGroup.visible = true;
                }
            }
        }
        else {
            normalStarfieldMat.opacity = THREE.MathUtils.lerp(normalStarfieldMat.opacity, defaultStarOpacity, 0.1);
            streaksMat.opacity = THREE.MathUtils.lerp(streaksMat.opacity, 0, 0.1);
            if (streaksMat.opacity < 0.01) {
                state.hyperspaceStreaks.visible = false;
            }
        }
        state.camera.fov = baseFov;
        state.camera.updateProjectionMatrix();
        if (state.shakeTime > 0) {
            const shakeVector = new THREE.Vector3((Math.random() - 0.5) * state.shakeIntensity, (Math.random() - 0.5) * state.shakeIntensity, 0).applyQuaternion(state.camera.quaternion);
            state.camera.position.add(shakeVector);
            state.shakeTime -= deltaTime;
        }
        else {
            state.shakeIntensity = 0;
        }
        state.trackGroup.children.forEach((c: any) => {
            if (c.material?.emissive)
                c.material.emissiveIntensity = 0.6 + bass * 1.2;
        });
        if (state.backgroundSphere) {
            state.backgroundSphere.position.copy(state.camera.position);
        }
        state.nebulaParticles.position.z = state.camera.position.z - 300;
        state.normalStarfield.position.z = state.camera.position.z;
        state.hyperspaceStreaks.position.z = state.camera.position.z;
        state.meteorShower.position.z = state.camera.position.z - 500;
        const redZoneEnergy = Math.max(0, (currentEnergy - 0.75) / 0.25);
        state.meteorShower.visible = redZoneEnergy > 0;
        if (state.meteorShower.visible) {
            state.meteorShower.material.opacity = redZoneEnergy;
            const positions = state.meteorShower.geometry.attributes.position.array;
            for (let i = 0; i < positions.length / 3; i++) {
                positions[i * 3 + 1] -= (10 + currentEnergy * 20) * deltaTime;
                if (positions[i * 3 + 1] < -200)
                    positions[i * 3 + 1] = 200;
            }
            state.meteorShower.geometry.attributes.position.needsUpdate = true;
        }
        if (state.positiveBurst.visible) {
            const positions = state.positiveBurst.geometry.attributes.position.array;
            for (let i = 0; i < state.positiveBurst.userData.velocities.length; i++) {
                positions[i * 3] += state.positiveBurst.userData.velocities[i].x * deltaTime;
                positions[i * 3 + 1] += state.positiveBurst.userData.velocities[i].y * deltaTime;
                positions[i * 3 + 2] += state.positiveBurst.userData.velocities[i].z * deltaTime;
            }
            state.positiveBurst.geometry.attributes.position.needsUpdate = true;
            state.positiveBurst.material.opacity -= 2.0 * deltaTime;
            if (state.positiveBurst.material.opacity <= 0)
                state.positiveBurst.visible = false;
        }
        const time = state.clock.getElapsedTime();
        for (const block of state.allBlocks) {
            if (block.mesh && block.type === 'color') {
                // (block.mesh.material as THREE.MeshStandardMaterial).color.copy(currentColor).multiplyScalar(0.8);
                // (block.mesh.material as THREE.MeshStandardMaterial).emissive.copy(currentColor).multiplyScalar(0.3);
                (block.mesh.material as THREE.MeshBasicMaterial).color.copy(state.currentColor);
            }
        }
        graphics.updateSceneColors(utils.getTargetColor(state.lerpedEnergy));
        game.updateBlocks();
        game.checkCollisions();
        graphics.updateEnvironmentElements();
        if (state.consecutiveHits > 0 && !state.isSketchModeActive) {
            const currentTime = state.audioContext.currentTime;
            if (currentTime - state.lastHitTime > 2.0) {
                if (currentTime - state.lastDecayTime > 0.3) {
                    state.consecutiveHits = Math.max(0, state.consecutiveHits - 0.1);
                    game.recalculateRank();
                    ui.updateStyleUI();
                    state.lastDecayTime = currentTime;
                }
            }
            else {
                state.lastDecayTime = currentTime;
            }
        }
        if (state.isARankEffectActive) {
            graphics.updateVideoScreensPosition();
        }
        if (state.isARankEffectActive) {
            state.videoScreensGroup.children.forEach(screen => {
                if (screen.userData.isReady) {
                    const material = (screen as THREE.Mesh).material as THREE.MeshStandardMaterial;
                    if (material.opacity < 0.9) {
                        material.opacity += 0.5 * deltaTime;
                    }
                    const video = ((material.emissiveMap as THREE.VideoTexture).source.data as HTMLVideoElement);
                    if (video.paused) {
                        video.play().catch(e => { });
                    }
                }
            });
        }
        else if (state.videoScreensGroup.children.length > 0) {
            let allFadedOut = true;
            state.videoScreensGroup.children.forEach(screen => {
                const material = (screen as THREE.Mesh).material as THREE.MeshStandardMaterial;
                if (material.opacity > 0) {
                    allFadedOut = false;
                    material.opacity -= 1.0 * deltaTime;
                }
            });
            if (allFadedOut && state.videoScreensGroup.visible) {
                state.videoScreensGroup.visible = false;
                state.videoElements.forEach(video => video.pause());
            }
        }
    }
    else {
        if (state.menuActive) {
            graphics.updateMenuEqualizer(time);
        }
        if (state.equalizerGroup) {
            const Z_DISTANCE = 12;
            const Y_OFFSET_FACTOR = 2.0;
            const TILT_ANGLE = -Math.PI / 10;
            const vFOV = THREE.MathUtils.degToRad(state.camera.fov);
            const targetHeight = 2 * Math.tan(vFOV / 2) * Z_DISTANCE;
            const targetPosition = new THREE.Vector3(0, -targetHeight / Y_OFFSET_FACTOR, -Z_DISTANCE);
            targetPosition.applyMatrix4(state.camera.matrixWorld);
            state.equalizerGroup.position.copy(targetPosition);
            state.equalizerGroup.quaternion.copy(state.camera.quaternion);
            // equalizerGroup.rotateX(TILT_ANGLE);
        }
        if (state.backgroundSphere) {
            const time = state.clock.getElapsedTime();
            (state.backgroundSphere.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.2 + (Math.sin(time * 0.5) * 0.5 + 0.5) * 0.2;
            state.backgroundSphere.rotation.y += 0.0005;
        }
    }
    // const pulseTime = clock.getElapsedTime();
    // const pulse = (Math.sin(pulseTime * 6) * 0.5) + 0.5;
    //
    // for (const block of allBlocks) {
    //   if (block.type === 'bomb' && block.mesh) {
    //     block.mesh.traverse((child: any) => {
    //       if (child.isMesh && child.material && child.material.isMeshStandardMaterial) {
    //         child.material.emissiveIntensity = 1.0 + pulse * 3.0;
    //       }
    //     });
    //   }
    // }
    state.renderer.setClearColor(0x000000);
    state.camera.layers.set(config.BLOOM_SCENE);
    state.bloomComposer.render();
    state.renderer.setClearColor(0x000000);
    state.camera.layers.set(config.ENTIRE_SCENE);
    state.composer.render();
}
init();