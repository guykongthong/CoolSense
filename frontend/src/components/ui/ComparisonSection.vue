<script setup lang="ts">
import { computed } from 'vue';
import Card from './Card.vue';
import { t } from '../../lib/i18n';
import type { SimulationSummary } from '../../lib/api';

const props = defineProps<{ summary: SimulationSummary }>();

const v3EnergySaved = computed(() => props.summary.static_v3_energy_kwh - props.summary.coolsense_v3_energy_kwh);

const appOverheadPct = computed(() =>
  v3EnergySaved.value > 0 ? (props.summary.app_energy_kwh / v3EnergySaved.value) * 100 : 0,
);
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Card :title="t('simulation.staticBaseline')">
        <p class="text-label-sm text-on-surface-variant -mt-2 mb-4">
          {{ t('simulation.staticBaselineSubtitle') }}
        </p>
        <dl class="flex flex-col gap-3">
          <div class="flex justify-between items-baseline">
            <dt class="text-label-md text-on-surface-variant">
              {{ t('simulation.energyLabel') }}
            </dt>
            <dd class="text-headline-lg text-on-surface-variant">
              {{ summary.static_v3_energy_kwh.toFixed(1) }} kWh
            </dd>
          </div>
          <div class="flex justify-between items-baseline">
            <dt class="text-label-md text-on-surface-variant">
              {{ t('simulation.co2Label') }}
            </dt>
            <dd class="text-headline-lg text-on-surface-variant">
              {{ summary.static_v3_co2_kg.toFixed(1) }} kg
            </dd>
          </div>
          <div class="flex justify-between items-baseline">
            <dt class="text-label-md text-on-surface-variant">
              {{ t('simulation.costLabel') }}
            </dt>
            <dd class="text-headline-lg text-on-surface-variant">
              {{ summary.static_v3_cost_baht.toFixed(0) }} baht
            </dd>
          </div>
        </dl>
      </Card>

      <Card :title="t('simulation.smartSystem')">
        <p class="text-label-sm text-on-surface-variant -mt-2 mb-4">
          {{ t('simulation.smartSystemSubtitle') }}
        </p>
        <dl class="flex flex-col gap-3">
          <div class="flex justify-between items-baseline">
            <dt class="text-label-md text-on-surface-variant">
              {{ t('simulation.energyLabel') }}
            </dt>
            <dd class="text-headline-lg text-primary">
              {{ summary.coolsense_v3_energy_kwh.toFixed(1) }} kWh
            </dd>
          </div>
          <div class="flex justify-between items-baseline">
            <dt class="text-label-md text-on-surface-variant">
              {{ t('simulation.co2Label') }}
            </dt>
            <dd class="text-headline-lg text-primary">
              {{ summary.coolsense_v3_co2_kg.toFixed(1) }} kg
            </dd>
          </div>
          <div class="flex justify-between items-baseline">
            <dt class="text-label-md text-on-surface-variant">
              {{ t('simulation.costLabel') }}
            </dt>
            <dd class="text-headline-lg text-primary">
              {{ summary.coolsense_v3_cost_baht.toFixed(0) }} baht
            </dd>
          </div>
        </dl>
      </Card>
    </div>

    <Card :title="t('simulation.netSavingsTitle')">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
        <div>
          <div class="text-display-lg text-primary">
            {{ summary.net_energy_saved_kwh.toFixed(1) }} kWh
          </div>
          <div class="text-label-md text-on-surface-variant">
            {{ t('simulation.netEnergySaved') }}
          </div>
        </div>
        <div>
          <div class="text-display-lg text-primary">
            {{ summary.net_co2_saved_kg.toFixed(1) }} kg
          </div>
          <div class="text-label-md text-on-surface-variant">
            {{ t('simulation.netCo2Saved') }}
          </div>
        </div>
        <div>
          <div class="text-display-lg text-primary">
            {{ summary.net_cost_saved_baht.toFixed(0) }} baht
          </div>
          <div class="text-label-md text-on-surface-variant">
            {{ t('simulation.netCostSaved') }}
          </div>
        </div>
      </div>
      <p class="text-label-sm text-on-surface-variant mt-4 pt-4 border-t border-dashed border-slate-200">
        {{
          t('simulation.appEnergyFootnote', {
            kwh: summary.app_energy_kwh.toFixed(3),
            pct: appOverheadPct.toFixed(2),
          })
        }}
      </p>
    </Card>
  </div>
</template>
