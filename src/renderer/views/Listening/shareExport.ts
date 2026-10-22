import { promises as fs } from 'node:fs'
import { clipboard, nativeImage } from 'electron'
import { openSaveDir } from '@renderer/utils/ipc'

export const saveListeningShareImage = async(dataUrl: string, period: string, title: string): Promise<boolean> => {
  if (!dataUrl.startsWith('data:image/png;base64,')) throw new Error('Invalid share image')
  const result = await openSaveDir({
    title,
    defaultPath: `LX-Flow-${period.replace(/[^\d-]/g, '')}.png`,
    filters: [{ name: 'PNG', extensions: ['png'] }],
  })
  if (result.canceled || !result.filePath) return false
  await fs.writeFile(result.filePath, Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64'))
  return true
}

export const copyListeningShareImage = (dataUrl: string) => {
  const image = nativeImage.createFromDataURL(dataUrl)
  if (image.isEmpty()) throw new Error('Invalid share image')
  clipboard.writeImage(image)
}
