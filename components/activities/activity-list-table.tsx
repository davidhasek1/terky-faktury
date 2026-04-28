import type { Activity } from "@/lib/types"
import { formatCurrency } from "@/lib/utils"
import { SERVICE_LABELS } from "./service-labels"
import { ActivityStatusToggle } from "./activity-status-toggle"
import { ActivityRowActions } from "./activity-row-actions"

interface ActivityListTableProps {
  customerId: string
  activities: Activity[]
}

export function ActivityListTable({ customerId, activities }: ActivityListTableProps) {
  if (activities.length === 0) {
    return (
      <div className="border border-border bg-card px-6 py-20 text-center">
        <p className="font-serif italic text-2xl text-muted-foreground mb-4">Zatím prázdno.</p>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
          Pro tohoto zákazníka zatím není zaznamenaná žádná aktivita.
        </p>
      </div>
    )
  }

  return (
    <div className="border border-border bg-card overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            <Th>Datum</Th>
            <Th>Popis</Th>
            <Th align="right">Celkem</Th>
            <Th>Stav</Th>
            <Th align="right">Akce</Th>
          </tr>
        </thead>
        <tbody>
          {activities.map((activity, idx) => (
            <tr
              key={activity.id}
              className={idx !== activities.length - 1 ? "border-b border-border/60" : ""}
            >
              <Td>
                <span className="font-serif text-base text-foreground tabular-nums">
                  {formatDate(activity.activity_date)}
                </span>
              </Td>
              <Td>
                <ServiceBreakdown services={activity.services ?? []} />
              </Td>
              <Td align="right" className="font-serif text-lg tabular-nums">
                {formatCurrency(activity.total_amount)}
              </Td>
              <Td>
                <ActivityStatusToggle activityId={activity.id} status={activity.status} />
              </Td>
              <Td align="right">
                <ActivityRowActions customerId={customerId} activityId={activity.id} />
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ServiceBreakdown({ services }: { services: NonNullable<Activity["services"]> }) {
  if (services.length === 0) {
    return <span className="text-muted-foreground/60">—</span>
  }
  return (
    <div className="flex flex-col gap-1">
      {services.map((s) => (
        <div key={s.id ?? `${s.service_type}-${s.price}`} className="text-sm text-foreground">
          <span className="font-medium">{SERVICE_LABELS[s.service_type]}</span>
          <span className="text-muted-foreground"> · </span>
          <span className="tabular-nums">{formatCurrency(Number(s.price))}</span>
          {s.note && (
            <>
              <span className="text-muted-foreground"> — </span>
              <span className="italic text-muted-foreground">{s.note}</span>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-")
  return `${Number(d)}. ${Number(m)}. ${y}`
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th
      className={
        "text-[10px] uppercase tracking-[0.22em] font-medium text-muted-foreground py-4 px-5 " +
        (align === "right" ? "text-right" : "text-left")
      }
    >
      {children}
    </th>
  )
}

function Td({
  children,
  align,
  className = "",
}: {
  children: React.ReactNode
  align?: "right"
  className?: string
}) {
  return (
    <td
      className={
        "py-5 px-5 text-sm text-foreground " +
        (align === "right" ? "text-right " : "") +
        className
      }
    >
      {children}
    </td>
  )
}
