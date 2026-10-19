import { onBeforeUnmount, watch } from '@common/utils/vueTools'
import { getCurrentTime, getDuration, getPlaybackRate, onTimeupdate } from '@renderer/plugins/player'
import { isPlay, playMusicInfo } from '@renderer/store/player/state'
import { listeningPreferences, listeningReady, refreshListening } from '@renderer/store/listening'
import { ListeningSession } from '@renderer/utils/recommendation/listening'
import { saveListening } from '@renderer/utils/recommendation/listeningIpc'
import type { ListeningCheckpoint } from '@common/types/listening'

export default () => {
  let session: ListeningSession | null = null
  let manualSkipAt = -Infinity
  let lastCheckpoint = 0
  let saving = false
  let disposed = false
  let monthTimer: ReturnType<typeof setTimeout> | undefined
  const pending = new Map<string, ListeningCheckpoint>()
  const currentTrack = () => {
    const current = playMusicInfo.musicInfo
    return current && ('progress' in current ? current.metadata.musicInfo : current)
  }
  const drain = async() => {
    if (saving) return
    saving = true
    try {
      while (pending.size) {
        const [id, value] = pending.entries().next().value!
        await saveListening(value)
        if (pending.get(id) === value) pending.delete(id)
      }
    } catch { /* Retry the pending checkpoint on the next player event. */ } finally { saving = false }
  }
  const flush = () => {
    if (session) {
      const value = session.snapshot()
      if (value.listened >= 0.5 || value.skipped) pending.set(value.sessionId, value)
      if (pending.size > 30) pending.delete(pending.keys().next().value!)
    }
    lastCheckpoint = performance.now()
    void drain()
  }
  const tick = () => session?.update(getCurrentTime(), getDuration(), performance.now(), getPlaybackRate())
  const playing = () => {
    if (!listeningReady.value || !listeningPreferences.recording) return
    const track = currentTrack()
    if (!track) return
    session ??= new ListeningSession({ id: track.id, source: track.source, name: track.name, singer: track.singer }, Math.max(Date.now(), listeningPreferences.recordingSince + 1))
    session.resume()
    tick()
  }
  const pause = () => { tick(); session?.pause(); flush() }
  const seek = () => { session?.seek() }
  const skip = () => { tick(); manualSkipAt = performance.now() }
  const toggled = () => {
    session?.finish(performance.now() - manualSkipAt < 10000 && currentTrack()?.id != session.track.id)
    flush()
    session = null
    manualSkipAt = -Infinity
  }
  const ended = () => { tick(); session?.finish(); flush(); session = null; manualSkipAt = -Infinity }
  const stopped = () => { pause(); session = null; manualSkipAt = -Infinity }
  const metadata = () => {
    const track = currentTrack()
    if (session && track?.id == session.track.id) {
      session.track.name = track.name
      session.track.singer = track.singer
    }
  }

  // One calendar wake-up (at most two per month), rather than a polling loop.
  // Opening the app also catches up on reports missed while it was closed.
  const scheduleReports = () => {
    if (disposed) return
    const now = new Date()
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime()
    monthTimer = setTimeout(() => {
      void refreshListening().catch(() => {}).finally(scheduleReports)
    }, Math.min(next - now.getTime() + 1000, 2147483647))
  }
  void refreshListening().catch(() => {}).finally(scheduleReports)
  const stopPreferences = watch(() => [listeningReady.value, listeningPreferences.recording, listeningPreferences.recordingSince], () => {
    // Discard old queued checkpoints on pause/clear; the worker enforces the same cutoff.
    pending.clear()
    session = null
    manualSkipAt = -Infinity
    if (isPlay.value) playing()
  })

  window.app_event.on('playerPlaying', playing)
  window.app_event.on('playerPause', pause)
  window.app_event.on('playerWaiting', pause)
  window.app_event.on('playerLoadstart', pause)
  window.app_event.on('playerError', pause)
  window.app_event.on('playerEmptied', pause)
  window.app_event.on('playerEnded', ended)
  window.app_event.on('stop', stopped)
  window.app_event.on('setProgress', seek)
  window.app_event.on('setPlaybackRate', seek)
  window.app_event.on('playerUserSkip', skip)
  window.app_event.on('musicToggled', toggled)
  window.app_event.on('musicInfoUpdated', metadata)
  window.addEventListener('beforeunload', flush)
  const removeTime = onTimeupdate(() => {
    tick()
    if (performance.now() - lastCheckpoint >= 30000) flush()
  })
  onBeforeUnmount(() => {
    disposed = true
    if (monthTimer) clearTimeout(monthTimer)
    stopPreferences()
    flush()
    removeTime()
    window.removeEventListener('beforeunload', flush)
    window.app_event.off('playerPlaying', playing)
    window.app_event.off('playerPause', pause)
    window.app_event.off('playerWaiting', pause)
    window.app_event.off('playerLoadstart', pause)
    window.app_event.off('playerError', pause)
    window.app_event.off('playerEmptied', pause)
    window.app_event.off('playerEnded', ended)
    window.app_event.off('stop', stopped)
    window.app_event.off('setProgress', seek)
    window.app_event.off('setPlaybackRate', seek)
    window.app_event.off('playerUserSkip', skip)
    window.app_event.off('musicToggled', toggled)
    window.app_event.off('musicInfoUpdated', metadata)
  })
}
