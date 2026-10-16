<script setup lang="ts">
import { computed, ref } from 'vue';
import { formatNumber } from '../../lib/format';

export interface ChartSeries {
  key: string;
  color: string;
  label: string;
}

// Rows may carry non-numeric fields too (e.g. SimulationHourlyRow's `id`),
// so this stays loosely typed — numAt() below is the single place that
// coerces a series/x value to a number for arithmetic.
type ChartRow = Record<string, unknown>;

const props = withDefaults(
  defineProps<{
    data: ChartRow[];
    series: ChartSeries[];
    mode?: 'line' | 'area' | 'bar';
    xKey?: string;
    // Formats the x-axis tick + tooltip label from a data row. Defaults to
    // the original "{hour_index}h" behavior so existing callers (Simulation,
    // People) are unaffected.
    formatX?: (row: ChartRow) => string;
    // Y-axis floor. Defaults to 0, right for power/energy series which have
    // a meaningful zero baseline. Temperature series don't (a 19-26°C range
    // forced to start at 0 compresses the whole visible swing into a sliver
    // at the top) — pass a value near the data's realistic minimum instead.
    yMin?: number;
    ariaLabel?: string;
    // Appended to tooltip values and the screen reader table (e.g. ' kW').
    unit?: string;
    referenceLines?: { value: number; label: string; color: string }[];
    // Renders a visually hidden table of the data for screen readers.
    showTable?: boolean;
    // Whole-number axis and tooltips, for counts like people.
    integerY?: boolean;
  }>(),
  {
    mode: 'line',
    xKey: 'hour_index',
    formatX: undefined,
    yMin: 0,
    ariaLabel: 'Chart',
    unit: '',
    referenceLines: () => [],
    showTable: true,
    integerY: false,
  },
);

function numAt(row: ChartRow | null | undefined, key: string): number {
  return Number(row?.[key] ?? 0);
}

function xLabel(row: ChartRow | undefined, index: number): string {
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
  const values = props.series.flatMap((s) => props.data.map((d) => numAt(d, s.key)));
  const refValues = props.referenceLines.map((r) => r.value);
  const rawMax = Math.max(...values, ...refValues, props.yMin);
  if (props.integerY) {
    // 4 tick intervals, so a multiple of 4 keeps every tick a whole number
    const span = Math.max(4, Math.ceil((rawMax - props.yMin) / 4) * 4);
    return props.yMin + span;
  }
  return rawMax + (rawMax - props.yMin) * 0.1 || props.yMin + 1;
});

function xAt(i: number): number {
  return padL + (n.value <= 1 ? 0 : (i / (n.value - 1)) * plotW);
}
function yAt(v: number): number {
  const range = maxY.value - props.yMin || 1;
  return padT + plotH - ((v - props.yMin) / range) * plotH;
}

function fmtNum(value: number, digits = 1): string {
  return formatNumber(value, props.integerY ? 0 : digits);
}

const yTicks = computed(() => {
  const ticks = 4;
  return Array.from({ length: ticks + 1 }, (_, t) => {
    const val = props.yMin + ((maxY.value - props.yMin) * t) / ticks;
    return { y: yAt(val), label: fmtNum(val) };
  });
});

const xTicks = computed(() => {
  const step = Math.max(1, Math.ceil(n.value / 8));
  const ticks: { x: number; label: string }[] = [];
  for (let i = 0; i < n.value; i += step) {
    ticks.push({ x: xAt(i), label: xLabel(props.data[i], i) });
  }
  return ticks;
});

const barGroupW = computed(() => plotW / Math.max(n.value, 1));
const barW = computed(() => Math.max(2, (barGroupW.value * 0.7) / Math.max(props.series.length, 1)));
function barX(i: number, si: number): number {
  const groupStart = padL + i * barGroupW.value + barGroupW.value * 0.15;
  return groupStart + si * barW.value;
}

const seriesPaths = computed(() =>
  props.series.map((s) => {
    const pts = props.data.map((d, i) => `${xAt(i)},${yAt(numAt(d, s.key))}`).join(' ');
    const areaPts = `${xAt(0)},${yAt(props.yMin)} ${pts} ${xAt(n.value - 1)},${yAt(props.yMin)}`;
    return { ...s, points: pts, areaPoints: areaPts };
  }),
);

const svgEl = ref<SVGSVGElement | null>(null);
const hoverIdx = ref<number | null>(null);

function handleMove(evt: PointerEvent) {
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
function handleKey(evt: KeyboardEvent) {
  if (n.value === 0) return;
  const cur = hoverIdx.value;
  if (evt.key === 'ArrowRight') {
    hoverIdx.value = cur === null ? 0 : Math.min(n.value - 1, cur + 1);
  } else if (evt.key === 'ArrowLeft') {
    hoverIdx.value = cur === null ? n.value - 1 : Math.max(0, cur - 1);
  } else if (evt.key === 'Home') {
    hoverIdx.value = 0;
  } else if (evt.key === 'End') {
    hoverIdx.value = n.value - 1;
  } else if (evt.key === 'Escape') {
    hoverIdx.value = null;
  } else {
    return;
  }
  evt.preventDefault();
}

const hoverRow = computed(() => (hoverIdx.value !== null ? props.data[hoverIdx.value] : null));
const hoverX = computed(() => {
  if (hoverIdx.value === null) return 0;
  if (props.mode === 'bar') return padL + (hoverIdx.value + 0.5) * barGroupW.value;
  return xAt(hoverIdx.value);
});
const tooltipTopPct = computed(() => {
  if (!hoverRow.value) return 0;
  const topValue = Math.max(...props.series.map((s) => numAt(hoverRow.value, s.key)));
  return (yAt(topValue) / height) * 100;
});
</script>

<template>
  <div class="relative">
    <svg
      ref="svgEl"
      :viewBox="`0 0 ${width} ${height}`"
      width="100%"
      class="block"
      role="img"
      :aria-label="ariaLabel"
      style="touch-action: pan-y"
      tabindex="0"
      @keydown="handleKey"
      @blur="handleLeave"
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
          stroke="#dde3ec"
          stroke-width="1"
        />
        <text
          :x="padL - 8"
          :y="tick.y + 4"
          font-size="12"
          fill="#42474e"
          text-anchor="end"
        >{{ tick.label }}</text>
      </template>
      <text
        v-for="tick in xTicks"
        :key="`x-${tick.x}`"
        :x="tick.x"
        :y="height - padB + 16"
        font-size="12"
        fill="#42474e"
        text-anchor="middle"
      >{{ tick.label }}</text>

      <g
        v-for="rl in referenceLines"
        :key="rl.label"
      >
        <line
          :x1="padL"
          :y1="yAt(rl.value)"
          :x2="width - padR"
          :y2="yAt(rl.value)"
          :stroke="rl.color"
          stroke-width="1.5"
          stroke-dasharray="5 4"
        />
        <text
          :x="width - padR - 4"
          :y="yAt(rl.value) - 4"
          font-size="12"
          text-anchor="end"
          :fill="rl.color"
        >{{ rl.label }}</text>
      </g>

      <template v-if="mode === 'bar'">
        <template
          v-for="(s, si) in series"
          :key="s.key"
        >
          <rect
            v-for="(d, i) in data"
            :key="i"
            :x="barX(i, si)"
            :y="Math.min(yAt(numAt(d, s.key)), yAt(yMin))"
            :width="barW"
            :height="Math.abs(yAt(yMin) - yAt(numAt(d, s.key)))"
            :fill="s.color"
            rx="1"
          />
        </template>
      </template>
      <template v-else>
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
        @pointermove="handleMove"
        @pointerdown="handleMove"
        @pointerleave="handleLeave"
      />
    </svg>

    <div
      v-if="hoverRow"
      class="absolute bg-surface-container-lowest border border-slate-200 rounded shadow-sm px-2 py-1 text-label-sm pointer-events-none -translate-x-1/2 -translate-y-full"
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
        {{ s.label }}: {{ fmtNum(numAt(hoverRow, s.key), 2) }}{{ unit }}
      </div>
    </div>

    <div
      v-if="showTable"
      class="sr-only"
    >
      <table>
        <caption>{{ ariaLabel }}</caption>
        <thead>
          <tr>
            <th scope="col">
            &nbsp;
            </th>
            <th
              v-for="s in series"
              :key="s.key"
              scope="col"
            >
              {{ s.label }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(d, i) in data"
            :key="i"
          >
            <th scope="row">
              {{ xLabel(d, i) }}
            </th>
            <td
              v-for="s in series"
              :key="s.key"
            >
              {{ fmtNum(numAt(d, s.key), 2) }}{{ unit }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-label-sm text-on-surface-variant">
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
