import { useUIStore } from '@/shared/model/store';
import * as audio from '@/entities/audio';
import { useTranslation } from '@/shared/lib/i18n';

export default function GameHud() {
  const score = useUIStore((s) => s.score);
  const multiplier = useUIStore((s) => s.multiplierText);
  const rankImage = useUIStore((s) => s.rankImage);
  const progress = useUIStore((s) => s.progress);
  const styleRankVisible = useUIStore((s) => s.styleRankVisible);
  const styleRankClass = useUIStore((s) => s.styleRankClass);
  const gameHudVisible = useUIStore((s) => s.gameHudVisible);
  const t = useTranslation();

  const hudClass = `game-hud ${styleRankClass} ${gameHudVisible ? '' : 'hidden'}`.trim();
  const styleRankContainerClass = `${styleRankClass} ${styleRankVisible ? '' : 'hidden'}`.trim();

  return (
    <>
      <div id="game-hud" className={hudClass}>
        <div id="score-container">
          <span>{t('hud_score')}</span> <span id="score">{score}</span>{' '}
          <span id="score-multiplier">{multiplier}</span>
        </div>
        <button id="pause-button" onClick={() => audio.togglePause()}>
          {t('btn_pause')}
        </button>
      </div>
      <div id="style-rank-container" className={styleRankContainerClass}>
        <img id="rank-image" src={rankImage} alt="Current Rank" />
        <div id="progress-bar-container">
          <div id="progress-bar-fill" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
    </>
  );
}
