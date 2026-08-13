<script setup lang="ts">
import { computed, ref } from 'vue';
import AppShell from './components/layout/AppShell.vue';
import type { NavItem } from './components/layout/SideNav.vue';
import PeopleView from './views/PeopleView.vue';
import InformationView from './views/InformationView.vue';
import AnalyticsView from './views/AnalyticsView.vue';
import SimulationView from './views/SimulationView.vue';
import { t } from './lib/i18n';

const NAV_ITEMS = computed<NavItem[]>(() => [
  { id: 'people', label: t('nav.people'), icon: 'person' },
  { id: 'information', label: t('nav.information'), icon: 'info' },
  { id: 'analytics', label: t('nav.analytics'), icon: 'analytics' },
  { id: 'simulation', label: t('nav.simulation'), icon: 'science' },
]);

const PAGE_COPY = computed<Record<string, { title: string; subtitle: string }>>(() => ({
  people: { title: t('page.people.title'), subtitle: t('page.people.subtitle') },
  information: { title: t('page.information.title'), subtitle: t('page.information.subtitle') },
  analytics: { title: t('page.analytics.title'), subtitle: t('page.analytics.subtitle') },
  simulation: { title: t('page.simulation.title'), subtitle: t('page.simulation.subtitle') },
}));

const active = ref('people');
const page = computed(() => PAGE_COPY.value[active.value]);
</script>

<template>
  <AppShell
    v-model="active"
    :items="NAV_ITEMS"
    :title="page.title"
    :subtitle="page.subtitle"
  >
    <PeopleView v-if="active === 'people'" />
    <InformationView v-else-if="active === 'information'" />
    <AnalyticsView v-else-if="active === 'analytics'" />
    <SimulationView v-else-if="active === 'simulation'" />
    <div
      v-else
      class="text-body-md text-on-surface-variant"
    >
      {{ t('common.comingSoon') }}
    </div>
  </AppShell>
</template>
