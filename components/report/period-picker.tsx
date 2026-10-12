"use client"

import { useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  detectPreset,
  localToday,
  periodContaining,
  periodLabel,
  shiftPeriod,
  type PeriodPreset,
} from "@/lib/services/report-period"
import type { ReportPeriod } from "@/lib/validation/report"
import { cn } from "@/lib/utils"

const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: "month", label: "Měsíc" },
  { value: "quarter", label: "Čtvrtletí" },
  { value: "year", label: "Rok" },
  { value: "custom", label: "Vlastní" },
]

/**
 * Výběr období pro výkaz i seznam nákladů. Stav drží URL (`?from&to`),
 * takže odkaz na konkrétní čtvrtletí jde poslat nebo uložit.
 */
export function PeriodPicker({ period }: { period: ReportPeriod }) {
  const router = useRouter()
  const pathname = usePathname()
  const detected = detectPreset(period)
  const [preset, setPreset] = useState<PeriodPreset>(detected)
  const [customFrom, setCustomFrom] = useState(period.from)
  const [customTo, setCustomTo] = useState(period.to)

  const go = (next: ReportPeriod) => {
    router.push(`${pathname}?from=${next.from}&to=${next.to}`)
  }

  const choosePreset = (value: PeriodPreset) => {
    setPreset(value)
    if (value === "custom") return
    // Při přepnutí typu zůstaneme u období, ve kterém právě jsme.
    go(periodContaining(value, detected === "custom" ? localToday() : period.from))
  }

  const isCustom = preset === "custom"
  const customInvalid = !customFrom || !customTo || customFrom > customTo

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="inline-flex w-fit rounded-full border border-border bg-card p-0.5">
        {PRESETS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => choosePreset(option.value)}
            aria-pressed={preset === option.value}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              preset === option.value
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {isCustom ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (!customInvalid) go({ from: customFrom, to: customTo })
          }}
        >
          <Input
            type="date"
            aria-label="Od"
            value={customFrom}
            onChange={(event) => setCustomFrom(event.target.value)}
            className="w-auto"
          />
          <span className="text-sm text-muted-foreground">–</span>
          <Input
            type="date"
            aria-label="Do"
            value={customTo}
            onChange={(event) => setCustomTo(event.target.value)}
            className="w-auto"
          />
          <Button type="submit" size="sm" variant="outline" disabled={customInvalid}>
            Zobrazit
          </Button>
        </form>
      ) : (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => go(shiftPeriod(period, -1))}
            aria-label="Předchozí období"
          >
            <ChevronLeft />
          </Button>
          <span className="min-w-36 text-center font-medium text-foreground tabular-nums">
            {periodLabel(period)}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => go(shiftPeriod(period, 1))}
            aria-label="Další období"
          >
            <ChevronRight />
          </Button>
        </div>
      )}
    </div>
  )
}
