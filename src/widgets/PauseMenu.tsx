import * as audio from '@/entities/audio';
import { useTranslation } from '@/shared/lib/i18n';

export default function PauseMenu() {
  const t = useTranslation();

  return (
    <div id="pause-menu">
      <h1>{t('pause_title')}</h1>
      <button id="resume-button" onClick={() => audio.togglePause()}>
        {t('btn_resume')}
      </button>
      <button id="main-menu-button" onClick={() => location.reload()}>
        {t('btn_menu')}
      </button>
    </div>
  );
}
