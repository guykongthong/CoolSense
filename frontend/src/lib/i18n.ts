import { ref } from 'vue';
import core from './locales/core';
import carbon from './locales/carbon';
import maintenance from './locales/maintenance';
import settings from './locales/settings';

export type Locale = 'en' | 'th';

const STORAGE_KEY = 'coolsense_locale';

function initialLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY);
  // 'ko' was removed, fall back to English for anyone who had it saved.
  return stored === 'th' ? 'th' : 'en';
}

export const locale = ref<Locale>(initialLocale());
document.documentElement.lang = locale.value;

export function setLocale(next: Locale) {
  locale.value = next;
  localStorage.setItem(STORAGE_KEY, next);
  document.documentElement.lang = next;
}

type Messages = Record<string, string>;

const messages: Record<Locale, Messages> = {
  en: { ...core.en, ...carbon.en, ...maintenance.en, ...settings.en },
  th: { ...core.th, ...carbon.th, ...maintenance.th, ...settings.th },
};

export function t(key: string, vars?: Record<string, string | number>): string {
  let text = messages[locale.value][key] ?? messages.en[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}
