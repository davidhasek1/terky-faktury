import { consumeConfirmation, createConfirmation } from "./confirmations"
import type { McpContext } from "./context"
import type { ToolResult } from "./define-tool"

/**
 * Dvoufázový zápis: jeden nástroj, dvě volání.
 *
 * Bez `confirmation_token` nástroj spočítá, co by se stalo, uloží otisk
 * parametrů a vrátí návrh. S tokenem tytéž parametry ověří proti otisku
 * a operaci provede.
 *
 * Dřív na to byly nástroje dva — `prepare_*` a zapisující. Model tak musel
 * mezi voláními přepnout nástroj a přepsat celou sadu parametrů z odpovědi,
 * a na tom to opakovaně padalo: buď zapisující nástroj vůbec nezavolal, nebo
 * sestavil volání, které neprošlo schématem. Navíc se do vstupního schématu
 * prosákl tvar otisku (pole jako `action` nebo `paid_date: null` u mazání).
 *
 * Takhle volá model stejný nástroj se stejnými argumenty a jen přidá token.
 * Otisk se počítá až uvnitř z normalizovaných hodnot, takže netvoří API.
 *
 * Bezpečnost zůstává: token vydává server, je jednorázový, vázaný na uživatele
 * i na konkrétní parametry a po jejich změně přestává platit.
 */

export interface TwoPhaseOptions {
  /** Jméno nástroje. Slouží i jako klíč potvrzení. */
  tool: string
  token?: string | null
  /** Normalizované parametry, ze kterých se počítá otisk. */
  params: unknown
  /** Co se ještě NEstalo — první, co model ve výstupu uvidí. */
  status: string
  summary: Record<string, unknown>
  warnings?: string[]
  resourceType?: string
  resourceId?: string | null
  /** Provede se až ve druhé fázi, po ověření tokenu. */
  execute: (confirmationId: string) => Promise<ToolResult>
}

export async function twoPhase(ctx: McpContext, options: TwoPhaseOptions): Promise<ToolResult> {
  if (options.token) {
    const confirmationId = await consumeConfirmation(
      ctx,
      options.tool,
      options.token,
      options.params,
    )
    return options.execute(confirmationId)
  }

  const confirmation = await createConfirmation(ctx, options.tool, options.params, options.summary)

  return {
    payload: {
      saved: false,
      status: options.status,
      required_action: {
        tool: options.tool,
        note:
          `Nic zatím nevzniklo. Ukaž uživateli souhrn, vyžádej si výslovný souhlas a zavolej ` +
          `${options.tool} ZNOVU se stejnými argumenty a navíc s confirmation_token. Dokud to ` +
          "neuděláš, v aplikaci se nezmění vůbec nic — neoznamuj, že je hotovo.",
      },
      summary: options.summary,
      warnings: options.warnings ?? [],
      confirmation_token: confirmation.token,
      expires_at: confirmation.expiresAt,
    },
    resourceType: options.resourceType,
    resourceId: options.resourceId ?? null,
  }
}

/** Popis pole `confirmation_token`, aby byl u všech nástrojů stejný. */
export const CONFIRMATION_TOKEN_HINT =
  "Nech prázdné pro první volání — vrátí se návrh k potvrzení. Po souhlasu uživatele zavolej " +
  "nástroj znovu se stejnými argumenty a s tokenem z toho návrhu."
