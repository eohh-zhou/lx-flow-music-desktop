import { mainHandle } from '@common/mainIpc'
import { WIN_MAIN_RENDERER_EVENT_NAME as names } from '@common/ipcNames'
import type { ListeningCheckpoint, ListeningCommand, ListeningOverview, ListeningReport } from '@common/types/listening'

export default () => {
  mainHandle<ListeningCheckpoint>(names.listening_save, async({ params }) => global.lx.worker.dbService.listeningSave(params))
  mainHandle<ListeningCheckpoint[]>(names.listening_get, async() => global.lx.worker.dbService.listeningGet())
  mainHandle<ListeningOverview>(names.listening_overview, async() => global.lx.worker.dbService.listeningOverview())
  mainHandle<string, ListeningReport>(names.listening_report, async({ params }) => global.lx.worker.dbService.listeningReport(params))
  mainHandle<ListeningCommand, ListeningOverview>(names.listening_manage, async({ params }) => global.lx.worker.dbService.listeningManage(params))
}
