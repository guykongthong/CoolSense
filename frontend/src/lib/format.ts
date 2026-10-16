import { computed } from 'vue';
import { locale, t } from './i18n';

export const intlLocale = computed(() => (locale.value === 'th' ? 'th-TH' : 'en-US'));

export function formatNumber(value: number, digits = 1): string {
  return Number(value).toLocaleString(intlLocale.value, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

export function formatDate(value: Date | string | number): string {
  return toDate(value).toLocaleDateString(intlLocale.value, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatShortDate(value: Date | string | number): string {
  return toDate(value).toLocaleDateString(intlLocale.value, { month: 'short', day: 'numeric' });
}

export function formatTime(value: Date | string | number): string {
  return toDate(value).toLocaleTimeString(intlLocale.value, { hour: '2-digit', minute: '2-digit' });
}

export function formatBaht(value: number, digits = 0): string {
  return `${formatNumber(value, digits)} ${t('common.baht')}`;
}
