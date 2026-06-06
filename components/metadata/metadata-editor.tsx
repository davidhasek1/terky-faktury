"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import JSZip from "jszip"
import { toast } from "sonner"
import {
  Calendar,
  Camera,
  Download,
  ImageIcon,
  Loader2,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SectionLabel } from "@/components/layout/section-label"
import { cn } from "@/lib/utils"
import {
  dataUrlToBlob,
  fileToDataUrl,
  isJpeg,
  outputName,
  readJpegExif,
  setJpegDate,
  toJpegDataUrl,
} from "@/lib/image-metadata"

interface ImageItem {
  id: string
  file: File
  name: string
  type: string
  dataUrl: string
  previewUrl: string
  originalDate: Date | null
  make?: string
  model?: string
  targetDate: Date
  /** JPEG can be edited in place; everything else is re-encoded to JPEG. */
  needsConvert: boolean
}

const ACCEPTED = /\.(jpe?g|png|webp|gif|bmp|tiff?)$/i

function toDatetimeLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(
    d.getMinutes(),
  )}:${p(d.getSeconds())}`
}

function fromDatetimeLocal(value: string): Date | null {
  if (!value) return null
  const d = new Date(value) // datetime-local is interpreted as local time
  return Number.isNaN(d.getTime()) ? null : d
}

const dateFmt = new Intl.DateTimeFormat("cs-CZ", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** Produce the edited JPEG bytes for a single item. */
async function buildOutput(item: ImageItem): Promise<{ blob: Blob; name: string }> {
  const jpegDataUrl = item.needsConvert ? await toJpegDataUrl(item.dataUrl) : item.dataUrl
  const edited = setJpegDate(jpegDataUrl, item.targetDate)
  return { blob: dataUrlToBlob(edited), name: outputName(item.name, item.needsConvert) }
}

export function MetadataEditor() {
  const [items, setItems] = useState<ImageItem[]>([])
  const [masterDate, setMasterDate] = useState(() => toDatetimeLocal(new Date()))
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Revoke object URLs when items are removed / on unmount.
  const itemsRef = useRef<ImageItem[]>([])
  itemsRef.current = items
  useEffect(() => {
    return () => {
      itemsRef.current.forEach((it) => URL.revokeObjectURL(it.previewUrl))
    }
  }, [])

  const addFiles = useCallback(async (files: File[]) => {
    const images = files.filter(
      (f) => f.type.startsWith("image/") || ACCEPTED.test(f.name),
    )
    if (images.length === 0) {
      toast.error("Žádné obrázky k přidání")
      return
    }

    const built = await Promise.all(
      images.map(async (file): Promise<ImageItem> => {
        const dataUrl = await fileToDataUrl(file)
        const jpeg = isJpeg(file.type, file.name)
        const exif = jpeg ? readJpegExif(dataUrl) : { dateOriginal: null }
        const fallback = file.lastModified ? new Date(file.lastModified) : new Date()
        return {
          id: crypto.randomUUID(),
          file,
          name: file.name || "vlozena-fotka.jpg",
          type: file.type,
          dataUrl,
          previewUrl: URL.createObjectURL(file),
          originalDate: exif.dateOriginal,
          make: "make" in exif ? exif.make : undefined,
          model: "model" in exif ? exif.model : undefined,
          targetDate: exif.dateOriginal ?? fallback,
          needsConvert: !jpeg,
        }
      }),
    )

    setItems((prev) => [...prev, ...built])
    toast.success(`Přidáno ${built.length} ${plural(built.length, "fotka", "fotky", "fotek")}`)
  }, [])

  // Global paste support (Ctrl/Cmd+V anywhere on the page).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.items ?? [])
        .filter((it) => it.kind === "file")
        .map((it) => it.getAsFile())
        .filter((f): f is File => Boolean(f))
      if (files.length > 0) {
        e.preventDefault()
        void addFiles(files)
      }
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
  }, [addFiles])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    void addFiles(Array.from(e.dataTransfer.files))
  }

  const updateTarget = (id: string, value: string) => {
    const date = fromDatetimeLocal(value)
    if (!date) return
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, targetDate: date } : it)))
  }

  const applyMasterToAll = () => {
    const date = fromDatetimeLocal(masterDate)
    if (!date) {
      toast.error("Neplatné datum")
      return
    }
    if (items.length === 0) {
      toast.error("Nejdřív přidej nějaké fotky")
      return
    }
    setItems((prev) => prev.map((it) => ({ ...it, targetDate: date })))
    toast.success("Datum nastaveno u všech fotek")
  }

  const resetItem = (id: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? {
              ...it,
              targetDate:
                it.originalDate ?? (it.file.lastModified ? new Date(it.file.lastModified) : new Date()),
            }
          : it,
      ),
    )
  }

  const removeItem = (id: string) => {
    setItems((prev) => {
      const found = prev.find((it) => it.id === id)
      if (found) URL.revokeObjectURL(found.previewUrl)
      return prev.filter((it) => it.id !== id)
    })
  }

  const clearAll = () => {
    items.forEach((it) => URL.revokeObjectURL(it.previewUrl))
    setItems([])
  }

  const downloadOne = async (item: ImageItem) => {
    try {
      setBusy(true)
      const { blob, name } = await buildOutput(item)
      triggerDownload(blob, name)
    } catch (err) {
      toast.error(`Nepodařilo se zpracovat ${item.name}`)
      console.error(err)
    } finally {
      setBusy(false)
    }
  }

  const downloadAll = async () => {
    if (items.length === 0) return
    if (items.length === 1) {
      await downloadOne(items[0])
      return
    }
    try {
      setBusy(true)
      const zip = new JSZip()
      const used = new Set<string>()
      for (const item of items) {
        const { blob, name } = await buildOutput(item)
        let unique = name
        let i = 1
        while (used.has(unique)) {
          unique = name.replace(/(\.[^.]+)$/, `-${i}$1`)
          i++
        }
        used.add(unique)
        zip.file(unique, blob)
      }
      const content = await zip.generateAsync({ type: "blob" })
      triggerDownload(content, "fotky-s-upravenym-datem.zip")
      toast.success("ZIP stažen")
    } catch (err) {
      toast.error("Nepodařilo se vytvořit ZIP")
      console.error(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="container mx-auto py-10 sm:py-16 px-4 sm:px-8 max-w-5xl">
      <header className="mb-12 sm:mb-16">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-6">
          Nástroj · Metadata fotografií
        </p>
        <h1 className="font-serif text-4xl sm:text-6xl leading-[1.05] tracking-tight text-foreground mb-6">
          Editor <span className="italic text-primary">data fotek</span>
        </h1>
        <p className="text-base sm:text-lg text-muted-foreground max-w-2xl leading-relaxed">
          Vlož nebo nahraj jednu či více fotek, změň jim datum pořízení (EXIF) a stáhni si
          upravené soubory. Všechno probíhá přímo v prohlížeči — fotky se nikam neodesílají.
        </p>
      </header>

      {/* 01 — Nahrát */}
      <section className="mb-12 sm:mb-16">
        <SectionLabel number="01" title="Nahrát" />
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={cn(
            "flex flex-col items-center justify-center gap-4 border border-dashed px-6 py-14 sm:py-20 text-center cursor-pointer transition-colors",
            dragging
              ? "border-primary bg-secondary/60"
              : "border-border bg-card hover:border-primary/60 hover:bg-secondary/30",
          )}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-primary">
            <Upload className="h-5 w-5" />
          </span>
          <div>
            <p className="font-serif text-2xl text-foreground mb-1">Přetáhni sem fotky</p>
            <p className="text-sm text-muted-foreground">
              nebo klikni pro výběr · můžeš taky vložit ze schránky{" "}
              <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
                Ctrl/⌘ + V
              </kbd>
            </p>
          </div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            JPEG · PNG · WebP · a další
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) void addFiles(Array.from(e.target.files))
              e.target.value = ""
            }}
          />
        </div>
      </section>

      {/* 02 — Datum */}
      <section className="mb-12 sm:mb-16">
        <SectionLabel number="02" title="Hromadné datum" />
        <div className="border border-border bg-card px-6 py-8 sm:px-8 flex flex-col sm:flex-row sm:items-end gap-6">
          <div className="flex-1">
            <label className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-3 flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-primary" />
              Datum a čas pořízení
            </label>
            <Input
              type="datetime-local"
              step={1}
              value={masterDate}
              onChange={(e) => setMasterDate(e.target.value)}
              className="max-w-xs"
            />
          </div>
          <Button
            onClick={applyMasterToAll}
            className="text-[11px] uppercase tracking-[0.22em] self-start sm:self-auto"
          >
            Použít na všechny
          </Button>
        </div>
      </section>

      {/* 03 — Fotky */}
      {items.length > 0 && (
        <section className="mb-10">
          <SectionLabel number="03" title={`Fotky (${items.length})`} />

          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <Button
              onClick={downloadAll}
              disabled={busy}
              className="text-[11px] uppercase tracking-[0.22em]"
            >
              {busy ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="mr-2 h-3.5 w-3.5" />
              )}
              {items.length > 1 ? "Stáhnout vše (ZIP)" : "Stáhnout"}
            </Button>
            <Button
              variant="ghost"
              onClick={clearAll}
              disabled={busy}
              className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground"
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Vymazat vše
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border border border-border">
            {items.map((item) => (
              <article key={item.id} className="bg-card p-5 sm:p-6 flex gap-5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.previewUrl}
                  alt={item.name}
                  className="h-24 w-24 shrink-0 rounded object-cover border border-border bg-muted"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <p className="font-medium text-sm text-foreground truncate" title={item.name}>
                      {item.name}
                    </p>
                    <button
                      onClick={() => removeItem(item.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                      aria-label="Odebrat"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <dl className="text-xs text-muted-foreground space-y-1 mb-4">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="h-3 w-3" />
                      <span>
                        Původní datum:{" "}
                        <span className="text-foreground">
                          {item.originalDate ? dateFmt.format(item.originalDate) : "—"}
                        </span>
                      </span>
                    </div>
                    {(item.make || item.model) && (
                      <div className="flex items-center gap-2">
                        <Camera className="h-3 w-3" />
                        <span className="truncate">
                          {[item.make, item.model].filter(Boolean).join(" ")}
                        </span>
                      </div>
                    )}
                    {item.needsConvert && (
                      <p className="text-[11px] text-amber-700">
                        Není JPEG — při stažení se převede na JPEG.
                      </p>
                    )}
                  </dl>

                  <div className="flex flex-wrap items-end gap-2">
                    <div className="flex-1 min-w-[180px]">
                      <label className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1.5">
                        Nové datum
                      </label>
                      <Input
                        type="datetime-local"
                        step={1}
                        value={toDatetimeLocal(item.targetDate)}
                        onChange={(e) => updateTarget(item.id, e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => resetItem(item.id)}
                      title="Vrátit původní datum"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => downloadOne(item)}
                      className="text-[10px] uppercase tracking-[0.2em] bg-transparent"
                    >
                      <Download className="mr-1.5 h-3.5 w-3.5" />
                      Stáhnout
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one
  if (n >= 2 && n <= 4) return few
  return many
}
