import { useUIStore } from '@/shared/model/store';
import { useTranslation } from '@/shared/lib/i18n';

export default function LeaderboardScreen() {
  const setScreen = useUIStore((s) => s.setScreen);
  const t = useTranslation();

  return (
    <div id="leaderboard-screen" className="menu-screen">
      <h1>{t('leaderboard_title')}</h1>
      <p>{t('leaderboard_soon')}</p>
      <button id="leaderboard-close-button" onClick={() => setScreen('start')}>
        {t('btn_close')}
      </button>
    </div>
  );
}
