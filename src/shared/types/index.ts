export type Language = 'en' | 'ru';

export interface SongSuggestion {
  title: string;
  videoId: string;
}

export interface HistoryRecord {
  track_name: string;
  best_score: number;
  performance_rank: string;
}

export interface Rank {
  name: string;
  rank: string;
  hitsNeeded: number;
  multiplier: number;
  image: string;
}

export interface KeyState {
  left: boolean;
  right: boolean;
}

export interface GameStateType {
  [key: string]: unknown;
}
