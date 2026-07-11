import { useUIStore } from '@/shared/model/store';
import { useTranslation } from '@/shared/lib/i18n';

export default function HistoryScreen({ hidden }: { hidden: boolean }) {
  const history = useUIStore((s) => s.history);
  const setScreen = useUIStore((s) => s.setScreen);
  const t = useTranslation();

  return (
    <div id="history-screen" className={`menu-screen ${hidden ? 'hidden' : ''}`}>
      <h1>{t('history_title')}</h1>
      <div id="history-table-container">
        <table>
          <thead>
            <tr>
              <th>{t('table_track')}</th>
              <th>{t('table_score')}</th>
              <th>{t('table_rank')}</th>
            </tr>
          </thead>
          <tbody id="history-table-body">
            {history.map((record, idx) => (
              <tr key={idx}>
                <td>{record.track_name}</td>
                <td>{record.best_score.toLocaleString('ru-RU')}</td>
                <td>{record.performance_rank}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button id="history-close-button" onClick={() => setScreen('start')}>
        {t('btn_close')}
      </button>
    </div>
  );
}
