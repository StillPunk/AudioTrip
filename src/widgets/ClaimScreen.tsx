import { useUIStore } from '@/shared/model/store';
import { useTranslation } from '@/shared/lib/i18n';

export default function ClaimScreen({ hidden }: { hidden: boolean }) {
  const setScreen = useUIStore((s) => s.setScreen);
  const t = useTranslation();

  return (
    <div id="claim-screen" className={`menu-screen ${hidden ? 'hidden' : ''}`}>
      <h1>{t('claim_title')}</h1>
      <p>{t('claim_desc')}</p>
      <button id="claim-close-button" onClick={() => setScreen('start')}>
        {t('btn_close')}
      </button>
    </div>
  );
}
