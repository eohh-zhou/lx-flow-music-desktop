import { rendererInvoke } from '@common/rendererIpc'
import { WIN_MAIN_RENDERER_EVENT_NAME as names } from '@common/ipcNames'
import type { ListeningCheckpoint } from '@common/types/listening'

export const saveListening = async(value: ListeningCheckpoint) => rendererInvoke<ListeningCheckpoint>(names.listening_save, value)
export const getListening = async() => rendererInvoke<ListeningCheckpoint[]>(names.listening_get)
