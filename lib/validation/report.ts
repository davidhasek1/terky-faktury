import { z } from "zod"

import { dateSchema } from "./common"

/** Období výkazu: obě meze včetně, `from` nesmí být po `to`. */
export const reportPeriodSchema = z
  .object({ from: dateSchema, to: dateSchema })
  .refine((period) => period.from <= period.to, {
    message: "Začátek období musí být nejpozději v den konce",
    path: ["to"],
  })

export type ReportPeriod = z.infer<typeof reportPeriodSchema>
