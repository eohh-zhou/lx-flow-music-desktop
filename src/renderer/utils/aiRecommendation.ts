import { rendererInvoke } from '@common/rendererIpc'
import { WIN_MAIN_RENDERER_EVENT_NAME as names } from '@common/ipcNames'
import type { AiRecommendConfig, AiRecommendConfigInput, AiRecommendIntent, AiRecommendRank, AiRecommendRequest } from '@common/types/aiRecommendation'

export const getAiRecommendConfig = async() => rendererInvoke<AiRecommendConfig>(names.ai_recommend_config_get)
export const setAiRecommendConfig = async(config: AiRecommendConfigInput) => rendererInvoke<AiRecommendConfigInput, AiRecommendConfig>(names.ai_recommend_config_set, config)
export const testAiRecommendConnection = async(jobId: string) => rendererInvoke<{ jobId: string }>(names.ai_recommend_test, { jobId })
export const planAiRecommendations = async(input: AiRecommendRequest) => rendererInvoke<AiRecommendRequest, AiRecommendIntent[]>(names.ai_recommend_plan, input)
export const rankAiRecommendations = async(input: AiRecommendRequest) => rendererInvoke<AiRecommendRequest, AiRecommendRank[]>(names.ai_recommend_rank, input)
export const cancelAiRecommendation = async(jobId: string) => rendererInvoke<{ jobId: string }>(names.ai_recommend_cancel, { jobId })

export const createAiJobId = () => `music-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
const errorKeys = [
  'bilibili__error_input', 'bilibili__error_private', 'bilibili__error_missing', 'bilibili__error_rate_limit', 'bilibili__error_request', 'bilibili__error_audio',
  'ai_recommend__error_config', 'ai_recommend__error_storage', 'ai_recommend__error_request', 'ai_recommend__error_auth',
  'ai_recommend__error_rate_limit', 'ai_recommend__error_timeout', 'ai_recommend__error_cancelled', 'ai_recommend__error_response',
  'ai_recommend__error_busy', 'ai_recommend__error_preference', 'ai_recommend__error_no_results',
] as const
export const getRecommendationError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  return errorKeys.find(key => message.includes(key)) ?? 'bilibili__error_request'
}
