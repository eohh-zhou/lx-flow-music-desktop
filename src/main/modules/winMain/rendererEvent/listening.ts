import { mainHandle } from '@common/mainIpc'
import { WIN_MAIN_RENDERER_EVENT_NAME as names } from '@common/ipcNames'
import type { ListeningCheckpoint } from '@common/types/listening'

export default () => {
  mainHandle<ListeningCheckpoint>(names.listening_save, async({ params }) => global.lx.worker.dbService.listeningSave(params))
  mainHandle<ListeningCheckpoint[]>(names.listening_get, async() => global.lx.worker.dbService.listeningGet())
}
