import { useRef } from 'react';
import { state } from '@/shared/model/gameState';
import * as audio from '@/entities/audio';
import * as ui from '@/entities/ui';
import { useTranslation } from '@/shared/lib/i18n';
import gsap from 'gsap';

export default function EntryBox() {
  const entryRef = useRef<HTMLDivElement>(null);
  const t = useTranslation();

  const handleStart = async () => {
    audio.initSystemAudio();
    await audio.soundManager.loadSounds();
    sessionStorage.setItem('warningSeen', 'true');
    state.menuActive = true;
    await audio.playMenuMusic();

    const el = entryRef.current;
    if (!el) {
      ui.setScreenStart();
      return;
    }

    gsap.to(el, {
      duration: 0.5,
      scale: 0.8,
      y: -200,
      opacity: 0,
      ease: 'power2.in',
      onComplete: () => ui.setScreenStart(),
    });
  };

  return (
    <div id="entry-box" ref={entryRef}>
      <h1>{t('warning_title')}</h1>
      <p>{t('warning_text')}</p>
      <button id="entry-button" onClick={handleStart}>
        {t('btn_start')}
      </button>
    </div>
  );
}
