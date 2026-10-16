import { createRouter, createWebHashHistory } from 'vue-router';
import PeopleView from './views/PeopleView.vue';
import InformationView from './views/InformationView.vue';
import AnalyticsView from './views/AnalyticsView.vue';
import SimulationView from './views/SimulationView.vue';
import MaintenanceView from './views/MaintenanceView.vue';
import SettingsView from './views/SettingsView.vue';

declare module 'vue-router' {
  interface RouteMeta {
    titleKey: string;
    subtitleKey: string;
    navKey: string;
    icon: string;
  }
}

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/overview' },
    { path: '/people', redirect: '/overview' },
    { path: '/information', redirect: '/device' },
    {
      path: '/overview',
      name: 'overview',
      component: PeopleView,
      meta: { titleKey: 'page.people.title', subtitleKey: 'page.people.subtitle', navKey: 'nav.people', icon: 'dashboard' },
    },
    {
      path: '/device',
      name: 'device',
      component: InformationView,
      meta: { titleKey: 'page.information.title', subtitleKey: 'page.information.subtitle', navKey: 'nav.information', icon: 'ac_unit' },
    },
    {
      path: '/analytics',
      name: 'analytics',
      component: AnalyticsView,
      meta: { titleKey: 'page.analytics.title', subtitleKey: 'page.analytics.subtitle', navKey: 'nav.analytics', icon: 'analytics' },
    },
    {
      path: '/simulation',
      name: 'simulation',
      component: SimulationView,
      meta: { titleKey: 'page.simulation.title', subtitleKey: 'page.simulation.subtitle', navKey: 'nav.simulation', icon: 'science' },
    },
    {
      path: '/maintenance',
      name: 'maintenance',
      component: MaintenanceView,
      meta: { titleKey: 'page.maintenance.title', subtitleKey: 'page.maintenance.subtitle', navKey: 'nav.maintenance', icon: 'cleaning_services' },
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsView,
      meta: { titleKey: 'page.settings.title', subtitleKey: 'page.settings.subtitle', navKey: 'nav.settings', icon: 'settings' },
    },
    { path: '/:pathMatch(.*)*', redirect: '/overview' },
  ],
});
