<script setup lang="ts">
import { computed, ref } from 'vue';

export interface ChartSeries {
  key: string;
  color: string;
  label: string;
}

const props = withDefaults(
  defineProps<{
    data: Record<string, number>[];
    series: ChartSeries[];
    mode?: 'line' | 'area';
    xKey?: string;
    // Formats the x-axis tick + tooltip label from a data row. Defaults to
    // the original "{hour_index}h" behavior so existing callers (Simulation,
    // People) are unaffected.
    formatX?: (row: Record<string, number>) => string;
  }>(),
  { mode: 'line', xKey: 'hour_index', formatX: undefined },
);

function xLabel(row: Record<string, number> | undefined, index: number): string {
  if (!row) return `${index}h`;
  return props.formatX ? props.formatX(row) : `${row[props.xKey] ?? index}h`;
}

const width = 680;
const height = 240;
const padL = 52;
const padR = 12;
const padT = 12;
const padB = 28;
const plotW = width - padL - padR;
const plotH = height - padT - padB;

const n = computed(() => props.data.length);

const maxY = computed(() => {
  const values = props.series.flatMap((s) => props.data.map((d) => d[s.key] ?? 0));
  return Math.max(...values, 0) * 1.1 || 1;
});

function xAt(i: number): number {
  return padL + (n.value <= 1 ? 0 : (i / (n.value - 1)) * plotW);
}
function yAt(v: number): number {
  return padT + plotH - (v / maxY.value) * plotH;
}

function fmtNum(value: number, digits = 1): string {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

const yTicks = computed(() => {
  const ticks = 4;
  return Array.from({ length: ticks + 1 }, (_, t) => {
    const val = (maxY.value * t) / ticks;
    return { y: yAt(val), label: fmtNum(val) };
  });
});

const xTicks = computed(() => {
  const step = Math.max(24, Math.ceil(n.value / 8 / 24) * 24);
  const ticks: { x: number; label: string }[] = [];
  for (let i = 0; i < n.value; i += step) {
    ticks.push({ x: xAt(i), label: xLabel(props.data[i], i) });
  }
  return ticks;
});

const seriesPaths = computed(() =>
  props.series.map((s) => {
    const pts = props.data.map((d, i) => `${xAt(i)},${yAt(d[s.key] ?? 0)}`).join(' ');
    const areaPts = `${xAt(0)},${yAt(0)} ${pts} ${xAt(n.value - 1)},${yAt(0)}`;
    return { ...s, points: pts, areaPoints: areaPts };
  }),
);

const svgEl = ref<SVGSVGElement | null>(null);
const hoverIdx = ref<number | null>(null);

function handleMove(evt: MouseEvent) {
  if (!svgEl.value || n.value === 0) return;
  const rect = svgEl.value.getBoundingClientRect();
  const scale = width / rect.width;
  const localX = (evt.clientX - rect.left) * scale;
  const frac = Math.min(1, Math.max(0, (localX - padL) / plotW));
  hoverIdx.value = Math.round(frac * (n.value - 1));
}
function handleLeave() {
  hoverIdx.value = null;
}

const hoverRow = computed(() => (hoverIdx.value !== null ? props.data[hoverIdx.value] : null));
const hoverX = computed(() => (hoverIdx.value !== null ? xAt(hoverIdx.value) : 0));
const tooltipTopPct = computed(() => {
  if (!hoverRow.value) return 0;
  const topValue = Math.max(...props.series.map((s) => hoverRow.value![s.key] ?? 0));
  return (yAt(topValue) / height) * 100;
});
</script>

<template>
  <div class="relative">
    <svg
      ref="svgEl"
      :viewBox="`0 0 ${width} ${height}`"
      width="100%"
      style="display: block"
      role="img"
      aria-label="chart"
    >
      <template
        v-for="tick in yTicks"
        :key="`y-${tick.y}`"
      >
        <line
          :x1="padL"
          :y1="tick.y"
          :x2="width - padR"
          :y2="tick.y"
          stroke="#e6e6e6"
          stroke-width="1"
        />
        <text
          :x="padL - 8"
          :y="tick.y + 4"
          font-size="10"
          fill="#666"
          text-anchor="end"
        >{{ tick.label }}</text>
      </template>
      <text
        v-for="tick in xTicks"
        :key="`x-${tick.x}`"
        :x="tick.x"
        :y="height - padB + 16"
        font-size="10"
        fill="#666"
        text-anchor="middle"
      >{{ tick.label }}</text>

      <template
        v-for="s in seriesPaths"
        :key="s.key"
      >
        <polygon
          v-if="mode === 'area'"
          :points="s.areaPoints"
          :fill="s.color"
          fill-opacity="0.1"
          stroke="none"
        />
        <polyline
          :points="s.points"
          fill="none"
          :stroke="s.color"
          stroke-width="2"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
      </template>

      <line
        v-if="hoverIdx !== null"
        :x1="hoverX"
        :y1="padT"
        :x2="hoverX"
        :y2="height - padB"
        stroke="#999"
        stroke-width="1"
      />
      <rect
        :x="padL"
        :y="padT"
        :width="plotW"
        :height="plotH"
        fill="transparent"
        @mousemove="handleMove"
        @mouseleave="handleLeave"
      />
    </svg>

    <div
      v-if="hoverRow"
      class="absolute bg-white border border-slate-200 rounded shadow-sm px-2 py-1 text-label-sm pointer-events-none -translate-x-1/2 -translate-y-full"
      :style="{ left: `${(hoverX / width) * 100}%`, top: `${tooltipTopPct}%` }"
    >
      <div class="text-on-surface-variant">
        {{ formatX ? formatX(hoverRow) : `Hour ${hoverRow[xKey]}` }}
      </div>
      <div
        v-for="s in series"
        :key="s.key"
        :style="{ color: s.color }"
      >
        {{ s.label }}: {{ fmtNum(hoverRow[s.key] ?? 0, 2) }}
      </div>
    </div>

    <div class="flex gap-4 mt-3 text-label-sm text-on-surface-variant">
      <span
        v-for="s in series"
        :key="s.key"
        class="flex items-center gap-1.5"
      >
        <span
          class="inline-block w-2.5 h-2.5 rounded-sm"
          :style="{ backgroundColor: s.color }"
        />
        {{ s.label }}
      </span>
    </div>
  </div>
</template>
