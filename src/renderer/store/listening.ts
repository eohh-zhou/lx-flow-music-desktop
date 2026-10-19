import { reactive, ref } from '@common/utils/vueTools'
import { getListeningOverview, manageListening } from '@renderer/utils/recommendation/listeningIpc'
import type { ListeningCommand, ListeningOverview, ListeningPreferences } from '@common/types/listening'

export const listeningReady = ref(false)
export const listeningPreferences = reactive<ListeningPreferences>({ recording: true, personalize: true, recordingSince: 0, preferenceSince: 0, startedAt: 0, ignored: [] })
const applyOverview = (overview: ListeningOverview) => {
  Object.assign(listeningPreferences, overview.preferences)
  listeningReady.value = true
  return overview
}
export const refreshListening = async() => applyOverview(await getListeningOverview())
export const changeListening = async(command: ListeningCommand) => applyOverview(await manageListening(command))
