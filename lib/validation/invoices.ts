import { z } from "zod"

import { DEFAULT_TAX_RATE } from "@/lib/services/invoice-totals"

import {
  amountSchema,
  currencySchema,
  dateSchema,
  paginationSchema,
  percentSchema,
  quantitySchema,
  textSchema,
  uuidSchema,
} from "./common"

/** Kolik položek unese jedna faktura. Chrání PDF i kontext modelu. */
export const MAX_INVOICE_ITEMS = 50

export const invoiceItemInputSchema = z.object({
  description: textSchema(500, "Popis položky").pipe(
    z.string().min(1, "Popis položky je povinný"),
  ),
  quantity: quantitySchema,
  unit_price: amountSchema,
})

export type InvoiceItemInput = z.infer<typeof invoiceItemInputSchema>

export const invoiceInputSchema = z
  .object({
    customer_id: uuidSchema,
    issue_date: dateSchema,
    due_date: dateSchema,
    /**
     * Sazba DPH v %. Výchozí hodnota je stejná konstanta, se kterou počítá
     * formulář i MCP nástroj. Pozor: zod 4 bere `.default()` na výstupní
     * straně, takže je v setinách procenta (2100 = 21 %).
     */
    tax_rate: percentSchema.default(DEFAULT_TAX_RATE),
    /**
     * Retención v %. Když se nezadá, doplní ji servisní vrstva podle toho,
     * zda je zákazník podnikající subjekt (15 %), jinak 0 %.
     */
    retention_rate: percentSchema.optional(),
    notes: textSchema(2000, "Poznámka")
      .transform((value) => (value === "" ? null : value))
      .nullish()
      .transform((value) => value ?? null),
    currency: currencySchema,
    items: z
      .array(invoiceItemInputSchema)
      .min(1, "Faktura musí mít alespoň jednu položku")
      .max(MAX_INVOICE_ITEMS, `Faktura může mít nejvýše ${MAX_INVOICE_ITEMS} položek`),
  })
  .refine((value) => value.due_date >= value.issue_date, {
    message: "Datum splatnosti nesmí být dříve než datum vystavení",
    path: ["due_date"],
  })

export type InvoiceInput = z.infer<typeof invoiceInputSchema>

export const invoiceStatusSchema = z.enum(["all", "paid", "unpaid", "overdue"])

export type InvoiceStatusFilter = z.infer<typeof invoiceStatusSchema>

export const invoiceListSchema = paginationSchema.extend({
  status: invoiceStatusSchema.default("all"),
  customer_id: uuidSchema.optional(),
  issued_from: dateSchema.optional(),
  issued_to: dateSchema.optional(),
})

export type InvoiceListFilters = z.infer<typeof invoiceListSchema>
