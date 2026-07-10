import { state } from './state';
import * as config from './config';
import * as audio from './audio';
import * as graphics from './graphics';
import * as game from './game';

// --- DOM Elements ---
export const canvas = document.getElementById('webgl-canvas') as HTMLCanvasElement;
export const fileInput = document.getElementById('audio-file-input') as HTMLInputElement;
export const startScreen = document.getElementById('start-screen')!;
export const startPrompt = document.getElementById('start-prompt') as HTMLParagraphElement;
export const fileLabel = document.getElementById('file-label') as HTMLLabelElement;
export const loadingScreen = document.getElementById('loading-screen')!;
// const loadingText = document.getElementById('loading-text')!;
export const analysisText = document.getElementById('analysis-text')!;
export const scoreEl = document.getElementById('score')!;
export const endScreen = document.getElementById('end-screen')!;
export const finalScoreEl = document.getElementById('final-score')!;
export const restartButton = document.getElementById('restart-button')!;
export const vignette = document.getElementById('vignette')!;
export const gameHud = document.getElementById('game-hud')!;
export const pauseButton = document.getElementById('pause-button')!;
export const pauseMenu = document.getElementById('pause-menu')!;
export const resumeButton = document.getElementById('resume-button')!;
export const mainMenuButton = document.getElementById('main-menu-button')!;
export const styleRankContainer = document.getElementById('style-rank-container')!;
export const rankImage = document.getElementById('rank-image') as HTMLImageElement;
export const progressBarFill = document.getElementById('progress-bar-fill') as HTMLElement;
export const scoreMultiplierEl = document.getElementById('score-multiplier')!;
export const searchInput = document.getElementById('song-search-input') as HTMLInputElement;
export const autocompleteResults = document.getElementById('autocomplete-results')!;
export const historyScreen = document.getElementById('history-screen')!;
export const historyTableBody = document.getElementById('history-table-body')!;
export const historyButton = document.getElementById('history-button')!;
export const historyCloseButton = document.getElementById('history-close-button')!;
export const leaderboardScreen = document.getElementById('leaderboard-screen')!;
export const leaderboardButton = document.getElementById('leaderboard-button')!;
export const leaderboardCloseButton = document.getElementById('leaderboard-close-button')!;
export const totalScoreEl = document.getElementById('total-score')!;
export const totalScoreContainer = document.getElementById('total-score-container')!;
export const claimButton = document.getElementById('claim-button')!;
export const claimScreen = document.getElementById('claim-screen')!;
export const claimCloseButton = document.getElementById('claim-close-button')!;
export const tutorialScreen = document.getElementById('tutorial-screen')!;
export const tutorialContinueButton = document.getElementById('tutorial-continue-button')!;
export const entryBox = document.getElementById('entry-box')!;
export const entryButton = document.getElementById('entry-button')!;
export function t(key: string): string {
    return config.translations[state.currentLang][key] || key;
}
export function initLocalization() {
    const tgLang = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
    const browserLang = navigator.language.slice(0, 2);
    if (tgLang === 'ru' || (!tgLang && browserLang === 'ru')) {
        state.currentLang = 'ru';
    }
    else {
        state.currentLang = 'en';
    }
    console.log(`[i18n] Language set to: ${state.currentLang}`);
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (key && config.translations[state.currentLang][key]) {
            if (config.translations[state.currentLang][key].includes('<')) {
                el.innerHTML = config.translations[state.currentLang][key];
            }
            else {
                el.textContent = config.translations[state.currentLang][key];
            }
        }
    });
    const searchInput = document.getElementById('song-search-input') as HTMLInputElement;
    if (searchInput) {
        searchInput.placeholder = t('search_placeholder');
    }
}
export function handleTouchStart(event: TouchEvent) {
    event.preventDefault();
    const touchX = event.touches[0].clientX;
    const screenMidpoint = window.innerWidth / 2;
    if (touchX < screenMidpoint) {
        state.keyState.left = true;
        state.keyState.right = false;
    }
    else {
        state.keyState.right = true;
        state.keyState.left = false;
    }
}
export function handleTouchEnd(event: TouchEvent) {
    event.preventDefault();
    state.keyState.left = false;
    state.keyState.right = false;
}
export function checkAndShowTutorial(): Promise<void> {
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
export async function loadTotalScore() {
    if (!state.telegramUserId)
        return;
    try {
        const response = await fetch(`https://audiotrip.space/api/history/${state.telegramUserId}`);
        if (!response.ok)
            return;
        const data = await response.json();
        totalScoreEl.textContent = data.totalScore.toLocaleString('ru-RU');
    }
    catch (error) {
        console.error('Failed to load total score:', error);
    }
}
export async function showHistoryScreen() {
    if (!state.telegramUserId)
        return;
    try {
        console.log('[API] Запрашиваю историю игр...');
        const response = await fetch(`https://audiotrip.space/api/history/${state.telegramUserId}`);
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
    }
    catch (error) {
        console.error('[API] Ошибка при получении истории:', error);
        alert('Не удалось загрузить историю. Попробуйте позже.');
    }
}
export function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowLeft')
        state.keyState.left = true;
    if (event.key === 'ArrowRight')
        state.keyState.right = true;
}
export function onKeyUp(event: KeyboardEvent) {
    if (event.key === 'ArrowLeft')
        state.keyState.left = false;
    if (event.key === 'ArrowRight')
        state.keyState.right = false;
}
export function onSearchInput() {
    clearTimeout(state.searchTimeout);
    const query = searchInput.value;
    if (query.length < 3) {
        autocompleteResults.classList.add('hidden');
        return;
    }
    state.searchTimeout = window.setTimeout(() => {
        const oldScript = document.getElementById('jsonp-script');
        if (oldScript) {
            document.body.removeChild(oldScript);
        }
        const callbackName = 'jsonp_callback_' + Date.now();
        (window as any)[callbackName] = (data: any) => {
            const suggestions = data[1];
            autocompleteResults.innerHTML = '';
            suggestions.forEach((songTitle: string) => {
                const resultItem = document.createElement('div');
                resultItem.className = 'result-item';
                resultItem.textContent = songTitle;
                resultItem.title = songTitle;
                resultItem.addEventListener('click', () => game.onSongSelectFromSearch({ title: songTitle, videoId: '' }));
                autocompleteResults.appendChild(resultItem);
            });
            autocompleteResults.classList.remove('hidden');
            document.body.removeChild(script);
            delete (window as any)[callbackName];
        };
        const script = document.createElement('script');
        script.id = 'jsonp-script';
        script.src = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(query)}&callback=${callbackName}`;
        script.onerror = () => {
            console.error("Ошибка загрузки JSONP скрипта.");
            delete (window as any)[callbackName];
            if (document.getElementById('jsonp-script')) {
                document.body.removeChild(script);
            }
        };
        document.body.appendChild(script);
    }, 400);
}
export function updateStyleUI() {
    if (state.isSketchModeActive) {
        if (styleRankContainer.classList.contains('hidden')) {
            styleRankContainer.classList.remove('hidden');
        }
        rankImage.src = '/assets/images/antiverse.png';
        scoreMultiplierEl.textContent = '(x20)';
        [styleRankContainer, gameHud].forEach(el => {
            el.classList.remove('style-rank-blue', 'style-rank-gold');
            el.classList.add('style-rank-antiverse');
        });
        return;
    }
    [styleRankContainer, gameHud].forEach(el => {
        el.classList.remove('style-rank-antiverse');
    });
    if (state.currentRankIndex > -1) {
        state.rankHistory.push(state.currentRankIndex);
    }
    const rankChanged = state.currentRankIndex !== state.previousRankIndex;
    if (rankChanged && state.currentRankIndex > state.previousRankIndex) {
        if (state.currentRankIndex <= 1) {
            audio.soundManager.playSound('matchsmall');
        }
        else if (state.currentRankIndex <= 3) {
            audio.soundManager.playSound('matchlarge');
        }
        else {
            audio.soundManager.playSound('matchhuge');
        }
    }
    const isARankNow = state.currentRankIndex >= 3;
    if (isARankNow && !state.isARankEffectActive) {
        state.isARankEffectActive = true;
        if (state.videoScreensGroup.children.length === 0 && state.videoUrl) {
            graphics.setupAndPositionVideoScreens();
        }
        graphics.updateVideoScreensVisibility(true);
    }
    else if (!isARankNow && state.isARankEffectActive) {
        state.isARankEffectActive = false;
        graphics.updateVideoScreensVisibility(false);
    }
    const isStormActiveNow = state.currentRankIndex >= 4;
    if (isStormActiveNow && !state.storm.active) {
        state.storm.active = true;
        state.storm.lastFlashTime = state.audioContext.currentTime;
        state.storm.nextFlashDelay = 1 + Math.random() * 2;
    }
    else if (!isStormActiveNow && state.storm.active) {
        state.storm.active = false;
        if (state.storm.lightningFlash)
            state.storm.lightningFlash.intensity = 0;
    }
    if (state.currentRankIndex === -1) {
        styleRankContainer.classList.add('hidden');
        scoreMultiplierEl.textContent = '(x1)';
        styleRankContainer.classList.remove('style-rank-blue', 'style-rank-gold');
        state.previousRankIndex = state.currentRankIndex;
        return;
    }
    styleRankContainer.classList.remove('hidden');
    let newClass = null;
    if (state.currentRankIndex > -1) {
        newClass = state.currentRankIndex < 4 ? 'style-rank-blue' : 'style-rank-gold';
    }
    [styleRankContainer, gameHud].forEach(el => {
        el.classList.remove('style-rank-blue', 'style-rank-gold');
        if (newClass) {
            el.classList.add(newClass);
        }
    });
    const currentRank = config.STYLE_RANKS[state.currentRankIndex];
    scoreMultiplierEl.textContent = `(x${currentRank.multiplier})`;
    rankImage.src = currentRank.image;
    if (rankChanged) {
        rankImage.classList.remove('rank-stamp-animation');
        setTimeout(() => {
            rankImage.classList.add('rank-stamp-animation');
        }, 10);
    }
    const isMaxRank = state.currentRankIndex === config.STYLE_RANKS.length - 1;
    if (isMaxRank) {
        progressBarFill.style.width = '100%';
    }
    else {
        const hitsForPrevRank = state.currentRankIndex === 0 ? 0 : config.STYLE_RANKS[state.currentRankIndex - 1].hitsNeeded;
        const hitsForNextRank = config.STYLE_RANKS[state.currentRankIndex + 1].hitsNeeded;
        const progress = (state.consecutiveHits - currentRank.hitsNeeded) / (hitsForNextRank - currentRank.hitsNeeded);
        progressBarFill.style.width = `${Math.min(progress, 1) * 100}%`;
    }
    state.previousRankIndex = state.currentRankIndex;
}
export function onWindowResize() {
    state.camera.aspect = window.innerWidth / window.innerHeight;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(window.innerWidth, window.innerHeight);
    state.composer.setSize(window.innerWidth, window.innerHeight);
    if (state.sketchPass) {
        state.sketchPass.uniforms.resolution.value.x = window.innerWidth * window.devicePixelRatio;
        state.sketchPass.uniforms.resolution.value.y = window.innerHeight * window.devicePixelRatio;
    }
    if (state.equalizerGroup && !state.gameStarted) {
        state.scene.remove(state.equalizerGroup);
        state.equalizerGroup.children.forEach((child: any) => {
            child.geometry.dispose();
            child.material.dispose();
        });
        graphics.createMenuEqualizer();
    }
}