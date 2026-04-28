"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("App error:", error)
  }, [error])

  return (
    <div className="min-h-svh flex items-center justify-center bg-background px-6 py-12">
      <div className="max-w-md w-full text-center">
        <p className="text-[10px] uppercase tracking-[0.32em] text-muted-foreground mb-4">
          Něco se nepovedlo
        </p>
        <h1 className="font-serif text-4xl sm:text-5xl text-foreground tracking-tight leading-[1.05] mb-4">
          Něco se <span className="italic text-primary">pokazilo.</span>
        </h1>
        <p className="text-muted-foreground mb-8 leading-relaxed">
          Došlo k neočekávané chybě. Zkus prosím obnovit stránku.
        </p>
        {error.digest && (
          <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/70 font-mono mb-8">
            ID chyby: {error.digest}
          </p>
        )}
        <Button
          onClick={reset}
          className="text-[11px] uppercase tracking-[0.22em] shadow-none"
        >
          Zkusit znovu
        </Button>
      </div>
    </div>
  )
}
