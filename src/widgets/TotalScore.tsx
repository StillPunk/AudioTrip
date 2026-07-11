import { useUIStore } from '@/shared/model/store';
import { useTranslation } from '@/shared/lib/i18n';

export default function TotalScore() {
  const totalScore = useUIStore((s) => s.totalScore);
  const visible = useUIStore((s) => s.totalScoreVisible);
  const screen = useUIStore((s) => s.screen);
  const t = useTranslation();

  if (screen !== 'start') return null;

  return (
    <div id="total-score-container" className={visible ? '' : 'hidden'}>
      <span>{t('total_balance')}</span> <span id="total-score">{totalScore}</span>
    </div>
  );
}
