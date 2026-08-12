import { getCompanyDetails } from "@/lib/services/company"

import { defineTool } from "@/lib/mcp/define-tool"
import { safeText } from "@/lib/mcp/output"

/**
 * Firemní profil vystavovatele. Záměrně jen ke čtení — změna fakturační
 * identity patří do aplikace, ne do konverzace s modelem.
 */
export const getCompanyProfileTool = defineTool({
  name: "get_company_profile",
  title: "Firemní údaje vystavovatele",
  description:
    "Vrátí údaje, které se tisknou na faktury jako údaje vystavovatele (název, adresa, NIE/NIF, " +
    "bankovní spojení). Použij, když uživatel potřebuje ověřit, co je na fakturách uvedené. " +
    "Změna těchto údajů přes MCP možná není — uživatele odkaž na stránku Firma v aplikaci.",
  inputSchema: {},
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  scope: "invoices:read",
  rateLimit: "call",
  handler: async (_args, ctx) => {
    const company = await getCompanyDetails(ctx.service)

    if (!company) {
      return {
        payload: {
          configured: false,
          hint: "Firemní údaje zatím nejsou vyplněné. Faktury je proto nebudou obsahovat.",
        },
        resourceType: "company",
      }
    }

    return {
      payload: {
        configured: true,
        company: {
          company_name: safeText(company.company_name, 200),
          nie: safeText(company.nie, 40),
          nif: safeText(company.nif, 40),
          street: safeText(company.street, 200),
          city: safeText(company.city, 100),
          postal_code: safeText(company.postal_code, 20),
          country: safeText(company.country, 100),
          email: safeText(company.email, 254),
          phone: safeText(company.phone, 40),
          bank_name: safeText(company.bank_name, 100),
          iban: safeText(company.iban, 50),
          swift_bic: safeText(company.swift_bic, 20),
        },
      },
      resourceType: "company",
      resourceId: company.id,
    }
  },
})
