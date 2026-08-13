"use client"

import { useEffect, useState } from "react"
import { KeyRound, Loader2, Plus, ShieldAlert, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CopyField } from "@/components/mcp/copy-field"
import type { CreatedPersonalToken, PersonalTokenSummary } from "@/lib/mcp/personal-tokens"
import { cn, formatDate, formatDateTime } from "@/lib/utils"
import { toast } from "sonner"

/**
 * Správa osobních MCP tokenů.
 *
 * Token se z API vrací jen jednou — po zavření panelu ho už nikdo nezjistí,
 * v databázi je pouze jeho otisk. Komponenta na to uživatele upozorní
 * a nabídne mu ho zkopírovat.
 */

const SCOPE_OPTIONS = [
  { value: "invoices:read", label: "Jen čtení" },
  { value: "invoices:read invoices:write", label: "Čtení a zápis" },
] as const

const TTL_OPTIONS = [
  { value: "30", label: "30 dní" },
  { value: "90", label: "90 dní" },
  { value: "365", label: "1 rok" },
] as const

export function McpTokenManager({ mcpUrl }: { mcpUrl: string }) {
  const [tokens, setTokens] = useState<PersonalTokenSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [name, setName] = useState("")
  const [scope, setScope] = useState<string>(SCOPE_OPTIONS[0].value)
  const [ttlDays, setTtlDays] = useState<string>("90")
  const [freshToken, setFreshToken] = useState<CreatedPersonalToken | null>(null)
  const [tokenToRevoke, setTokenToRevoke] = useState<PersonalTokenSummary | null>(null)
  const [isRevoking, setIsRevoking] = useState(false)

  const loadTokens = async () => {
    try {
      const response = await fetch("/api/mcp/tokens")
      if (!response.ok) throw new Error("Nepodařilo se načíst tokeny")

      const result = (await response.json()) as { tokens: PersonalTokenSummary[] }
      setTokens(result.tokens)
    } catch (error) {
      console.error("[mcp-tokens] Nepodařilo se načíst tokeny:", error)
      toast.error("Nepodařilo se načíst seznam tokenů")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadTokens()
  }, [])

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsCreating(true)

    try {
      const response = await fetch("/api/mcp/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, scope, ttl_days: Number(ttlDays) }),
      })

      const result = (await response.json()) as { token?: CreatedPersonalToken; error?: string }
      if (!response.ok) throw new Error(result.error ?? "Nepodařilo se vytvořit token")

      setFreshToken(result.token ?? null)
      setName("")
      await loadTokens()
      toast.success("Token byl vytvořen")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nepodařilo se vytvořit token")
    } finally {
      setIsCreating(false)
    }
  }

  const handleRevoke = async () => {
    if (!tokenToRevoke) return
    setIsRevoking(true)

    try {
      const response = await fetch(`/api/mcp/tokens/${tokenToRevoke.id}`, { method: "DELETE" })
      if (!response.ok) {
        const result = (await response.json()) as { error?: string }
        throw new Error(result.error ?? "Nepodařilo se odvolat token")
      }

      if (freshToken?.id === tokenToRevoke.id) setFreshToken(null)
      setTokenToRevoke(null)
      await loadTokens()
      toast.success("Token byl odvolán")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nepodařilo se odvolat token")
    } finally {
      setIsRevoking(false)
    }
  }

  return (
    <div className="space-y-8">
      {freshToken && (
        <div className="rounded-2xl border border-primary/40 bg-primary/5 px-5 py-6 sm:px-7">
          <div className="flex items-start gap-3 mb-5">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="font-serif text-lg text-foreground">
                Zkopíruj si token teď — už se znovu nezobrazí
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                V databázi je uložený jen jeho otisk. Když ho ztratíš, vygeneruj nový a tenhle
                odvolej.
              </p>
            </div>
          </div>

          <CopyField value={freshToken.token} label={`Token „${freshToken.name}"`} />

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setFreshToken(null)}
            className="mt-4 text-xs text-muted-foreground hover:text-foreground"
          >
            Mám ho uložený, skrýt
          </Button>
        </div>
      )}

      <form
        onSubmit={handleCreate}
        className="rounded-2xl border border-border/70 bg-card px-5 py-6 sm:px-7"
      >
        <p className="text-xs text-muted-foreground mb-5">
          Nový token
        </p>

        <div className="grid gap-4 sm:grid-cols-[1fr_180px_140px] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="token-name" className={fieldLabel}>
              Název <span className="text-primary">*</span>
            </Label>
            <Input
              id="token-name"
              required
              maxLength={60}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Např. Claude na notebooku"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="token-scope" className={fieldLabel}>
              Oprávnění
            </Label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger id="token-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCOPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="token-ttl" className={fieldLabel}>
              Platnost
            </Label>
            <Select value={ttlDays} onValueChange={setTtlDays}>
              <SelectTrigger id="token-ttl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TTL_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <p className="mt-4 text-xs text-muted-foreground italic">
          Token s oprávněním „Čtení a zápis" umí vystavit i smazat fakturu a odeslat ji zákazníkovi.
          Pokud klient jen čte přehledy, nech „Jen čtení".
        </p>

        <div className="mt-6 flex justify-end">
          <Button
            type="submit"
            disabled={isCreating || name.trim() === ""}
            className="text-sm shadow-none"
          >
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                Generuji…
              </>
            ) : (
              <>
                <Plus className="mr-2 h-3.5 w-3.5" />
                Vygenerovat token
              </>
            )}
          </Button>
        </div>
      </form>

      <div>
        <p className="text-xs text-muted-foreground mb-4">
          Vydané tokeny
        </p>

        {isLoading ? (
          <div className="border border-border bg-card px-6 py-12 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : tokens.length === 0 ? (
          <div className="border border-border bg-card px-6 py-14 text-center">
            <KeyRound className="mx-auto h-8 w-8 text-muted-foreground/50 mb-4" />
            <p className="font-serif text-xl text-muted-foreground">
              Zatím žádný token. Pro ChatGPT ho ani nepotřebuješ.
            </p>
          </div>
        ) : (
          <div className="border border-border bg-card overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <Th>Název</Th>
                  <Th>Token</Th>
                  <Th>Oprávnění</Th>
                  <Th>Platí do</Th>
                  <Th>Naposledy použit</Th>
                  <Th>Stav</Th>
                  <Th align="right">Akce</Th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((token, index) => {
                  const state = tokenState(token)
                  return (
                    <tr
                      key={token.id}
                      className={index !== tokens.length - 1 ? "border-b border-border/60" : ""}
                    >
                      <Td>{token.name}</Td>
                      <Td className="font-mono text-xs text-muted-foreground">
                        tfm_…{token.token_hint}
                      </Td>
                      <Td className="text-muted-foreground text-xs">
                        {token.scope.includes("invoices:write") ? "Čtení a zápis" : "Jen čtení"}
                      </Td>
                      <Td className="text-muted-foreground">{formatDate(token.expires_at)}</Td>
                      <Td className="text-muted-foreground text-xs">
                        {token.last_used_at ? formatDateTime(token.last_used_at) : <Dash />}
                      </Td>
                      <Td>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 text-xs font-medium",
                            state.tone,
                          )}
                        >
                          <span
                            className={cn("h-1.5 w-1.5 rounded-full", state.dot)}
                            aria-hidden="true"
                          />
                          {state.label}
                        </span>
                      </Td>
                      <Td align="right">
                        {state.active && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setTokenToRevoke(token)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Odvolat token {token.name}</span>
                          </Button>
                        )}
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border/70 bg-card px-5 py-6 sm:px-7 space-y-5">
        <p className="text-xs text-muted-foreground">
          Jak token použít
        </p>

        <div className="space-y-2">
          <p className="text-sm text-foreground">
            <strong>Claude Desktop</strong> — přidej do <code className="text-xs">claude_desktop_config.json</code>:
          </p>
          <CopyField multiline value={claudeConfig(mcpUrl)} />
        </div>

        <div className="space-y-2">
          <p className="text-sm text-foreground">
            <strong>MCP Inspector</strong> — spusť a vlož URL i token do formuláře:
          </p>
          <CopyField value="npx @modelcontextprotocol/inspector" />
        </div>

        <div className="space-y-2">
          <p className="text-sm text-foreground">
            <strong>Ověření z terminálu</strong> — vypíše seznam nástrojů:
          </p>
          <CopyField multiline value={curlSnippet(mcpUrl)} />
        </div>
      </div>

      <AlertDialog
        open={tokenToRevoke !== null}
        onOpenChange={(open) => !open && setTokenToRevoke(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-2xl font-normal">
              Odvolat token „{tokenToRevoke?.name}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Přestane platit okamžitě. Klient, který ho používá, se hned odpojí a bude potřebovat
              nový token. Tuhle akci nelze vzít zpět.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRevoking}>Zrušit</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevoke}
              disabled={isRevoking}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isRevoking ? "Odvolávám…" : "Odvolat token"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

const fieldLabel =
  "text-sm font-semibold text-muted-foreground"

function tokenState(token: PersonalTokenSummary) {
  if (token.revoked_at) {
    return {
      label: "Odvolaný",
      tone: "text-muted-foreground",
      dot: "bg-muted-foreground/60",
      active: false,
    }
  }

  if (new Date(token.expires_at).getTime() <= Date.now()) {
    return { label: "Vypršel", tone: "text-primary", dot: "bg-primary", active: false }
  }

  return { label: "Platný", tone: "text-status-settled-fg", dot: "bg-status-settled-line", active: true }
}

function claudeConfig(mcpUrl: string): string {
  return `{
  "mcpServers": {
    "terky-faktury": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote", "${mcpUrl}",
        "--header", "Authorization: Bearer TVUJ_TOKEN"
      ]
    }
  }
}`
}

function curlSnippet(mcpUrl: string): string {
  return `curl -s -X POST ${mcpUrl} \\
  -H "Authorization: Bearer TVUJ_TOKEN" \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th
      className={cn(
        "text-xs font-medium text-muted-foreground py-4 px-5",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  align,
  className,
}: {
  children: React.ReactNode
  align?: "right"
  className?: string
}) {
  return (
    <td
      className={cn(
        "py-4 px-5 text-sm text-foreground",
        align === "right" && "text-right",
        className,
      )}
    >
      {children}
    </td>
  )
}

function Dash() {
  return <span className="text-muted-foreground/50">—</span>
}
