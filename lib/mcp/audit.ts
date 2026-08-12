import { callRpc, type McpContext } from "./context"

/**
 * Auditní záznam o volání MCP nástroje.
 *
 * Zapisujeme jen metadata: kdo, čím, co a s jakým výsledkem. Vstupní objekty,
 * osobní údaje, e-maily, částky ani tokeny do auditu nepatří — na dohledání
 * operace stačí identifikátor dotčeného zdroje.
 *
 * Selhání zápisu auditu nesmí shodit samotnou operaci; zaloguje se a jde se dál.
 */
export interface AuditEntry {
  toolName: string
  outcome: "success" | "error"
  errorCode?: string | null
  resourceType?: string | null
  resourceId?: string | null
  idempotencyKey?: string | null
  confirmationId?: string | null
  durationMs: number
}

export async function writeAudit(ctx: McpContext, entry: AuditEntry): Promise<void> {
  try {
    await callRpc<null>(ctx, "mcp_write_audit", {
      p_client_id: ctx.clientId,
      p_tool: entry.toolName,
      p_outcome: entry.outcome,
      p_error_code: entry.errorCode ?? null,
      p_resource_type: entry.resourceType ?? null,
      p_resource_id: entry.resourceId ?? null,
      p_idempotency_key: entry.idempotencyKey ?? null,
      p_confirmation_id: entry.confirmationId ?? null,
      p_duration_ms: entry.durationMs,
    })
  } catch (error) {
    console.error("[mcp] Nepodařilo se zapsat audit:", error)
  }
}
