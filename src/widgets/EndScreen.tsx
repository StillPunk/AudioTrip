import { useUIStore } from '@/shared/model/store';
import { useTranslation } from '@/shared/lib/i18n';

export default function EndScreen() {
  const finalScore = useUIStore((s) => s.finalScore);
  const t = useTranslation();

  return (
    <div id="end-screen">
      <h1>{t('end_title')}</h1>
      <p>
        <span>{t('end_score')}</span> <span id="final-score">{finalScore}</span>
      </p>
      <button id="restart-button" onClick={() => location.reload()}>
        {t('btn_menu')}
      </button>
    </div>
  );
}
