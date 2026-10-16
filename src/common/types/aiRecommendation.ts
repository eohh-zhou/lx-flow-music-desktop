export interface AiRecommendConfig {
  baseUrl: string
  model: string
  hasKey: boolean
  configured: boolean
}

export interface AiRecommendConfigInput {
  baseUrl: string
  model: string
  apiKey?: string
  clearKey?: boolean
}

export interface AiRecommendSeed {
  name: string
  singer: string
  basis?: 'complete' | 'repeat' | 'time' | 'playlist'
  weight?: number
}

export interface AiRecommendContext {
  hint: string
  seeds: AiRecommendSeed[]
}

export interface AiRecommendCandidate {
  id: string
  name: string
  author: string
  trackCount: number
}

export interface AiRecommendRequest extends AiRecommendContext {
  jobId: string
  candidates?: AiRecommendCandidate[]
  kind?: 'tracks'
  source?: RecommendationSource
  variety?: RecommendationVariety
  recentSeeds?: AiRecommendSeed[]
  avoidedSeeds?: AiRecommendSeed[]
  trackCandidates?: AiRecommendTrackCandidate[]
}

export type RecommendationSource = 'tx' | 'wy' | 'bili'
export type RecommendationVariety = 'familiar' | 'balanced' | 'explore'

export interface AiRecommendTrackCandidate extends AiRecommendSeed {
  id: string
  albumName: string
  interval: string | null
  retrieval?: string[]
}

export interface AiRecommendIntent {
  keyword: string
  reason: string
  kind?: 'track' | 'artist' | 'discovery'
  target?: AiRecommendSeed
}

export interface AiRecommendRank {
  id: string
  reason: string
  exclude?: boolean
}
