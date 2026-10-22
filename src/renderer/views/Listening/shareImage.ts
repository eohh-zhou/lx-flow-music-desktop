import type { ListeningShareModel } from './report'

// Draw from a snapshot of the report: no remote covers, DOM screenshots or network requests.
export const renderListeningShareImage = (model: ListeningShareModel): string => {
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1440
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is unavailable')
  const ink = '#29272c'
  const muted = '#777079'
  const accent = '#bd3a58'
  const font = '"Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif'
  ctx.textBaseline = 'top'
  ctx.fillStyle = '#faf7f3'
  ctx.fillRect(0, 0, 1080, 1440)
  const glow = ctx.createRadialGradient(1010, 80, 30, 1010, 80, 780)
  glow.addColorStop(0, '#efd0ce')
  glow.addColorStop(1, '#faf7f3')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, 1080, 1440)

  const line = (y: number) => {
    ctx.strokeStyle = '#ded6d2'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(72, y); ctx.lineTo(1008, y); ctx.stroke()
  }
  const text = (value: string, x: number, y: number, size: number, color = ink, weight = 400, maxWidth = 936) => {
    ctx.font = `${weight} ${size}px ${font}`
    ctx.fillStyle = color
    const characters = Array.from(value.replace(/\s+/g, ' ').trim())
    let output = characters.join('')
    if (ctx.measureText(output).width > maxWidth) {
      while (characters.length && ctx.measureText(characters.join('') + '…').width > maxWidth) characters.pop()
      output = characters.join('') + '…'
    }
    ctx.fillText(output, x, y)
  }

  text('LX FLOW', 72, 62, 28, ink, 700)
  text('LISTENING ARCHIVE', 72, 100, 16, muted, 500)
  text(model.status, 730, 70, 20, accent, 500, 278)
  line(146)
  text(model.period, 72, 184, 27, accent, 600)
  text(model.title, 72, 232, 48, ink, 700, 690)
  text(model.hours, 65, 316, 118, ink, 700, 640)
  text(model.hoursLabel, 74, 448, 25, muted)
  text(model.subtitle, 72, 505, 25, muted)

  // A record drawn as vectors stays crisp at the exported image size.
  ctx.save()
  ctx.translate(869, 355)
  for (let radius = 50; radius <= 131; radius += 9) {
    ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.strokeStyle = '#ce9aa2'; ctx.lineWidth = 1; ctx.stroke()
  }
  ctx.beginPath(); ctx.arc(0, 0, 42, 0, Math.PI * 2); ctx.fillStyle = accent; ctx.fill()
  ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fillStyle = '#faf7f3'; ctx.fill()
  ctx.restore()

  model.metrics.forEach((metric, index) => {
    const x = 72 + index * 320
    text(metric.value, x, 582, 47, ink, 600, 286)
    text(metric.label, x, 641, 19, muted, 400, 286)
  })
  line(702)
  text(model.tracksTitle, 72, 738, 23, accent, 600)
  model.tracks.forEach((track, index) => {
    const y = 797 + index * 89
    text(String(index + 1).padStart(2, '0'), 72, y + 3, 24, accent, 600, 52)
    text(track.title, 134, y, 29, ink, 600, 660)
    text(track.subtitle, 134, y + 39, 20, muted, 400, 660)
    text(track.count, 826, y + 5, 20, muted, 400, 182)
  })
  if (!model.tracks.length) text(model.emptyTracks, 72, 848, 26, muted, 400)
  line(1081)
  model.insights.forEach((insight, index) => {
    const x = 72 + index * 486
    text(insight.label, x, 1120, 20, muted, 400, 450)
    text(insight.value, x, 1163, 30, ink, 600, 450)
    text(insight.detail, x, 1211, 20, accent, 400, 450)
  })
  line(1270)
  model.footer.forEach((value, index) => { text(value, 72, 1300 + index * 28, 17, muted) })
  text('LX FLOW MUSIC', 72, 1400, 15, accent, 600)
  return canvas.toDataURL('image/png')
}
