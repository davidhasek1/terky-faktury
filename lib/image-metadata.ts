import piexif, { type ExifDict } from "piexifjs"

// ---------------------------------------------------------------------------
// Image metadata helpers (client-side only).
//
// Exif date editing only works on JPEG files. Other decodable formats
// (PNG, WebP, …) are re-encoded to JPEG via <canvas> so we can still embed
// the chosen capture date. The work happens entirely in the browser — no
// upload, the original bytes never leave the device.
// ---------------------------------------------------------------------------

export interface ExifSummary {
  /** DateTimeOriginal (falls back to DateTime) parsed to a local Date. */
  dateOriginal: Date | null
  make?: string
  model?: string
}

const EMPTY_EXIF: ExifSummary = { dateOriginal: null }

/** True for files we can edit Exif on directly (no re-encode needed). */
export function isJpeg(type: string, name: string): boolean {
  return type === "image/jpeg" || type === "image/jpg" || /\.jpe?g$/i.test(name)
}

/** Read a File as a base64 data URL. */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error("Soubor nelze přečíst"))
    reader.readAsDataURL(file)
  })
}

/** Exif stores dates as "YYYY:MM:DD HH:MM:SS" in local time. */
export function formatExifDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}:${p(d.getMonth() + 1)}:${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes(),
  )}:${p(d.getSeconds())}`
}

/** Parse an Exif date string back to a Date (local time). */
export function parseExifDate(value: unknown): Date | null {
  if (typeof value !== "string") return null
  const m = value.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)
  if (!m) return null
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6]),
  )
  return Number.isNaN(d.getTime()) ? null : d
}

/** Read the date + camera info out of a JPEG data URL. */
export function readJpegExif(dataUrl: string): ExifSummary {
  try {
    const obj = piexif.load(dataUrl)
    const zeroth = obj["0th"]
    const exif = obj.Exif
    const original = parseExifDate(exif[piexif.ExifIFD.DateTimeOriginal])
    const fallback = parseExifDate(zeroth[piexif.ImageIFD.DateTime])
    const make = typeof zeroth[piexif.ImageIFD.Make] === "string" ? (zeroth[piexif.ImageIFD.Make] as string).replace(/\0/g, "").trim() : undefined
    const model = typeof zeroth[piexif.ImageIFD.Model] === "string" ? (zeroth[piexif.ImageIFD.Model] as string).replace(/\0/g, "").trim() : undefined
    return {
      dateOriginal: original ?? fallback,
      make: make || undefined,
      model: model || undefined,
    }
  } catch {
    return EMPTY_EXIF
  }
}

/**
 * Write the given capture date into a JPEG data URL, returning a new data URL.
 * Sets DateTimeOriginal, DateTimeDigitized and (0th) DateTime.
 */
export function setJpegDate(dataUrl: string, date: Date): string {
  const value = formatExifDate(date)

  let obj: ExifDict
  try {
    obj = piexif.load(dataUrl)
  } catch {
    obj = { "0th": {}, Exif: {}, GPS: {}, Interop: {}, "1st": {}, thumbnail: null }
  }

  obj.Exif[piexif.ExifIFD.DateTimeOriginal] = value
  obj.Exif[piexif.ExifIFD.DateTimeDigitized] = value
  obj["0th"][piexif.ImageIFD.DateTime] = value

  let bytes: string
  try {
    bytes = piexif.dump(obj)
  } catch {
    // Some embedded thumbnails are too large / malformed for piexif.dump —
    // drop the thumbnail and retry; the main image is untouched.
    obj["1st"] = {}
    obj.thumbnail = null
    bytes = piexif.dump(obj)
  }
  return piexif.insert(bytes, dataUrl)
}

/** Re-encode any browser-decodable image data URL to a JPEG data URL. */
export function toJpegDataUrl(dataUrl: string, quality = 0.92): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext("2d")
      if (!ctx) {
        reject(new Error("Plátno (canvas) není dostupné"))
        return
      }
      // Flatten any transparency onto white so JPEG looks right.
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)
      resolve(canvas.toDataURL("image/jpeg", quality))
    }
    img.onerror = () => reject(new Error("Obrázek nelze dekódovat v prohlížeči"))
    img.src = dataUrl
  })
}

/** Convert a data URL to a Blob without fetch(). */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",")
  const header = dataUrl.slice(0, comma)
  const body = dataUrl.slice(comma + 1)
  const mime = header.match(/data:([^;]+)/)?.[1] ?? "application/octet-stream"
  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

/** Output filename — keep the original for JPEG, switch extension when converting. */
export function outputName(name: string, converted: boolean): string {
  if (!converted && /\.jpe?g$/i.test(name)) return name
  const base = name.replace(/\.[^.]+$/, "") || "fotka"
  return `${base}.jpg`
}
