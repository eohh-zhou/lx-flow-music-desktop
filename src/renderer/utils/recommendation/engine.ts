import { planAiRecommendations, rankAiRecommendations } from '@renderer/utils/aiRecommendation'
import { checkCancelled, searchTracks } from './providers'
import { applyAiRanks, filterAiTracks, fuseAiCandidates, matchesAiTarget, selectAiBatch } from './aiRanking'
import { normalize } from './ranking'
import type { AiRecommendRequest } from '@common/types/aiRecommendation'
import type { AiSelectionOptions, AiRetrieval } from './aiRanking'

interface Options {
  context: AiRecommendRequest & { source: NonNullable<AiRecommendRequest['source']> }
  signal: AbortSignal
  blocked: Set<string>
  seen: Set<string>
  owned?: Set<string>
  allowed?: AiSelectionOptions['allowed']
  onStage: (stage: string) => void
}

export const generateTracks = async({ context, signal, blocked, seen, owned, allowed, onStage }: Options) => {
  checkCancelled(signal)
  onStage('recommend__planning')
  const intents = await planAiRecommendations({ ...context, kind: 'tracks' })
  checkCancelled(signal)
  const branches: AiRetrieval[] = []
  const selection = { ...context, blocked, seen, owned, allowed }
  let failed = 0
  let completed = 0
  let rateLimit: Error | null = null
  onStage('recommend__searching')
  const planned = intents.filter((intent, index) => intents.findIndex(item => normalize(item.keyword) == normalize(intent.keyword)) == index).slice(0, 6)
  const deadline = Date.now() + 30000
  // Give every direction its first page before spending up to two recovery
  // requests. One 30-second window covers all catalogue work, with no model retry.
  const concurrency = context.source == 'bili' ? 1 : 2
  const recovery: AiRetrieval[] = []
  const retrieve = async(intent: AiRetrieval['intent'], key: string, page = 1) => {
    checkCancelled(signal)
    try {
      const rows = await searchTracks(context.source, intent.keyword, signal, page)
      checkCancelled(signal)
      completed++
      return { intent, key, rows }
    } catch (error) {
      checkCancelled(signal)
      failed++
      if (/bilibili__error_rate_limit|recommend__error_rate_limit/.test(String(error))) rateLimit = error as Error
      return null
    }
  }
  for (let offset = 0; offset < planned.length && Date.now() < deadline; offset += concurrency) {
    if (rateLimit) break
    checkCancelled(signal)
    const batch = await Promise.all(planned.slice(offset, offset + concurrency).map(async(intent, index) => retrieve(intent, `q${offset + index}`)))
    for (const branch of batch) {
      if (!branch) continue
      branches.push(branch)
      const usable = filterAiTracks(branch.rows.filter(row => matchesAiTarget(row.music, branch.intent)), selection)
      if (branch.rows.length >= 20 && usable.length < (branch.intent.kind == 'track' ? 1 : 6)) {
        recovery.push(branch)
      }
    }
  }
  const firstPages = completed
  // Avoid extra traffic when the existing pool already has enough new music.
  const extra = fuseAiCandidates(branches, selection).length < 24 ? recovery.slice(0, 2) : []
  for (let offset = 0; offset < extra.length && Date.now() < deadline; offset += concurrency) {
    if (rateLimit) break
    const batch = await Promise.all(extra.slice(offset, offset + concurrency).map(async branch => retrieve(branch.intent, branch.key, 2)))
    for (const branch of batch) if (branch) branches.push(branch)
  }
  checkCancelled(signal)
  const candidates = fuseAiCandidates(branches, selection)
  if (!candidates.length) throw rateLimit ?? new Error(!completed && failed ? 'recommend__error_search' : 'recommend__empty_filtered')
  onStage('recommend__ranking')
  let notice = failed || firstPages < planned.length ? 'recommend__partial' : ''
  let ordered = candidates
  try {
    const ranks = await rankAiRecommendations({
      ...context,
      kind: 'tracks',
      trackCandidates: candidates.map(({ music, ai }) => ({
        id: music.id,
        name: music.name,
        singer: music.singer,
        albumName: music.meta.albumName,
        interval: music.interval,
        retrieval: branches.filter(branch => ai?.directions.includes(branch.key)).map(branch => branch.intent.keyword).slice(0, 3),
      })),
    })
    checkCancelled(signal)
    ordered = applyAiRanks(candidates, ranks)
  } catch (error) {
    checkCancelled(signal)
    notice = 'recommend__rank_fallback'
  }
  return { pool: selectAiBatch(ordered, { ...selection, limit: 40 }), notice }
}
