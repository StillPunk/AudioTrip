import { useEffect, useCallback, useRef } from 'react';
import { useUIStore } from '@/shared/model/store';
import * as game from '@/entities/game';
import { useTranslation } from '@/shared/lib/i18n';

export default function SearchBar() {
  const query = useUIStore((s) => s.searchQuery);
  const results = useUIStore((s) => s.searchResults);
  const visible = useUIStore((s) => s.searchResultsVisible);
  const setSearchQuery = useUIStore((s) => s.setSearchQuery);
  const setSearchResults = useUIStore((s) => s.setSearchResults);
  const hideSearchResults = useUIStore((s) => s.hideSearchResults);
  const t = useTranslation();
  const timeoutRef = useRef<number | null>(null);

  const search = useCallback(
    (rawQuery: string) => {
      const oldScript = document.getElementById('jsonp-script');
      if (oldScript) oldScript.remove();
      const callbackName = 'jsonp_callback_' + Date.now();
      (window as any)[callbackName] = (data: any) => {
        const suggestions: string[] = data?.[1] ?? [];
        setSearchResults(suggestions.map((title) => ({ title, videoId: '' })));
        document.getElementById('jsonp-script')?.remove();
        delete (window as any)[callbackName];
      };
      const script = document.createElement('script');
      script.id = 'jsonp-script';
      script.src = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(rawQuery)}&callback=${callbackName}`;
      script.onerror = () => {
        console.error('Ошибка загрузки JSONP скрипта.');
        delete (window as any)[callbackName];
        document.getElementById('jsonp-script')?.remove();
      };
      document.body.appendChild(script);
    },
    [setSearchResults]
  );

  useEffect(() => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    if (query.length < 3) {
      hideSearchResults();
      return;
    }
    timeoutRef.current = window.setTimeout(() => search(query), 400);
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, [query, search, hideSearchResults]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.id !== 'song-search-input') hideSearchResults();
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [hideSearchResults]);

  const handleSelect = (title: string) => {
    hideSearchResults();
    void game.onSongSelectFromSearch({ title, videoId: '' });
  };

  return (
    <div id="search-container">
      <input
        type="text"
        id="song-search-input"
        value={query}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder={t('search_placeholder')}
        autoComplete="off"
      />
      {visible && results.length > 0 && (
        <div id="autocomplete-results">
          {results.map((song, idx) => (
            <div
              key={idx}
              className="result-item"
              title={song.title}
              onClick={() => handleSelect(song.title)}
            >
              {song.title}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
