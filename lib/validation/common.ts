import { z } from "zod"

import { parseDecimal } from "@/lib/money"

/**
 * Sdílené validační stavební kameny. Používá je servisní vrstva i MCP nástroje,
 * aby existovalo jediné místo, které rozhoduje co je platný vstup.
 */

export const uuidSchema = z.string().uuid("Neplatný identifikátor")

/** Datum ve formátu YYYY-MM-DD; DB drží DATE bez časové zóny. */
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum musí být ve formátu RRRR-MM-DD")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
  }, "Neexistující datum")

/**
 * Aplikace umí jedinou měnu — EUR. Ostatní musí selhat hlasitě, ať model
 * nevystaví fakturu ve špatné měně jen proto, že se o ni uživatel otřel.
 */
export const currencySchema = z
  .enum(["EUR"], { error: "Podporována je pouze měna EUR" })
  .default("EUR")

/**
 * Peněžní částka jako řetězec ("100", "100,50") nebo číslo. Výsledkem jsou
 * setiny (centy), takže se s ní dál počítá celočíselně.
 */
export const amountSchema = z
  .union([z.string(), z.number()])
  .transform((value, ctx) => {
    try {
      return parseDecimal(value)
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Neplatná částka" })
      return z.NEVER
    }
  })
  .refine((cents) => cents >= 0, "Částka nesmí být záporná")

/** Množství (DECIMAL(10,2)) — vždy kladné. */
export const quantitySchema = z
  .union([z.string(), z.number()])
  .transform((value, ctx) => {
    try {
      return parseDecimal(value)
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Neplatné množství" })
      return z.NEVER
    }
  })
  .refine((scaled) => scaled > 0, "Množství musí být větší než nula")

/** Procentní sazba 0–100 v setinách procenta (21 % → 2100). */
export const percentSchema = z
  .union([z.string(), z.number()])
  .transform((value, ctx) => {
    try {
      return parseDecimal(value)
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Neplatná sazba" })
      return z.NEVER
    }
  })
  .refine((scaled) => scaled >= 0 && scaled <= 10_000, "Sazba musí být mezi 0 a 100 %")

/** Krátký volný text; ořezává okraje a vynucuje maximální délku. */
export function textSchema(max: number, label: string) {
  return z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().max(max, `${label} může mít nejvýše ${max} znaků`))
}

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Neplatná e-mailová adresa")
  .max(254)

/** Stránkování pro čtecí operace — nikdy nevracíme neomezený seznam. */
export const paginationSchema = z.object({
  limit: z.number().int().min(1).max(50).default(20),
  offset: z.number().int().min(0).max(10_000).default(0),
})

export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8, "Idempotency key musí mít alespoň 8 znaků")
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/, "Idempotency key smí obsahovat jen písmena, číslice a . _ : -")

/** Vytáhne z chyby zod první srozumitelnou hlášku. */
export function firstIssueMessage(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return "Neplatný vstup"
  const path = issue.path.join(".")
  return path ? `${path}: ${issue.message}` : issue.message
}
