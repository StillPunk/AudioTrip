import { useUIStore } from '@/shared/model/store';
import * as game from '@/entities/game';
import * as ui from '@/entities/ui';
import * as audio from '@/entities/audio';
import SearchBar from './SearchBar';
import { useTranslation } from '@/shared/lib/i18n';

export default function StartScreen() {
  const screen = useUIStore((s) => s.screen);
  const startPrompt = useUIStore((s) => s.startPrompt);
  const fileLabelVisible = useUIStore((s) => s.fileLabelVisible);
  const fileInputDisabled = useUIStore((s) => s.fileInputDisabled);
  const totalScoreVisible = useUIStore((s) => s.totalScoreVisible);
  const totalScore = useUIStore((s) => s.totalScore);
  const claimVisible = useUIStore((s) => s.claimButtonVisible);
  const t = useTranslation();

  if (screen !== 'start') return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) game.onFileSelect(e.nativeEvent);
  };

  const playHover = () => audio.soundManager.playSound('buttonhover');
  const playClick = () => audio.soundManager.playSound('buttonclick');

  return (
    <div id="start-screen" style={{ pointerEvents: 'all' }}>
      <h1>
        Audio<span className="silver-trip">Trip</span>
      </h1>
      <div id="start-prompt" dangerouslySetInnerHTML={{ __html: startPrompt }} />
      <SearchBar />
      <p className="or-separator">{t('or')}</p>
      <div className="main-menu-actions">
        <label
          htmlFor="audio-file-input"
          className={`file-label ${!fileLabelVisible ? 'hidden' : ''}`}
          id="file-label"
          onMouseEnter={playHover}
        >
          {t('btn_choose_file')}
        </label>
        <input
          type="file"
          id="audio-file-input"
          accept="*"
          onChange={handleFileChange}
          disabled={fileInputDisabled}
          className="hidden"
        />
        <button id="history-button" onMouseEnter={playHover} onClick={() => { playClick(); void ui.loadHistory().then(() => useUIStore.getState().setScreen('history')); }}>
          {t('btn_history')}
        </button>
        <button id="leaderboard-button" onMouseEnter={playHover} onClick={() => { playClick(); useUIStore.getState().setScreen('leaderboard'); }}>
          {t('btn_leaders')}
        </button>
      </div>
      {totalScoreVisible && (
        <div id="total-score-container">
          <span>{t('total_balance')}</span> <span id="total-score">{totalScore}</span>
        </div>
      )}
      {claimVisible && (
        <button id="claim-button" onMouseEnter={playHover} onClick={() => { playClick(); useUIStore.getState().setScreen('claim'); }}>
          {t('btn_claim')}
        </button>
      )}
    </div>
  );
}
