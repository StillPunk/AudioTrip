import * as ui from '@/entities/ui';
import { useUIStore } from '@/shared/model/store';
import { useTranslation } from '@/shared/lib/i18n';

export default function TutorialScreen() {
  const t = useTranslation();
  const tutorialVisible = useUIStore((s) => s.tutorialVisible);

  return (
    <div id="tutorial-screen" className={`menu-screen ${tutorialVisible ? '' : 'hidden'}`}>
      <h1>{t('tutorial_title')}</h1>
      <p dangerouslySetInnerHTML={{ __html: t('tutorial_desc_1') }} />
      <p>{t('tutorial_desc_2')}</p>
      <button id="tutorial-continue-button" onClick={() => ui.resolveTutorial()}>
        {t('tutorial_btn_ok')}
      </button>
    </div>
  );
}
