import { planAiRecommendations, rankAiRecommendations } from '@renderer/utils/aiRecommendation'
import { checkCancelled, searchTracks } from './providers'
import { applyAiRanks, fuseAiCandidates, selectAiBatch } from './aiRanking'
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
  const planned = intents.slice(0, 6)
  const deadline = Date.now() + 30000
  // QQ/NetEase use two searches at a time; Bilibili stays sequential so a rate
  // limit immediately stops that source. No pagination or automatic model retry.
  const concurrency = context.source == 'bili' ? 1 : 2
  for (let offset = 0; offset < planned.length && !rateLimit && Date.now() < deadline; offset += concurrency) {
    checkCancelled(signal)
    const batch = await Promise.all(planned.slice(offset, offset + concurrency).map(async(intent, index) => {
      checkCancelled(signal)
      try {
        const rows = await searchTracks(context.source, intent.keyword, signal)
        checkCancelled(signal)
        completed++
        return { intent, key: `q${offset + index}`, rows }
      } catch (error) {
        checkCancelled(signal)
        failed++
        if (String(error).includes('bilibili__error_rate_limit')) rateLimit = new Error('bilibili__error_rate_limit')
        return null
      }
    }))
    for (const branch of batch) if (branch) branches.push(branch)
  }
  checkCancelled(signal)
  const candidates = fuseAiCandidates(branches, selection)
  if (!candidates.length) throw rateLimit ?? new Error(!completed && failed ? 'recommend__error_search' : 'recommend__empty_filtered')
  onStage('recommend__ranking')
  let notice = failed || completed < planned.length ? 'recommend__partial' : ''
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
