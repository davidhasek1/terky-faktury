"use client"

import type React from "react"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

/**
 * Kam po přihlášení. Middleware sem posílá `redirect_to`, aby se uživatel
 * vrátil na původní stránku — potřebuje to zejména `/api/oauth/authorize`,
 * kde by ztráta parametrů rozbila připojení konektoru.
 *
 * Přijímáme jen cestu ve vlastní aplikaci; `//cizi.web` ani absolutní URL by
 * z přihlašovací stránky udělaly otevřený redirector. Čte se až při odeslání
 * formuláře, aby stránka nepotřebovala `useSearchParams` a zůstala staticky
 * předgenerovaná.
 */
function safeRedirectTarget(): string {
  if (typeof window === "undefined") return "/"
  const target = new URLSearchParams(window.location.search).get("redirect_to")
  if (!target || !target.startsWith("/") || target.startsWith("//")) return "/"
  return target
}

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) throw error
      router.push(safeRedirectTarget())
      router.refresh()
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Došlo k chybě")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-12">
          <p className="font-serif text-2xl text-primary mb-3">Terky</p>
          <p className="text-[10px] uppercase tracking-[0.32em] text-muted-foreground mb-8">
            fakturační udělátko
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl text-foreground tracking-tight leading-[1.05]">
            Vítej <span className="text-primary">zpátky.</span>
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Zadej e-mail a heslo pro přihlášení.
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <Field
            id="email"
            label="Email"
            type="email"
            required
            value={email}
            onChange={setEmail}
            placeholder="vas@email.cz"
          />
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label
                htmlFor="password"
                className="text-[10px] uppercase tracking-[0.22em] font-medium text-muted-foreground"
              >
                Heslo
              </Label>
              <Link
                href="/auth/forgot-password"
                className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-primary transition-colors"
              >
                Zapomněla jsi?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <p className="font-serif text-sm text-primary">{error}</p>
          )}

          <Button
            type="submit"
            className="w-full text-[11px] uppercase tracking-[0.22em] shadow-none"
            disabled={isLoading}
          >
            {isLoading ? "Přihlašuji…" : "Přihlásit se"}
          </Button>

          <p className="text-center text-sm text-muted-foreground pt-2">
            Nemáš účet?{" "}
            <Link
              href="/auth/sign-up"
              className="font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              Zaregistruj se
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}

function Field({
  id,
  label,
  required,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  id: string
  label: string
  required?: boolean
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <div className="space-y-2">
      <Label
        htmlFor={id}
        className="text-[10px] uppercase tracking-[0.22em] font-medium text-muted-foreground"
      >
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        required={required}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
