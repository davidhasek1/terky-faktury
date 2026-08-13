import { ClipboardList } from "lucide-react"

import { DataTable, Dash, TableCell, TableHead } from "@/components/patterns/data-table"
import { EmptyState } from "@/components/patterns/empty-state"
import type { Activity } from "@/lib/types"
import { formatCurrency, formatDate } from "@/lib/utils"
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
      <EmptyState
        icon={<ClipboardList className="size-8" />}
        title="Zatím prázdno."
        description="Pro tohoto zákazníka zatím není zaznamenaná žádná aktivita."
      />
    )
  }

  return (
    <DataTable
      head={
        <>
          <TableHead>Datum</TableHead>
          <TableHead>Popis</TableHead>
          <TableHead align="right">Celkem</TableHead>
          <TableHead>Stav</TableHead>
          <TableHead align="right">Akce</TableHead>
        </>
      }
    >
      {activities.map((activity, idx) => (
        <tr
          key={activity.id}
          className={idx !== activities.length - 1 ? "border-b border-border/60" : ""}
        >
          <TableCell className="tabular-nums">{formatDate(activity.activity_date)}</TableCell>
          <TableCell>
            <ServiceBreakdown services={activity.services ?? []} />
          </TableCell>
          <TableCell align="right" className="font-display font-semibold tabular-nums">
            {formatCurrency(activity.total_amount)}
          </TableCell>
          <TableCell>
            <ActivityStatusToggle activityId={activity.id} status={activity.status} />
          </TableCell>
          <TableCell align="right">
            <ActivityRowActions customerId={customerId} activityId={activity.id} />
          </TableCell>
        </tr>
      ))}
    </DataTable>
  )
}

function ServiceBreakdown({ services }: { services: NonNullable<Activity["services"]> }) {
  if (services.length === 0) {
    return <Dash />
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
