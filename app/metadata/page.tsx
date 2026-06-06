import type { Metadata } from "next"
import { MetadataEditor } from "@/components/metadata/metadata-editor"

export const metadata: Metadata = {
  title: "Editor data fotek · Terky",
  description: "Změň datum pořízení (EXIF) u jedné nebo více fotek a stáhni upravené soubory.",
}

export default function MetadataPage() {
  return <MetadataEditor />
}
