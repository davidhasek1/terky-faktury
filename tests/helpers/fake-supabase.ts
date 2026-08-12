import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * In-memory náhrada Supabase klienta pro testy.
 *
 * Napodobuje tři věci, na kterých aplikace stojí:
 *  1. podmnožinu PostgREST API, kterou servisní vrstva používá,
 *  2. RLS — klient je svázaný s uživatelem a cizí řádky prostě nevidí,
 *  3. databázové funkce `mcp_*` z migrace 014 a trigger na číslo faktury.
 *
 * Díky bodu 2 mají testy izolace tenantů smysl: kdyby servisní vrstva
 * zapomněla na omezení, test to odhalí stejně jako produkční RLS.
 */

export type Row = Record<string, unknown>

export interface FakeDatabase {
  customers: Row[]
  invoices: Row[]
  invoice_items: Row[]
  activities: Row[]
  activity_services: Row[]
  company_details: Row[]
  mcp_confirmations: Row[]
  mcp_idempotency: Row[]
  mcp_audit_log: Row[]
  mcp_rate_limit: Row[]
  oauth_clients: Row[]
  oauth_authorization_codes: Row[]
  oauth_refresh_tokens: Row[]
  mcp_personal_tokens: Row[]
}

export function createFakeDatabase(): FakeDatabase {
  return {
    customers: [],
    invoices: [],
    invoice_items: [],
    activities: [],
    activity_services: [],
    company_details: [],
    mcp_confirmations: [],
    mcp_idempotency: [],
    mcp_audit_log: [],
    mcp_rate_limit: [],
    oauth_clients: [],
    oauth_authorization_codes: [],
    oauth_refresh_tokens: [],
    mcp_personal_tokens: [],
  }
}

type TableName = keyof FakeDatabase

interface Filter {
  column: string
  op: "eq" | "in" | "is" | "notIs" | "lt" | "lte" | "gt" | "gte" | "ilike"
  value: unknown
}

interface Result<T> {
  data: T
  error: { message: string; code?: string } | null
}

/** Tabulky, které mají vlastní `user_id` a jsou tedy přímo pod RLS. */
const USER_OWNED: TableName[] = [
  "customers",
  "invoices",
  "activities",
  "company_details",
  "mcp_confirmations",
  "mcp_idempotency",
  "mcp_rate_limit",
]

/** Tabulky, jejichž vlastnictví se odvozuje od rodiče. */
const PARENT_OWNED: Partial<Record<TableName, { table: TableName; foreignKey: string }>> = {
  invoice_items: { table: "invoices", foreignKey: "invoice_id" },
  activity_services: { table: "activities", foreignKey: "activity_id" },
}

class FakeQuery<T> implements PromiseLike<Result<T>> {
  private filters: Filter[] = []
  private orFilters: Filter[][] = []
  private orderBy: { column: string; ascending: boolean } | null = null
  private rangeBounds: { from: number; to: number } | null = null
  private rowMode: "many" | "maybe" | "one" = "many"
  private embedCustomer = false

  constructor(
    private db: FakeDatabase,
    private table: TableName,
    private userId: string,
    private operation: "select" | "insert" | "update" | "delete" | "upsert",
    private payload?: Row[] | Row,
    private conflictColumn?: string,
  ) {}

  select(columns = "*"): this {
    this.embedCustomer = columns.includes("customer:customers")
    return this
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ column, op: "eq", value })
    return this
  }

  in(column: string, value: unknown[]): this {
    this.filters.push({ column, op: "in", value })
    return this
  }

  is(column: string, value: unknown): this {
    this.filters.push({ column, op: "is", value })
    return this
  }

  not(column: string, _op: string, value: unknown): this {
    this.filters.push({ column, op: "notIs", value })
    return this
  }

  lt(column: string, value: unknown): this {
    this.filters.push({ column, op: "lt", value })
    return this
  }

  lte(column: string, value: unknown): this {
    this.filters.push({ column, op: "lte", value })
    return this
  }

  gt(column: string, value: unknown): this {
    this.filters.push({ column, op: "gt", value })
    return this
  }

  gte(column: string, value: unknown): this {
    this.filters.push({ column, op: "gte", value })
    return this
  }

  /** Podporuje tvar `sloupec.ilike.vzor,sloupec.ilike.vzor` jako PostgREST. */
  or(expression: string): this {
    const group = expression.split(",").map((part) => {
      const [column, , ...rest] = part.split(".")
      return { column, op: "ilike" as const, value: rest.join(".") }
    })
    this.orFilters.push(group)
    return this
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.orderBy = { column, ascending: options?.ascending ?? true }
    return this
  }

  range(from: number, to: number): this {
    this.rangeBounds = { from, to }
    return this
  }

  returns<R>(): FakeQuery<R> {
    return this as unknown as FakeQuery<R>
  }

  maybeSingle<R>(): FakeQuery<R | null> {
    this.rowMode = "maybe"
    return this as unknown as FakeQuery<R | null>
  }

  single<R>(): FakeQuery<R> {
    this.rowMode = "one"
    return this as unknown as FakeQuery<R>
  }

  then<TResult1 = Result<T>, TResult2 = never>(
    onfulfilled?: ((value: Result<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    try {
      return Promise.resolve(this.execute()).then(onfulfilled, onrejected)
    } catch (error) {
      return Promise.reject(error).then(onfulfilled, onrejected)
    }
  }

  private execute(): Result<T> {
    switch (this.operation) {
      case "insert":
        return this.runInsert()
      case "upsert":
        return this.runUpsert()
      case "update":
        return this.runUpdate()
      case "delete":
        return this.runDelete()
      default:
        return this.shape(this.visibleRows())
    }
  }

  /** RLS: uživatel vidí jen své řádky, u dětí přes vlastnictví rodiče. */
  private visibleRows(): Row[] {
    const all = this.db[this.table]
    const parent = PARENT_OWNED[this.table]

    const owned = USER_OWNED.includes(this.table)
      ? all.filter((row) => row.user_id === this.userId)
      : parent
        ? all.filter((row) =>
            this.db[parent.table].some(
              (parentRow) =>
                parentRow.id === row[parent.foreignKey] && parentRow.user_id === this.userId,
            ),
          )
        : all

    let rows = owned.filter((row) => this.matches(row))

    if (this.orderBy) {
      const { column, ascending } = this.orderBy
      rows = [...rows].sort((a, b) => {
        const left = String(a[column] ?? "")
        const right = String(b[column] ?? "")
        return ascending ? left.localeCompare(right) : right.localeCompare(left)
      })
    }

    if (this.rangeBounds) {
      rows = rows.slice(this.rangeBounds.from, this.rangeBounds.to + 1)
    }

    return rows
  }

  private matches(row: Row): boolean {
    const passes = (filter: Filter): boolean => {
      const value = row[filter.column]
      switch (filter.op) {
        case "eq":
          return value === filter.value
        case "in":
          return (filter.value as unknown[]).includes(value)
        case "is":
          return filter.value === null ? value === null || value === undefined : value === filter.value
        case "notIs":
          return !(value === null || value === undefined)
        case "lt":
          return String(value) < String(filter.value)
        case "gt":
          return String(value) > String(filter.value)
        case "lte":
          return String(value) <= String(filter.value)
        case "gte":
          return String(value) >= String(filter.value)
        case "ilike": {
          const pattern = String(filter.value).replace(/%/g, "").toLowerCase()
          return String(value ?? "").toLowerCase().includes(pattern)
        }
      }
    }

    return (
      this.filters.every(passes) && this.orFilters.every((group) => group.some(passes))
    )
  }

  private runInsert(): Result<T> {
    const rows = (Array.isArray(this.payload) ? this.payload : [this.payload ?? {}]).map((row) =>
      this.withDefaults({ ...row }),
    )

    const ownershipError = rows.find((row) => this.violatesOwnership(row))
    if (ownershipError) {
      return { data: null as T, error: { message: "new row violates row-level security policy" } }
    }

    this.db[this.table].push(...rows)
    return this.shape(rows)
  }

  private runUpsert(): Result<T> {
    const rows = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}]
    const stored: Row[] = []

    for (const row of rows) {
      const key = this.conflictColumn ?? "id"
      const existing = this.db[this.table].find(
        (candidate) => candidate[key] === row[key] && candidate.user_id === this.userId,
      )

      if (existing) {
        Object.assign(existing, row, { updated_at: new Date().toISOString() })
        stored.push(existing)
      } else {
        const created = this.withDefaults({ ...row })
        this.db[this.table].push(created)
        stored.push(created)
      }
    }

    return this.shape(stored)
  }

  private runUpdate(): Result<T> {
    const rows = this.visibleRows()
    for (const row of rows) {
      Object.assign(row, this.payload as Row)
      if ("updated_at" in row) row.updated_at = new Date().toISOString()
    }
    return this.shape(rows)
  }

  private runDelete(): Result<T> {
    const rows = this.visibleRows()
    const doomed = new Set(rows)
    this.db[this.table] = this.db[this.table].filter((row) => !doomed.has(row))

    // Kaskády podle cizích klíčů v migracích.
    if (this.table === "invoices") {
      const ids = new Set(rows.map((row) => row.id))
      this.db.invoice_items = this.db.invoice_items.filter((item) => !ids.has(item.invoice_id))
    }
    if (this.table === "activities") {
      const ids = new Set(rows.map((row) => row.id))
      this.db.activity_services = this.db.activity_services.filter(
        (service) => !ids.has(service.activity_id),
      )
    }
    if (this.table === "customers") {
      const ids = new Set(rows.map((row) => row.id))
      this.db.invoices = this.db.invoices.filter((invoice) => !ids.has(invoice.customer_id))
      this.db.activities = this.db.activities.filter((activity) => !ids.has(activity.customer_id))
    }

    return this.shape(rows)
  }

  private violatesOwnership(row: Row): boolean {
    if (USER_OWNED.includes(this.table)) return row.user_id !== this.userId

    const parent = PARENT_OWNED[this.table]
    if (!parent) return false

    return !this.db[parent.table].some(
      (parentRow) => parentRow.id === row[parent.foreignKey] && parentRow.user_id === this.userId,
    )
  }

  private withDefaults(row: Row): Row {
    const now = new Date().toISOString()
    if (!row.id) row.id = crypto.randomUUID()
    if (!row.created_at) row.created_at = now

    if (this.table === "invoices") {
      if (!row.public_id) row.public_id = crypto.randomUUID()
      if (!row.updated_at) row.updated_at = now
      if (!row.invoice_number) row.invoice_number = this.nextInvoiceNumber(String(row.user_id))
    }

    if (this.table === "activities" && !row.updated_at) row.updated_at = now
    if (this.table === "company_details" && !row.updated_at) row.updated_at = now

    return row
  }

  /** Odpovídá triggeru set_invoice_number z migrace 013. */
  private nextInvoiceNumber(userId: string): string {
    const year = String(new Date().getFullYear())
    const used = this.db.invoices
      .filter((row) => row.user_id === userId)
      .map((row) => String(row.invoice_number ?? ""))
      .map((number) => new RegExp(`^${year}-(\\d+)$`).exec(number)?.[1])
      .filter((value): value is string => Boolean(value))
      .map(Number)

    const next = (used.length > 0 ? Math.max(...used) : 0) + 1
    return `${year}-${String(next).padStart(3, "0")}`
  }

  private shape(rows: Row[]): Result<T> {
    const enriched = this.embedCustomer
      ? rows.map((row) => ({
          ...row,
          customer: this.db.customers.find((customer) => customer.id === row.customer_id) ?? null,
        }))
      : rows

    if (this.rowMode === "many") return { data: enriched as T, error: null }

    if (enriched.length === 0) {
      return this.rowMode === "maybe"
        ? { data: null as T, error: null }
        : { data: null as T, error: { message: "no rows returned", code: "PGRST116" } }
    }

    return { data: enriched[0] as T, error: null }
  }
}

export interface FakeClientOptions {
  /** Simulace vypršelé session — `auth.getUser()` pak vrátí null. */
  signedOut?: boolean
}

/**
 * Vytvoří klienta vázaného na konkrétního uživatele. Dva klienti nad stejnou
 * databází se chovají jako dva různí přihlášení uživatelé.
 *
 * Tabulky `oauth_*` nejsou v seznamu vlastněných, takže se chovají jako pod
 * service-role klientem — přesně jako v produkci, kde k nim chodí jen
 * OAuth endpointy.
 */
export function createFakeSupabaseClient(
  db: FakeDatabase,
  userId: string,
  options: FakeClientOptions = {},
): SupabaseClient {
  const client = {
    from(table: TableName) {
      return {
        select: (columns?: string) =>
          new FakeQuery(db, table, userId, "select").select(columns ?? "*"),
        insert: (rows: Row[] | Row) => new FakeQuery(db, table, userId, "insert", rows),
        upsert: (rows: Row[] | Row, options?: { onConflict?: string }) =>
          new FakeQuery(db, table, userId, "upsert", rows, options?.onConflict),
        update: (patch: Row) => new FakeQuery(db, table, userId, "update", patch),
        delete: () => new FakeQuery(db, table, userId, "delete"),
      }
    },
    rpc(fn: string, args: Record<string, unknown>) {
      return Promise.resolve(runRpc(db, userId, fn, args))
    },
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: options.signedOut ? null : { id: userId, email: `${userId}@test.local` } },
          error: null,
        }),
    },
  }

  return client as unknown as SupabaseClient
}

/** Implementace databázových funkcí `mcp_*` z migrace 014. */
function runRpc(
  db: FakeDatabase,
  userId: string,
  fn: string,
  args: Record<string, unknown>,
): Result<unknown> {
  const now = Date.now()

  switch (fn) {
    case "mcp_consume_rate_limit": {
      const windowSeconds = Number(args.p_window_seconds)
      const windowStart = Math.floor(now / 1000 / windowSeconds) * windowSeconds
      const key = `${args.p_bucket}:${windowStart}`
      const existing = db.mcp_rate_limit.find(
        (row) => row.user_id === userId && row.key === key,
      )

      if (existing) {
        existing.count = Number(existing.count) + 1
        return { data: Number(existing.count) <= Number(args.p_limit), error: null }
      }

      db.mcp_rate_limit.push({ user_id: userId, key, count: 1 })
      return { data: 1 <= Number(args.p_limit), error: null }
    }

    case "mcp_create_confirmation": {
      const id = crypto.randomUUID()
      db.mcp_confirmations.push({
        id,
        user_id: userId,
        tool_name: args.p_tool,
        params_hash: args.p_params_hash,
        summary: args.p_summary,
        expires_at: new Date(now + Number(args.p_ttl_seconds) * 1000).toISOString(),
        consumed_at: null,
      })
      return { data: id, error: null }
    }

    case "mcp_consume_confirmation": {
      const row = db.mcp_confirmations.find(
        (candidate) => candidate.id === args.p_id && candidate.user_id === userId,
      )
      if (!row) return { data: "not_found", error: null }
      if (row.tool_name !== args.p_tool || row.params_hash !== args.p_params_hash) {
        return { data: "mismatch", error: null }
      }
      if (row.consumed_at) return { data: "already_used", error: null }
      if (new Date(String(row.expires_at)).getTime() <= now) return { data: "expired", error: null }

      row.consumed_at = new Date().toISOString()
      return { data: "ok", error: null }
    }

    case "mcp_begin_idempotent": {
      const existing = db.mcp_idempotency.find(
        (row) =>
          row.user_id === userId &&
          row.tool_name === args.p_tool &&
          row.idempotency_key === args.p_key,
      )

      if (!existing) {
        db.mcp_idempotency.push({
          user_id: userId,
          tool_name: args.p_tool,
          idempotency_key: args.p_key,
          request_hash: args.p_request_hash,
          result: null,
        })
        return { data: { state: "fresh" }, error: null }
      }

      if (existing.request_hash !== args.p_request_hash) {
        return { data: { state: "conflict" }, error: null }
      }
      if (existing.result === null) return { data: { state: "in_progress" }, error: null }
      return { data: { state: "replay", result: existing.result }, error: null }
    }

    case "mcp_complete_idempotent": {
      const row = db.mcp_idempotency.find(
        (candidate) =>
          candidate.user_id === userId &&
          candidate.tool_name === args.p_tool &&
          candidate.idempotency_key === args.p_key,
      )
      if (row) row.result = args.p_result
      return { data: null, error: null }
    }

    case "mcp_release_idempotent": {
      db.mcp_idempotency = db.mcp_idempotency.filter(
        (row) =>
          !(
            row.user_id === userId &&
            row.tool_name === args.p_tool &&
            row.idempotency_key === args.p_key &&
            row.result === null
          ),
      )
      return { data: null, error: null }
    }

    case "mcp_create_personal_token": {
      const active = db.mcp_personal_tokens.filter(
        (row) =>
          row.user_id === userId &&
          !row.revoked_at &&
          new Date(String(row.expires_at)).getTime() > now,
      )

      if (active.length >= 10) {
        return { data: null, error: { message: "Dosáhli jste maxima 10 platných tokenů", code: "54000" } }
      }

      const created = {
        id: crypto.randomUUID(),
        user_id: userId,
        name: args.p_name,
        token_hash: args.p_token_hash,
        token_hint: args.p_token_hint,
        scope: args.p_scope,
        expires_at: new Date(now + Number(args.p_ttl_days) * 86_400_000).toISOString(),
        last_used_at: null,
        revoked_at: null,
        created_at: new Date().toISOString(),
      }
      db.mcp_personal_tokens.push(created)

      // Funkce vrací TABLE bez otisku tokenu.
      const { token_hash: _hash, user_id: _user, ...row } = created
      return { data: [row], error: null }
    }

    case "mcp_list_personal_tokens": {
      const rows = db.mcp_personal_tokens
        .filter((row) => row.user_id === userId)
        .map(({ token_hash: _hash, user_id: _user, ...row }) => row)
      return { data: rows, error: null }
    }

    case "mcp_revoke_personal_token": {
      const row = db.mcp_personal_tokens.find(
        (candidate) =>
          candidate.id === args.p_id && candidate.user_id === userId && !candidate.revoked_at,
      )
      if (!row) return { data: false, error: null }

      row.revoked_at = new Date().toISOString()
      return { data: true, error: null }
    }

    case "mcp_write_audit": {
      db.mcp_audit_log.push({
        occurred_at: new Date().toISOString(),
        user_id: userId,
        client_id: args.p_client_id,
        tool_name: args.p_tool,
        outcome: args.p_outcome,
        error_code: args.p_error_code,
        resource_type: args.p_resource_type,
        resource_id: args.p_resource_id,
        idempotency_key: args.p_idempotency_key,
        confirmation_id: args.p_confirmation_id,
        duration_ms: args.p_duration_ms,
      })
      return { data: null, error: null }
    }

    default:
      return { data: null, error: { message: `neznámá funkce ${fn}` } }
  }
}
