import { useUIStore } from '@/shared/model/store';
import { state } from '@/shared/model/gameState';
import * as audio from '@/entities/audio';
import { useTranslation } from '@/shared/lib/i18n';

export default function EntryBox() {
  const setScreen = useUIStore((s) => s.setScreen);
  const t = useTranslation();

  const handleStart = async () => {
    audio.initSystemAudio();
    await audio.soundManager.loadSounds();
    sessionStorage.setItem('warningSeen', 'true');
    state.menuActive = true;
    await audio.playMenuMusic();
    setScreen('start');
  };

  return (
    <div id="entry-box">
      <h1>{t('warning_title')}</h1>
      <p>{t('warning_text')}</p>
      <button id="entry-button" onClick={handleStart}>
        {t('btn_start')}
      </button>
    </div>
  );
}
