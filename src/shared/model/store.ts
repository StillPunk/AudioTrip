import { create } from 'zustand';
import type { HistoryRecord, SongSuggestion, Language } from '@/shared/types';

export type Screen =
  | 'telegram-fallback'
  | 'entry'
  | 'start'
  | 'loading'
  | 'game'
  | 'paused'
  | 'end'
  | 'history'
  | 'leaderboard'
  | 'tutorial'
  | 'claim';

export interface UIStore {
  currentLang: Language;
  screen: Screen;
  loadingText: string;
  searchQuery: string;
  searchResults: SongSuggestion[];
  searchResultsVisible: boolean;
  score: number;
  finalScore: number;
  totalScore: string;
  rankIndex: number;
  previousRankIndex: number;
  rankImage: string;
  multiplierText: string;
  progress: number;
  styleRankClass: string;
  styleRankVisible: boolean;
  gameHudVisible: boolean;
  pauseMenuVisible: boolean;
  totalScoreVisible: boolean;
  claimButtonVisible: boolean;
  vignetteOpacity: number;
  startPrompt: string;
  startPromptColor: string;
  fileInputDisabled: boolean;
  fileLabelVisible: boolean;
  history: HistoryRecord[];
  errorMessage: string | null;
  tutorialVisible: boolean;
  isPaused: boolean;

  // actions
  setLanguage: (lang: Language) => void;
  setScreen: (screen: Screen) => void;
  setLoadingText: (text: string) => void;
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: SongSuggestion[], visible?: boolean) => void;
  hideSearchResults: () => void;
  setScore: (score: number) => void;
  setFinalScore: (score: number) => void;
  setTotalScore: (total: string) => void;
  setRankIndex: (index: number) => void;
  setRankImage: (src: string) => void;
  setMultiplierText: (text: string) => void;
  setProgress: (progress: number) => void;
  setStyleRank: (visible: boolean, className: string) => void;
  setGameHudVisible: (visible: boolean) => void;
  setPauseMenuVisible: (visible: boolean) => void;
  setPaused: (paused: boolean) => void;
  setTotalScoreVisible: (visible: boolean) => void;
  setClaimButtonVisible: (visible: boolean) => void;
  setVignetteOpacity: (opacity: number) => void;
  setStartPrompt: (text: string, color?: string) => void;
  setFileInputDisabled: (disabled: boolean) => void;
  setFileLabelVisible: (visible: boolean) => void;
  setHistory: (records: HistoryRecord[]) => void;
  setErrorMessage: (message: string | null) => void;
  setTutorialVisible: (visible: boolean) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  currentLang: 'en',
  screen: 'entry',
  loadingText: '',
  searchQuery: '',
  searchResults: [],
  searchResultsVisible: false,
  score: 0,
  finalScore: 0,
  totalScore: '0',
  rankIndex: -1,
  previousRankIndex: -1,
  rankImage: '',
  multiplierText: '(x1)',
  progress: 0,
  styleRankClass: '',
  styleRankVisible: false,
  gameHudVisible: false,
  pauseMenuVisible: false,
  totalScoreVisible: false,
  claimButtonVisible: false,
  vignetteOpacity: 0,
  startPrompt: '',
  startPromptColor: '',
  fileInputDisabled: true,
  fileLabelVisible: false,
  history: [],
  errorMessage: null,
  tutorialVisible: false,
  isPaused: false,

  setLanguage: (lang) => set({ currentLang: lang }),
  setScreen: (screen) => set({ screen }),
  setLoadingText: (loadingText) => set({ loadingText }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSearchResults: (searchResults, searchResultsVisible = true) =>
    set({ searchResults, searchResultsVisible }),
  hideSearchResults: () => set({ searchResultsVisible: false }),
  setScore: (score) => set({ score }),
  setFinalScore: (finalScore) => set({ finalScore }),
  setTotalScore: (totalScore) => set({ totalScore }),
  setRankIndex: (rankIndex) => set((s) => ({ previousRankIndex: s.rankIndex, rankIndex })),
  setRankImage: (rankImage) => set({ rankImage }),
  setMultiplierText: (multiplierText) => set({ multiplierText }),
  setProgress: (progress) => set({ progress }),
  setStyleRank: (styleRankVisible, styleRankClass) => set({ styleRankVisible, styleRankClass }),
  setGameHudVisible: (gameHudVisible) => set({ gameHudVisible }),
  setPauseMenuVisible: (pauseMenuVisible) => set({ pauseMenuVisible }),
  setPaused: (isPaused) => set({ isPaused }),
  setTotalScoreVisible: (totalScoreVisible) => set({ totalScoreVisible }),
  setClaimButtonVisible: (claimButtonVisible) => set({ claimButtonVisible }),
  setVignetteOpacity: (vignetteOpacity) => set({ vignetteOpacity }),
  setStartPrompt: (startPrompt, startPromptColor = '') => set({ startPrompt, startPromptColor }),
  setFileInputDisabled: (fileInputDisabled) => set({ fileInputDisabled }),
  setFileLabelVisible: (fileLabelVisible) => set({ fileLabelVisible }),
  setHistory: (history) => set({ history }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),
  setTutorialVisible: (tutorialVisible) => set({ tutorialVisible }),
}));
