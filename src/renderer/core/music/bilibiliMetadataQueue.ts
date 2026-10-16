import { resolveBilibiliMetadata } from './bilibili'
import { getMetadataKey } from '@renderer/utils/musicSdk/bili/metadata'

type MusicInfo = LX.Music.MusicInfoOnline
type Callback = (musicInfo: MusicInfo | null) => void
interface Job {
  key: string
  musicInfo: MusicInfo
  callbacks: Set<Callback>
  started: boolean
}

// A shared limit covers both the online playlist and saved-list views.
export const createBilibiliMetadataQueue = (resolveMetadata: (musicInfo: MusicInfo) => Promise<MusicInfo>, delay = 350) => {
  const jobs = new Map<string, Job>()
  const waiting: Job[] = []
  let active = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  const drain = () => {
    if (timer != null) clearTimeout(timer)
    timer = null
    while (active < 2 && waiting.length) {
      const job = waiting.shift()!
      if (!job.callbacks.size) continue
      job.started = true
      active++
      const notify = (result: MusicInfo | null) => {
        for (const callback of job.callbacks) {
          try { callback(result) } catch (error) { console.log(error) }
        }
      }
      void Promise.resolve().then(async() => resolveMetadata(job.musicInfo)).then(notify, () => { notify(null) }).finally(() => {
        active--
        jobs.delete(job.key)
        drain()
      })
    }
  }

  return (musicInfo: MusicInfo, callback: Callback) => {
    const key = getMetadataKey(musicInfo)
    let job = jobs.get(key)
    if (!job) {
      job = { key, musicInfo, callbacks: new Set(), started: false }
      jobs.set(key, job)
      waiting.push(job)
    }
    job.callbacks.add(callback)
    if (timer == null && waiting.length) timer = setTimeout(drain, delay)
    let cancelled = false
    return () => {
      if (cancelled) return
      cancelled = true
      job.callbacks.delete(callback)
      if (!job.callbacks.size && !job.started) {
        waiting.splice(waiting.indexOf(job), 1)
        jobs.delete(key)
      }
      if (!waiting.length && timer != null) {
        clearTimeout(timer)
        timer = null
      }
    }
  }
}

export const requestBilibiliMetadata = createBilibiliMetadataQueue(resolveBilibiliMetadata)
