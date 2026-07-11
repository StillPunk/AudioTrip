import { useUIStore } from '@/shared/model/store';
import * as audio from '@/entities/audio';
import { useTranslation } from '@/shared/lib/i18n';

export default function ClaimButton() {
  const visible = useUIStore((s) => s.claimButtonVisible);
  const screen = useUIStore((s) => s.screen);
  const setScreen = useUIStore((s) => s.setScreen);
  const t = useTranslation();

  if (screen !== 'start') return null;

  return (
    <button
      id="claim-button"
      className={visible ? '' : 'hidden'}
      onMouseEnter={() => audio.soundManager.playSound('buttonhover')}
      onClick={() => {
        audio.soundManager.playSound('buttonclick');
        setScreen('claim');
      }}
    >
      {t('btn_claim')}
    </button>
  );
}
