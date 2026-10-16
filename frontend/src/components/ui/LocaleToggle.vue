<script setup lang="ts">
import { locale, setLocale, t } from '../../lib/i18n';
</script>

<template>
  <div
    class="flex gap-1 bg-surface-container-low rounded-full p-1"
    role="group"
    :aria-label="t('locale.toggleLabel')"
  >
    <button
      type="button"
      class="px-3 py-1 min-h-8 rounded-full text-label-sm transition-colors"
      :class="locale === 'en' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'"
      :aria-pressed="locale === 'en'"
      aria-label="English"
      @click="setLocale('en')"
    >
      EN
    </button>
    <button
      type="button"
      class="px-3 py-1 min-h-8 rounded-full text-label-sm transition-colors"
      :class="locale === 'th' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'"
      :aria-pressed="locale === 'th'"
      aria-label="ไทย"
      lang="th"
      @click="setLocale('th')"
    >
      ไทย
    </button>
  </div>
</template>
