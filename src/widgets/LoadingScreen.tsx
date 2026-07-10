import { useTranslation } from '@/shared/lib/i18n';
import { useUIStore } from '@/shared/model/store';

export default function LoadingScreen() {
  const loadingText = useUIStore((s) => s.loadingText);
  const t = useTranslation();

  return (
    <div id="loading-screen">
      <p id="loading-text">{t('loading_wait')}</p>
      <p id="analysis-text">{loadingText || t('loading_analysis')}</p>
    </div>
  );
}
