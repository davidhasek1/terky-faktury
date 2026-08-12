"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createBrowserServiceContext } from "@/lib/services/browser-context"
import { setActivityStatus } from "@/lib/services/activities"
import type { ActivityStatus } from "@/lib/types"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface ActivityStatusToggleProps {
  activityId: string
  status: ActivityStatus
}

export function ActivityStatusToggle({ activityId, status }: ActivityStatusToggleProps) {
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)
  const [optimisticStatus, setOptimisticStatus] = useState<ActivityStatus>(status)

  const handleClick = async () => {
    if (isPending) return
    const next: ActivityStatus = optimisticStatus === "paid" ? "unpaid" : "paid"
    setOptimisticStatus(next)
    setIsPending(true)
    try {
      await setActivityStatus(await createBrowserServiceContext(), activityId, next)
      router.refresh()
    } catch (err) {
      setOptimisticStatus(optimisticStatus)
      console.error("[activities] Nepodařilo se změnit stav aktivity:", err)
      toast.error("Nepodařilo se změnit stav aktivity")
    } finally {
      setIsPending(false)
    }
  }

  const isPaid = optimisticStatus === "paid"

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className={cn(
        "inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-medium transition-opacity",
        isPaid ? "text-emerald-700" : "text-muted-foreground",
        isPending && "opacity-60",
      )}
      aria-label={isPaid ? "Označit jako nezaplacené" : "Označit jako zaplacené"}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          isPaid ? "bg-emerald-500" : "bg-muted-foreground/60",
        )}
        aria-hidden="true"
      />
      {isPaid ? "Zaplaceno" : "Nezaplaceno"}
    </button>
  )
}
