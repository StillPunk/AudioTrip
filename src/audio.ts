import * as THREE from 'three';
import { state } from './state';
import * as ui from './ui';
import * as game from './game';

export function initSystemAudio() {
    if (!state.systemAudioCtx) {
        // @ts-ignore
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        state.systemAudioCtx = new AudioContext();
    }
    if (state.systemAudioCtx.state === 'suspended') {
        state.systemAudioCtx.resume();
    }
    try {
        const buffer = state.systemAudioCtx.createBuffer(1, 1, 22050);
        const source = state.systemAudioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(state.systemAudioCtx.destination);
        source.start(0);
    }
    catch (e) {
        console.error("Ошибка прогрева аудио:", e);
    }
}
export async function loadAudioBuffer(url: string): Promise<AudioBuffer | null> {
    initSystemAudio();
    if (!state.systemAudioCtx)
        return null;
    try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        return await state.systemAudioCtx.decodeAudioData(arrayBuffer);
    }
    catch (error) {
        console.error(`Ошибка загрузки звука ${url}:`, error);
        return null;
    }
}
export const soundManager = {
    loaded: false,
    soundsToLoad: {
        buttonclick: '/assets/sounds/ui_buttonclick.wav',
        buttonhover: '/assets/sounds/ui_buttonhover.wav',
        characterselect: '/assets/sounds/ui_characterselect.wav',
        collision_color: '/assets/sounds/collision_color.wav',
        collision_stone: '/assets/sounds/collision_stone.wav',
        matchsmall: '/assets/sounds/matchsmall.wav',
        matchlarge: '/assets/sounds/matchlarge.wav',
        matchhuge: '/assets/sounds/matchhuge.wav',
        thunder1: '/assets/sounds/thunder1.mp3',
        thunder2: '/assets/sounds/thunder2.mp3',
        thunder3: '/assets/sounds/thunder3.mp3'
    },
    loadSounds: async function () {
        if (this.loaded)
            return;
        console.log("Loading sounds via Web Audio API...");
        initSystemAudio();
        const promises = Object.entries(this.soundsToLoad).map(async ([key, url]) => {
            const buffer = await loadAudioBuffer(url as string);
            if (buffer) {
                state.audioBuffers[key] = buffer;
            }
        });
        await Promise.all(promises);
        this.loaded = true;
        console.log("All sounds loaded.");
    },
    playSound: function (name: string, volume: number = 0.4) {
        if (!state.systemAudioCtx || !state.audioBuffers[name])
            return;
        if (state.systemAudioCtx.state === 'suspended') {
            state.systemAudioCtx.resume();
        }
        const source = state.systemAudioCtx.createBufferSource();
        source.buffer = state.audioBuffers[name];
        const gainNode = state.systemAudioCtx.createGain();
        gainNode.gain.value = volume;
        source.connect(gainNode);
        gainNode.connect(state.systemAudioCtx.destination);
        source.start(0);
    }
};
export function togglePause() {
    if (!state.gameStarted)
        return;
    state.isPaused = !state.isPaused;
    if (state.isPaused) {
        state.audioContext.suspend();
        ui.pauseMenu.classList.remove('hidden');
    }
    else {
        state.audioContext.resume();
        ui.pauseMenu.classList.add('hidden');
    }
}
export async function playMenuMusic() {
    if (!state.systemAudioCtx)
        return;
    if (state.menuMusicSource) {
        try {
            state.menuMusicSource.stop();
        }
        catch (e) { }
        state.menuMusicSource = null;
    }
    const musicThemes = [
        '/assets/sounds/menu_theme_1.mp3',
        '/assets/sounds/menu_theme_2.mp3',
        '/assets/sounds/menu_theme_3.mp3'
    ];
    const randomIndex = Math.floor(Math.random() * musicThemes.length);
    const themeUrl = musicThemes[randomIndex];
    const buffer = await loadAudioBuffer(themeUrl);
    if (buffer && state.systemAudioCtx) {
        state.menuMusicSource = state.systemAudioCtx.createBufferSource();
        state.menuMusicSource.buffer = buffer;
        // menuMusicSource.loop = true;
        state.menuMusicGain = state.systemAudioCtx.createGain();
        state.menuMusicGain.gain.value = 0.3;
        state.menuMusicGain.gain.setValueAtTime(0, state.systemAudioCtx.currentTime);
        state.menuMusicGain.gain.linearRampToValueAtTime(0.3, state.systemAudioCtx.currentTime + 2);
        state.menuMusicSource.connect(state.menuMusicGain);
        state.menuMusicGain.connect(state.systemAudioCtx.destination);
        state.menuMusicSource.start(0);
    }
}
export function setupAndPlayAudio(arrayBuffer: ArrayBuffer) {
    if (state.audioContext) {
        state.audioContext.close();
    }
    state.audioContext = new AudioContext();
    state.audioContext.suspend();
    state.analyser = state.audioContext.createAnalyser();
    state.analyser.fftSize = 256;
    state.frequencyData = new Uint8Array(state.analyser.frequencyBinCount);
    state.audioContext.decodeAudioData(arrayBuffer, async (buffer) => {
        state.source = state.audioContext.createBufferSource();
        state.source.buffer = buffer;
        state.gameMusicGain = state.audioContext.createGain();
        state.gameMusicGain.gain.value = 1.0;
        state.source.connect(state.analyser);
        state.analyser.connect(state.gameMusicGain);
        state.analyser.connect(state.audioContext.destination);
        await ui.checkAndShowTutorial();
        await state.audioContext.resume();
        state.source.start(0);
        state.source.onended = game.endGame;
        if (state.fadeOutPlane) {
            (state.fadeOutPlane.material as THREE.MeshBasicMaterial).opacity = 0;
        }
        if (state.player)
            state.player.visible = true;
        ui.loadingScreen.classList.add('hidden');
        ui.gameHud.classList.remove('hidden');
        state.maxCombo = 0;
        state.totalMisses = 0;
        state.rankHistory.length = 0;
        state.score = 0;
        state.consecutiveHits = 0;
        state.lastHitTime = 0;
        state.lastDecayTime = 0;
        state.currentRankIndex = -1;
        state.previousRankIndex = -1;
        ui.updateStyleUI();
        state.playerProgress = 0;
        state.lastPlayerProgress = 0;
        state.lerpedEnergy = 0;
        state.lastHyperspaceTriggerTime = -Infinity;
        state.hyperspaceJumpCount = 0;
        state.timeInRedZone = 0;
        state.currentColor.set(0x00bfff);
        ui.scoreEl.textContent = '0';
        state.gameStarted = true;
        state.isPaused = false;
        state.backgroundSphere.visible = false;
        state.hasSketchModeBeenTriggeredThisSong = false;
        state.nextWormholeSpawnTime = 20 + Math.random() * 20;
    }, (error) => {
        console.error("Error decoding audio data:", error);
        location.reload();
    });
}