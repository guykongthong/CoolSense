<script setup lang="ts">
import { locale, setLocale } from '../../lib/i18n';
</script>

<template>
  <div class="flex gap-1 bg-surface-container-low rounded-full p-1">
    <button
      type="button"
      class="px-3 py-1 rounded-full text-label-sm transition-colors"
      :class="locale === 'en' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'"
      @click="setLocale('en')"
    >
      EN
    </button>
    <button
      type="button"
      class="px-3 py-1 rounded-full text-label-sm transition-colors"
      :class="locale === 'ko' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'"
      @click="setLocale('ko')"
    >
      KO
    </button>
  </div>
</template>
