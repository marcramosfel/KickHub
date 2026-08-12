// Lê um ficheiro de imagem, reduz no browser (canvas, máx. 480px)
// e devolve um data URL JPEG (qualidade 0.82) — é isto que vai para o registo.
export function fileToDataURL(file, maxSize = 480, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
    if (!allowedTypes.has(file?.type)) {
      reject(new Error('Usa uma imagem JPEG, PNG ou WebP válida.'))
      return
    }
    if (Number(file?.size) > 12 * 1024 * 1024) {
      reject(new Error('A imagem é demasiado grande. O limite é 12 MB.'))
      return
    }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Não foi possível ler a foto.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('O ficheiro não é uma imagem válida.'))
      img.onload = () => {
        try {
          const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
          const w = Math.max(1, Math.round(img.width * scale))
          const h = Math.max(1, Math.round(img.height * scale))
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          canvas.getContext('2d').drawImage(img, 0, 0, w, h)
          resolve(canvas.toDataURL('image/jpeg', quality))
        } catch {
          reject(new Error('Não foi possível processar a foto.'))
        }
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}
