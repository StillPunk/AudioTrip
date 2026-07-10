import { state } from '@/shared/model/gameState';
import { useUIStore } from '@/shared/model/store';
import * as config from '@/shared/config';
import * as audio from '@/entities/audio';
import * as graphics from '@/entities/graphics';
import { t as i18nT, getCurrentLanguage } from '@/shared/lib/i18n';
import type { Language, HistoryRecord } from '@/shared/types';

export function t(key: string): string {
  return i18nT(getCurrentLanguage(), key);
}

export const canvas = document.getElementById('webgl-canvas') as HTMLCanvasElement;

let tutorialResolve: (() => void) | null = null;

export function initLocalization() {
  const tgLang = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
  const browserLang = navigator.language.slice(0, 2);
  const lang: Language = tgLang === 'ru' || (!tgLang && browserLang === 'ru') ? 'ru' : 'en';
  useUIStore.getState().setLanguage(lang);
  state.currentLang = lang;
  console.log(`[i18n] Language set to: ${lang}`);
}

export function handleTouchStart(event: TouchEvent) {
  event.preventDefault();
  const touchX = event.touches[0].clientX;
  const screenMidpoint = window.innerWidth / 2;
  if (touchX < screenMidpoint) {
    state.keyState.left = true;
    state.keyState.right = false;
  } else {
    state.keyState.right = true;
    state.keyState.left = false;
  }
}

export function handleTouchEnd(event: TouchEvent) {
  event.preventDefault();
  state.keyState.left = false;
  state.keyState.right = false;
}

export function onKeyDown(event: KeyboardEvent) {
  if (event.key === 'ArrowLeft') state.keyState.left = true;
  if (event.key === 'ArrowRight') state.keyState.right = true;
}

export function onKeyUp(event: KeyboardEvent) {
  if (event.key === 'ArrowLeft') state.keyState.left = false;
  if (event.key === 'ArrowRight') state.keyState.right = false;
}

export function checkAndShowTutorial(): Promise<void> {
  if (localStorage.getItem('hasPlayedBefore') === 'true') {
    return Promise.resolve();
  }
  useUIStore.getState().setTutorialVisible(true);
  return new Promise((resolve) => {
    tutorialResolve = resolve;
  });
}

export function resolveTutorial() {
  localStorage.setItem('hasPlayedBefore', 'true');
  useUIStore.getState().setTutorialVisible(false);
  tutorialResolve?.();
  tutorialResolve = null;
}

export async function loadTotalScore() {
  if (!state.telegramUserId) return;
  try {
    const response = await fetch(`https://audiotrip.space/api/history/${state.telegramUserId}`);
    if (!response.ok) return;
    const data = await response.json();
    useUIStore.getState().setTotalScore(data.totalScore.toLocaleString('ru-RU'));
  } catch (error) {
    console.error('Failed to load total score:', error);
  }
}

export async function loadHistory() {
  if (!state.telegramUserId) return [] as HistoryRecord[];
  try {
    console.log('[API] Запрашиваю историю игр...');
    const response = await fetch(`https://audiotrip.space/api/history/${state.telegramUserId}`);
    if (!response.ok) throw new Error('Не удалось загрузить историю.');
    const data = await response.json();
    useUIStore.getState().setTotalScore(data.totalScore.toLocaleString('ru-RU'));
    const history: HistoryRecord[] = data.history ?? [];
    useUIStore.getState().setHistory(history);
    return history;
  } catch (error) {
    console.error('[API] Ошибка при получении истории:', error);
    useUIStore.getState().setErrorMessage('Не удалось загрузить историю. Попробуйте позже.');
    return [] as HistoryRecord[];
  }
}

export function onWindowResize() {
  if (!state.camera || !state.renderer || !state.composer) return;
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
      child.geometry?.dispose();
      child.material?.dispose();
    });
    graphics.createMenuEqualizer();
  }
}

export function updateStyleUI() {
  const store = useUIStore.getState();

  if (state.isSketchModeActive) {
    store.setStyleRank(true, 'style-rank-antiverse');
    store.setRankImage('/assets/images/antiverse.png');
    store.setMultiplierText('(x20)');
    return;
  }

  store.setStyleRank(store.styleRankVisible, '');

  if (state.currentRankIndex > -1) {
    state.rankHistory.push(state.currentRankIndex);
  }

  const rankChanged = state.currentRankIndex !== state.previousRankIndex;
  if (rankChanged && state.currentRankIndex > state.previousRankIndex) {
    if (state.currentRankIndex <= 1) audio.soundManager.playSound('matchsmall');
    else if (state.currentRankIndex <= 3) audio.soundManager.playSound('matchlarge');
    else audio.soundManager.playSound('matchhuge');
  }

  const isARankNow = state.currentRankIndex >= 3;
  if (isARankNow && !state.isARankEffectActive) {
    state.isARankEffectActive = true;
    if (state.videoScreensGroup.children.length === 0 && state.videoUrl) {
      graphics.setupAndPositionVideoScreens();
    }
    graphics.updateVideoScreensVisibility(true);
  } else if (!isARankNow && state.isARankEffectActive) {
    state.isARankEffectActive = false;
    graphics.updateVideoScreensVisibility(false);
  }

  const isStormActiveNow = state.currentRankIndex >= 4;
  if (isStormActiveNow && !state.storm.active) {
    state.storm.active = true;
    state.storm.lastFlashTime = state.audioContext.currentTime;
    state.storm.nextFlashDelay = 1 + Math.random() * 2;
  } else if (!isStormActiveNow && state.storm.active) {
    state.storm.active = false;
    if (state.storm.lightningFlash) state.storm.lightningFlash.intensity = 0;
  }

  if (state.currentRankIndex === -1) {
    store.setStyleRank(false, '');
    store.setMultiplierText('(x1)');
    state.previousRankIndex = state.currentRankIndex;
    return;
  }

  const newClass = state.currentRankIndex < 4 ? 'style-rank-blue' : 'style-rank-gold';
  store.setStyleRank(true, newClass);

  const currentRank = config.STYLE_RANKS[state.currentRankIndex];
  store.setMultiplierText(`(x${currentRank.multiplier})`);
  store.setRankImage(currentRank.image);

  const isMaxRank = state.currentRankIndex === config.STYLE_RANKS.length - 1;
  if (isMaxRank) {
    store.setProgress(1);
  } else {
    const hitsForNextRank = config.STYLE_RANKS[state.currentRankIndex + 1].hitsNeeded;
    const progress = (state.consecutiveHits - currentRank.hitsNeeded) / (hitsForNextRank - currentRank.hitsNeeded);
    store.setProgress(Math.min(progress, 1));
  }

  store.setRankIndex(state.currentRankIndex);
  state.previousRankIndex = state.currentRankIndex;
}

export function setLoadingTrack(songTitle: string) {
  const lang = useUIStore.getState().currentLang;
  useUIStore.getState().setLoadingText(i18nT(lang, 'loading_track') + songTitle);
}

export function setAnalysisState() {
  const lang = useUIStore.getState().currentLang;
  useUIStore.getState().setLoadingText(i18nT(lang, 'loading_analysis'));
}

export function showError(message: string) {
  const store = useUIStore.getState();
  store.setStartPrompt(message, '#f55');
  store.setScreen('start');
}

export function setScreenLoading(songTitle?: string) {
  const store = useUIStore.getState();
  store.setScreen('loading');
  store.setGameHudVisible(false);
  store.setPauseMenuVisible(false);
  store.setTotalScoreVisible(false);
  store.setClaimButtonVisible(false);
  if (songTitle) setLoadingTrack(songTitle);
}

export function setScreenGame() {
  const store = useUIStore.getState();
  store.setScreen('game');
  store.setGameHudVisible(true);
  store.setPauseMenuVisible(false);
  store.setTotalScoreVisible(false);
  store.setClaimButtonVisible(false);
  store.setFileLabelVisible(false);
}

export function setScreenEnd() {
  const store = useUIStore.getState();
  store.setGameHudVisible(false);
  store.setPauseMenuVisible(false);
  store.setStyleRank(false, '');
  store.setScreen('end');
}

export function setScreenStart() {
  const store = useUIStore.getState();
  store.setScreen('start');
  store.setFileLabelVisible(true);
  store.setFileInputDisabled(false);
  store.setTotalScoreVisible(true);
  store.setClaimButtonVisible(true);
  store.setStartPrompt(`${i18nT(store.currentLang, 'start_prompt')}<br><small>${i18nT(store.currentLang, 'start_vpn')}</small>`);
}

export function setScreenEntry() {
  useUIStore.getState().setScreen('entry');
}

export function hideSearchResults() {
  const store = useUIStore.getState();
  store.setSearchResults([], false);
  store.setSearchQuery('');
}

export function setPaused(paused: boolean) {
  const store = useUIStore.getState();
  store.setPaused(paused);
  store.setPauseMenuVisible(paused);
}

export function setScore(score: number) {
  useUIStore.getState().setScore(score);
}

export function setFinalScore(score: number) {
  useUIStore.getState().setFinalScore(score);
}

export function setVignetteFlash() {
  const store = useUIStore.getState();
  store.setVignetteOpacity(1);
  setTimeout(() => store.setVignetteOpacity(0), 100);
}
