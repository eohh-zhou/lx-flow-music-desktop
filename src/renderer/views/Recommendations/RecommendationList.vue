<template>
  <div :class="$style.list">
    <div :class="[$style.columns, $style.heading]" aria-hidden="true">
      <span>#</span><span>{{ $t('music_name') }}</span><span>{{ $t('music_singer') }}</span><span>{{ $t('music_time') }}</span><span />
    </div>
    <ol :class="$style.rows">
      <li v-for="(row, index) in rows" :key="row.music.id" :class="[$style.columns, $style.row]" :data-recommendation-id="row.music.id">
        <span :class="$style.order">{{ String(Number(index) + 1).padStart(2, '0') }}</span>
        <div :class="$style.song">
          <button type="button" :class="$style.cover" :aria-label="$t('recommend__play_song', { name: row.music.name })" @click="emit('play', index)">
            <svg-icon name="music" />
            <img v-if="row.music.meta.picUrl" :src="row.music.meta.picUrl" loading="lazy" decoding="async" alt="" @error="hideBrokenImage">
            <span :class="$style.playOverlay"><svg-icon name="play-outline" /></span>
          </button>
          <div :class="$style.info">
            <div :class="$style.title">
              <button type="button" :class="$style.name" :title="row.music.name" @click="emit('play', index)">{{ row.music.name }}</button>
              <small v-if="showSource" :class="$style.source">{{ row.music.source == 'bili' ? 'bilibili' : $t(row.music.source == 'tx' ? 'source_tx' : 'source_wy') }}</small>
            </div>
            <p v-if="row.reason" :class="$style.reason" :title="row.reason">{{ row.reason }}</p>
          </div>
        </div>
        <span :class="$style.artist" :title="row.music.singer">{{ row.music.singer || $t('unknown_singer') }}</span>
        <span :class="$style.duration">{{ row.music.interval || '—' }}</span>
        <div :class="$style.actions">
          <button type="button" :aria-label="$t('recommend__collect_song', { name: row.music.name })" :title="$t('software__add_to_list')" @click="emit('collect', row)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h13M4 10h13M4 15h7m6-1v7m-3-3.5h6" /></svg></button>
          <button type="button" :aria-label="$t('recommend__dismiss_song', { name: row.music.name })" :title="$t('recommend__not_interested')" @click="emit('dismiss', row)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg></button>
        </div>
      </li>
    </ol>
  </div>
</template>

<script setup lang="ts">
import type { TrackRecommendation } from '@renderer/utils/recommendation/ranking'

defineProps<{ rows: TrackRecommendation[], showSource?: boolean }>()
const emit = defineEmits<{
  play: [index: number]
  collect: [row: TrackRecommendation]
  dismiss: [row: TrackRecommendation]
}>()
const hideBrokenImage = (event: Event) => { (event.target as HTMLImageElement).style.display = 'none' }
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';
.list { width: 100%; min-width: 0; }
.columns { display: grid; grid-template-columns: 26px minmax(0, 1fr) minmax(90px, 22%) 44px 66px; align-items: center; gap: 14px; padding: 0 10px; }
.heading { height: 30px; color: var(--color-font-label); font-size: 10px; > :first-child { text-align: center; } }
.rows { list-style: none; margin: 0; padding: 0; }
.row { min-height: 66px; border-radius: 6px; position: relative; transition: background-color @transition-fast; &::after { content: ''; position: absolute; left: 50px; right: 10px; bottom: 0; height: 1px; background: var(--color-font); opacity: .06; pointer-events: none; } &:hover, &:focus-within { background: var(--color-primary-alpha-900); .actions { color: var(--color-font); } } button:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; } }
.order { text-align: center; font-size: 10px; color: var(--color-font-label); font-variant-numeric: tabular-nums; opacity: .7; }
.song { display: flex; align-items: center; gap: 12px; min-width: 0; padding: 10px 0; }
.cover { position: relative; flex: none; display: flex; align-items: center; justify-content: center; width: 42px; height: 42px; border: none; border-radius: 6px; overflow: hidden; padding: 0; background: var(--color-150); color: var(--color-font-label); cursor: pointer; img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; } > svg { width: 20px; height: 20px; fill: currentColor; } &:hover .playOverlay, &:focus-visible .playOverlay { opacity: 1; } }
.playOverlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; opacity: 0; background: rgba(0, 0, 0, .35); color: white; transition: opacity @transition-fast; svg { width: 22px; height: 22px; fill: currentColor; } }
.info { flex: 1; min-width: 0; }
.title { display: flex; align-items: center; gap: 8px; min-width: 0; }
.name { min-width: 0; border: none; padding: 0; background: none; color: var(--color-font); cursor: pointer; text-align: left; font-size: 13px; font-weight: 500; line-height: 1.5; .mixin-ellipsis-1(); &:hover { color: var(--color-primary); } }
.source { flex: none; font-size: 9px; font-weight: normal; color: var(--color-font-label); }
.reason { margin: 4px 0 0; color: var(--color-font-label); font-size: 10px; line-height: 1.4; .mixin-ellipsis-1(); }
.artist { min-width: 0; color: var(--color-750); font-size: 12px; .mixin-ellipsis-1(); }
.duration { color: var(--color-font-label); font-size: 11px; font-variant-numeric: tabular-nums; }
.actions { display: flex; align-items: center; gap: 6px; color: var(--color-font-label); button { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border: none; border-radius: 5px; padding: 5px; color: inherit; background: none; cursor: pointer; svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; } &:hover { color: var(--color-primary); background: var(--color-primary-alpha-900); } } }
@media (max-width: 1000px) { .columns { grid-template-columns: 20px minmax(0, 1fr) minmax(72px, 18%) 40px 60px; gap: 9px; padding: 0 4px; } .song { gap: 9px; } .source { display: none; } .actions { gap: 2px; } }
@media (prefers-reduced-motion: reduce) { .row, .playOverlay { transition: none; } }
</style>
