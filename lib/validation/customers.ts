import { z } from "zod"

import { emailSchema, textSchema } from "./common"

/**
 * Prázdné volitelné pole posíláme do databáze jako NULL, ne jako "".
 * Formuláře i MCP nástroje se tak chovají stejně.
 */
function optionalText(max: number, label: string) {
  return textSchema(max, label)
    .transform((value) => (value === "" ? null : value))
    .nullish()
    .transform((value) => value ?? null)
}

export const customerInputSchema = z.object({
  name: textSchema(200, "Název").pipe(z.string().min(1, "Název zákazníka je povinný")),
  email: z
    .union([emailSchema, z.literal("")])
    .nullish()
    .transform((value) => (value ? value : null)),
  phone: optionalText(40, "Telefon"),
  address: optionalText(500, "Adresa"),
  ico: optionalText(40, "NIE"),
  dic: optionalText(40, "NIF"),
  is_business: z.boolean().default(false),
})

export type CustomerInput = z.infer<typeof customerInputSchema>
