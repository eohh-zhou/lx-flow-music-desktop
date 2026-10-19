import { rendererInvoke } from '@common/rendererIpc'
import { WIN_MAIN_RENDERER_EVENT_NAME as names } from '@common/ipcNames'
import type { ListeningCheckpoint, ListeningCommand, ListeningOverview, ListeningReport } from '@common/types/listening'

export const saveListening = async(value: ListeningCheckpoint) => rendererInvoke<ListeningCheckpoint>(names.listening_save, value)
export const getListening = async() => rendererInvoke<ListeningCheckpoint[]>(names.listening_get)
export const getListeningOverview = async() => rendererInvoke<ListeningOverview>(names.listening_overview)
export const getListeningReport = async(period: string) => rendererInvoke<string, ListeningReport>(names.listening_report, period)
export const manageListening = async(command: ListeningCommand) => rendererInvoke<ListeningCommand, ListeningOverview>(names.listening_manage, command)
