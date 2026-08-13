"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

/**
 * Needitovatelné pole s tlačítkem „Kopírovat".
 *
 * Clipboard API funguje jen v zabezpečeném kontextu (HTTPS nebo localhost);
 * když není k dispozici, řekneme to rovnou místo tichého selhání.
 */
export function CopyField({
  value,
  label,
  multiline = false,
  className,
}: {
  value: string
  label?: string
  multiline?: boolean
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (!navigator.clipboard) {
      toast.error("Kopírování v tomhle prohlížeči nefunguje, označ text ručně")
      return
    }

    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Nepodařilo se zkopírovat, označ text ručně")
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <p className="text-xs font-medium text-muted-foreground">
          {label}
        </p>
      )}
      <div className="flex items-start gap-2">
        <pre
          className={cn(
            "flex-1 min-w-0 rounded-xl border border-border/70 bg-muted/40 px-4 py-3",
            "font-mono text-xs text-foreground overflow-x-auto",
            multiline ? "whitespace-pre" : "whitespace-nowrap",
          )}
        >
          {value}
        </pre>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCopy}
          className="shrink-0 text-xs"
        >
          {copied ? (
            <>
              <Check className="mr-1.5 h-3.5 w-3.5" />
              Zkopírováno
            </>
          ) : (
            <>
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              Kopírovat
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
