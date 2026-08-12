import { NextResponse } from "next/server"
import { z } from "zod"

import {
  createPersonalToken,
  listPersonalTokens,
  personalTokenInputSchema,
} from "@/lib/mcp/personal-tokens"
import { isServiceError } from "@/lib/services/errors"
import { createServerServiceContext, serviceErrorStatus } from "@/lib/services/server-context"
import { firstIssueMessage } from "@/lib/validation/common"

/**
 * Správa osobních MCP tokenů ze stránky `/connect`.
 *
 * Autorizuje se cookie session přihlášeného uživatele — ne MCP tokenem, aby
 * si jedním tokenem nešlo vyrobit další. Otevřená podoba tokenu se vrací
 * jedinkrát, při vytvoření.
 */
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const ctx = await createServerServiceContext()
    return NextResponse.json({ tokens: await listPersonalTokens(ctx) })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await createServerServiceContext()
    const input = personalTokenInputSchema.parse(await request.json())
    const created = await createPersonalToken(ctx, input)

    return NextResponse.json({ token: created }, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}

function errorResponse(error: unknown): NextResponse {
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: firstIssueMessage(error) }, { status: 400 })
  }

  if (isServiceError(error)) {
    return NextResponse.json({ error: error.message }, { status: serviceErrorStatus(error.code) })
  }

  console.error("[mcp-tokens] Neošetřená chyba:", error)
  return NextResponse.json({ error: "Interní chyba serveru" }, { status: 500 })
}
