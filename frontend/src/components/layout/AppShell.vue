<script setup lang="ts">
import SideNav, { type NavItem } from './SideNav.vue';
import MobileDrawer from './MobileDrawer.vue';
import LocaleToggle from '../ui/LocaleToggle.vue';
import FloorSelector from './FloorSelector.vue';
import BuildingChip from './BuildingChip.vue';
import { t } from '../../lib/i18n';
import { isDemoMode } from '../../lib/mock/mode';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

const props = defineProps<{
  items: NavItem[];
  title: string;
  subtitle: string;
}>();

// Settings is about buildings, a floor filter means nothing there.
const route = useRoute();
const showFloors = computed(() => isDemoMode && route.name !== 'settings');

// Bottom bar keeps the four routes used most, the drawer has all of them.
const BOTTOM_IDS = ['overview', 'device', 'analytics', 'maintenance'];
const bottomItems = computed(() => props.items.filter((i) => BOTTOM_IDS.includes(i.id)));

const drawerOpen = ref(false);
const menuButton = ref<HTMLButtonElement | null>(null);

function closeDrawer() {
  if (!drawerOpen.value) return;
  drawerOpen.value = false;
  nextTick(() => menuButton.value?.focus());
}

watch(() => route.fullPath, closeDrawer);

// A wide window shows the sidebar, so the drawer has nothing left to do.
const wide = typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)') : null;
function onWide(e: MediaQueryListEvent) {
  if (e.matches) drawerOpen.value = false;
}
onMounted(() => wide?.addEventListener('change', onWide));
onBeforeUnmount(() => wide?.removeEventListener('change', onWide));

function focusMain() {
  document.getElementById('main')?.focus();
}
</script>

<template>
  <div class="min-h-screen flex flex-col md:flex-row bg-background text-on-background">
    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-primary focus:text-on-primary focus:px-4 focus:py-2 focus:rounded-lg"
      @click.prevent="focusMain"
    >{{ t('nav.skipToContent') }}</a>

    <SideNav
      class="hidden md:flex fixed left-0 top-0 h-screen z-40"
      :items="items"
    />

    <div class="flex-1 md:ml-64 flex flex-col min-h-screen">
      <header class="bg-surface sticky top-0 z-30 border-b border-surface-container-high md:border-none">
        <div class="flex justify-between items-center px-4 md:px-10 h-20 max-w-[1280px] mx-auto">
          <div class="md:hidden flex items-center gap-1 min-w-0 -ml-2">
            <button
              ref="menuButton"
              type="button"
              class="min-h-11 min-w-11 inline-flex items-center justify-center rounded-full text-on-surface hover:bg-surface-container-high"
              :aria-label="t('nav.openMenu')"
              :aria-expanded="drawerOpen"
              aria-controls="mobile-drawer"
              @click="drawerOpen = true"
            >
              <span
                class="material-symbols-outlined"
                aria-hidden="true"
              >menu</span>
            </button>
            <span class="text-headline-md font-bold text-primary truncate">CoolSense</span>
          </div>
          <div class="hidden md:flex flex-col">
            <h2 class="text-headline-lg text-on-surface">
              {{ title }}
            </h2>
            <p class="text-body-md text-on-surface-variant">
              {{ subtitle }}
            </p>
          </div>
          <div class="flex items-center gap-2 md:gap-3 shrink-0">
            <div
              id="header-actions"
              class="flex items-center"
            />
            <BuildingChip />
            <FloorSelector
              v-if="showFloors"
              class="hidden md:flex"
            />
            <LocaleToggle class="hidden md:flex" />
          </div>
        </div>
      </header>

      <main
        id="main"
        tabindex="-1"
        class="flex-1 p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:p-10 md:pb-10 focus:outline-none max-w-[1280px] mx-auto w-full flex flex-col gap-6"
      >
        <div class="md:hidden">
          <h2 class="text-headline-lg-mobile text-on-surface">
            {{ title }}
          </h2>
          <p class="text-body-md text-on-surface-variant">
            {{ subtitle }}
          </p>
        </div>
        <FloorSelector
          v-if="showFloors"
          variant="chips"
          class="md:hidden"
        />
        <slot />
      </main>

      <footer class="bg-on-surface text-inverse-on-surface py-8 mt-auto">
        <div class="flex flex-col md:flex-row justify-between items-center gap-2 px-4 md:px-10 max-w-[1280px] mx-auto text-label-sm">
          <span class="font-bold text-primary-fixed-dim">CoolSense</span>
          <p>{{ t('shell.footerTagline') }}</p>
        </div>
      </footer>
    </div>

    <MobileDrawer
      :open="drawerOpen"
      :items="items"
      @close="closeDrawer"
    >
      <div class="mt-auto pt-6 flex items-center justify-between gap-3">
        <span class="text-label-md text-on-surface-variant">{{ t('locale.toggleLabel') }}</span>
        <LocaleToggle />
      </div>
    </MobileDrawer>

    <nav
      class="md:hidden fixed bottom-0 inset-x-0 z-40 bg-surface-container-lowest border-t border-outline-variant flex pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
      :aria-label="t('nav.main')"
    >
      <RouterLink
        v-for="item in bottomItems"
        :key="item.id"
        :to="item.to"
        class="relative flex-1 min-h-14 min-w-0 px-1 flex flex-col items-center justify-center gap-0.5 py-1.5 text-on-surface-variant"
        active-class="nav-active"
      >
        <span
          class="material-symbols-outlined"
          aria-hidden="true"
        >{{ item.icon }}</span>
        <span class="text-label-sm leading-tight text-center">{{ item.label }}</span>
        <span
          v-if="item.badge"
          class="absolute top-1 left-1/2 ml-2 min-w-4 h-4 px-1 rounded-full bg-error text-on-error text-label-sm flex items-center justify-center"
        >{{ item.badge }}</span>
      </RouterLink>
    </nav>
  </div>
</template>
