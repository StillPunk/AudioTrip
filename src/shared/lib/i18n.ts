import * as config from '@/shared/config';
import { useUIStore } from '@/shared/model/store';
import type { Language } from '@/shared/types';

export function t(lang: Language, key: string): string {
  return config.translations[lang]?.[key] || key;
}

export function useTranslation() {
  const currentLang = useUIStore((s) => s.currentLang);
  return (key: string) => t(currentLang, key);
}

export function getCurrentLanguage(): Language {
  return useUIStore.getState().currentLang;
}
