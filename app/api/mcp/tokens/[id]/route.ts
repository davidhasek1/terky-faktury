import { NextResponse } from "next/server"

import { revokePersonalToken } from "@/lib/mcp/personal-tokens"
import { isServiceError } from "@/lib/services/errors"
import { createServerServiceContext, serviceErrorStatus } from "@/lib/services/server-context"

/** Odvolání osobního MCP tokenu. Platí okamžitě. */
export const dynamic = "force-dynamic"

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const ctx = await createServerServiceContext()
    await revokePersonalToken(ctx, id)

    return NextResponse.json({ success: true })
  } catch (error) {
    if (isServiceError(error)) {
      return NextResponse.json({ error: error.message }, { status: serviceErrorStatus(error.code) })
    }

    console.error("[mcp-tokens] Nepodařilo se odvolat token:", error)
    return NextResponse.json({ error: "Interní chyba serveru" }, { status: 500 })
  }
}
