<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import SideNav, { type NavItem } from './SideNav.vue';
import { t } from '../../lib/i18n';

const props = defineProps<{
  open: boolean;
  items: NavItem[];
}>();

const emit = defineEmits<{ close: [] }>();

const panel = ref<HTMLElement | null>(null);

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault();
    emit('close');
    return;
  }
  if (e.key !== 'Tab' || !panel.value) return;
  const nodes = Array.from(panel.value.querySelectorAll<HTMLElement>(FOCUSABLE));
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && (active === first || !panel.value.contains(active))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (active === last || !panel.value.contains(active))) {
    e.preventDefault();
    first.focus();
  }
}

// Stop the page behind the drawer from scrolling while it is open.
let prevOverflow = '';
function lock() {
  prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', onKey);
}
function unlock() {
  document.body.style.overflow = prevOverflow;
  document.removeEventListener('keydown', onKey);
}

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      lock();
      await nextTick();
      panel.value?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    } else {
      unlock();
    }
  },
);

onBeforeUnmount(() => {
  if (props.open) unlock();
});
</script>

<template>
  <Transition
    enter-active-class="transition-opacity duration-200 motion-reduce:transition-none"
    leave-active-class="transition-opacity duration-200 motion-reduce:transition-none"
    enter-from-class="opacity-0"
    leave-to-class="opacity-0"
  >
    <div
      v-if="open"
      class="md:hidden fixed inset-0 z-50 bg-on-surface/40"
      aria-hidden="true"
      @click="emit('close')"
    />
  </Transition>
  <Transition
    enter-active-class="transition-transform duration-200 ease-out motion-reduce:transition-none"
    leave-active-class="transition-transform duration-200 ease-in motion-reduce:transition-none"
    enter-from-class="-translate-x-full"
    leave-to-class="-translate-x-full"
  >
    <div
      v-if="open"
      id="mobile-drawer"
      ref="panel"
      role="dialog"
      aria-modal="true"
      :aria-label="t('nav.menu')"
      class="md:hidden fixed left-0 top-0 bottom-0 z-50 w-72 max-w-[85vw] bg-surface-container-low shadow-card overflow-y-auto pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
    >
      <SideNav
        :items="items"
        closable
        class="!w-full"
        @close="emit('close')"
      >
        <slot />
      </SideNav>
    </div>
  </Transition>
</template>
