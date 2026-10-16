import type { ListeningCheckpoint, ListeningTrack } from '@common/types/listening'

export class ListeningSession {
  private anchor: { position: number, clock: number, rate: number } | null = null
  private ranges: Array<[number, number]> = []
  private playing = false
  private listened = 0
  private duration = 0
  private skipped = false
  private revision = 0
  readonly sessionId: string

  constructor(readonly track: ListeningTrack, readonly startedAt = Date.now(), id?: string) {
    this.sessionId = id ?? `listen-${startedAt}-${Math.random().toString(36).slice(2, 14)}`
  }

  resume() { this.playing = true; this.anchor = null }
  pause() { this.playing = false; this.anchor = null }
  seek() { this.anchor = null }

  update(position: number, duration: number, clock: number, rate = 1) {
    if (Number.isFinite(duration) && duration > 0) this.duration = Math.min(duration, 86400)
    if (!Number.isFinite(position) || position < 0 || !Number.isFinite(clock) || !Number.isFinite(rate) || rate <= 0) { this.anchor = null; return }
    const previous = this.anchor
    this.anchor = { position, clock, rate }
    if (!this.playing || !previous) return
    const elapsed = (clock - previous.clock) / 1000
    const advance = position - previous.position
    // A discontinuity, sleep or seek must not create listening time or completion.
    if (elapsed <= 0 || elapsed > 10 || advance <= 0 || Math.abs(advance - elapsed * previous.rate) > Math.max(0.6, elapsed * previous.rate * 0.3)) return
    this.listened += Math.min(elapsed, advance / previous.rate)
    const end = this.duration ? Math.min(position, this.duration) : position
    if (end <= previous.position) return
    this.ranges.push([previous.position, end])
    this.ranges.sort((a, b) => a[0] - b[0])
    const merged: Array<[number, number]> = []
    for (const range of this.ranges) {
      const last = merged[merged.length - 1]
      if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1])
      else merged.push([...range])
    }
    // Bound memory even when a user repeatedly scrubs to many separate sections.
    this.ranges = merged.length > 256 ? merged.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0])).slice(0, 256) : merged
  }

  finish(manualSkip = false) {
    const coverage = this.coverage()
    this.skipped = manualSkip && this.listened >= 2 && this.listened < 30 && (!this.duration || coverage / this.duration < 0.2)
    this.pause()
  }

  private coverage() {
    const total = this.ranges.reduce((sum, [start, end]) => sum + Math.max(0, (this.duration ? Math.min(end, this.duration) : end) - start), 0)
    return this.duration ? Math.min(total, this.duration) : total
  }

  snapshot(now = Date.now()): ListeningCheckpoint {
    const coverage = this.coverage()
    return {
      sessionId: this.sessionId,
      revision: ++this.revision,
      track: { ...this.track },
      startedAt: this.startedAt,
      updatedAt: now,
      duration: this.duration,
      listened: Math.min(this.listened, 86400),
      coverage,
      completed: this.duration > 0 && coverage / this.duration >= 0.9,
      skipped: this.skipped,
    }
  }
}
