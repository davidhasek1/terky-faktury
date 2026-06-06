// Minimal type declarations for piexifjs (https://github.com/hMatoba/piexifjs).
// The package ships no types of its own; we only declare the surface we use.
declare module "piexifjs" {
  /** Exif data as returned by `load` / consumed by `dump`. */
  export interface ExifDict {
    "0th": Record<number, unknown>
    Exif: Record<number, unknown>
    GPS: Record<number, unknown>
    Interop: Record<number, unknown>
    "1st": Record<number, unknown>
    thumbnail: string | null
  }

  interface Piexif {
    version: string
    /** Parse Exif from a JPEG given as a base64 data URL or binary string. */
    load(jpegData: string): ExifDict
    /** Serialize an Exif dict back into an Exif byte string. */
    dump(exifDict: Partial<ExifDict>): string
    /** Insert serialized Exif bytes into a JPEG data URL / binary string. */
    insert(exifBytes: string, jpegData: string): string
    /** Strip all Exif from a JPEG data URL / binary string. */
    remove(jpegData: string): string
    /** Tag id maps. */
    ImageIFD: Record<string, number>
    ExifIFD: Record<string, number>
    GPSIFD: Record<string, number>
    InteropIFD: Record<string, number>
  }

  const piexif: Piexif
  export default piexif
}
