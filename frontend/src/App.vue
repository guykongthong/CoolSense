<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppShell from './components/layout/AppShell.vue';
import type { NavItem } from './components/layout/SideNav.vue';
import { t } from './lib/i18n';
import { useMaintenanceAlerts } from './composables/useMaintenanceAlerts';

const route = useRoute();
const router = useRouter();
const { openCount } = useMaintenanceAlerts();

const NAV_ITEMS = computed<NavItem[]>(() =>
  router
    .getRoutes()
    .filter((r) => r.meta.navKey)
    .map((r) => ({
      id: String(r.name),
      to: r.path,
      label: t(r.meta.navKey),
      icon: r.meta.icon,
      badge: r.name === 'maintenance' ? openCount.value : undefined,
    })),
);

const title = computed(() => (route.meta.titleKey ? t(route.meta.titleKey) : ''));
const subtitle = computed(() => (route.meta.subtitleKey ? t(route.meta.subtitleKey) : ''));
</script>

<template>
  <AppShell
    :items="NAV_ITEMS"
    :title="title"
    :subtitle="subtitle"
  >
    <RouterView />
  </AppShell>
</template>
