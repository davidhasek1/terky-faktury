"use client"

import type React from "react"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    if (password !== confirmPassword) {
      setError("Hesla se neshodují")
      setIsLoading(false)
      return
    }

    if (password.length < 6) {
      setError("Heslo musí mít alespoň 6 znaků")
      setIsLoading(false)
      return
    }

    const supabase = createClient()

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      })
      if (error) throw error
      setSuccess(true)
      setTimeout(() => {
        router.push("/auth/login")
      }, 2000)
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
            Nové <span className="text-primary">heslo.</span>
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Zadej nové heslo, ať se zase dostaneme dovnitř.
          </p>
        </div>

        {success ? (
          <div className="space-y-4 text-center">
            <p className="font-serif text-lg text-foreground">
              Heslo bylo úspěšně změněno.
            </p>
            <p className="text-sm text-muted-foreground">
              Přesměruji tě na přihlášení…
            </p>
          </div>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-6">
            <Field
              id="password"
              label="Nové heslo"
              type="password"
              required
              value={password}
              onChange={setPassword}
            />
            <Field
              id="confirmPassword"
              label="Potvrď heslo"
              type="password"
              required
              value={confirmPassword}
              onChange={setConfirmPassword}
            />

            {error && (
              <p className="font-serif text-sm text-primary">{error}</p>
            )}

            <Button
              type="submit"
              className="w-full text-[11px] uppercase tracking-[0.22em] shadow-none"
              disabled={isLoading}
            >
              {isLoading ? "Ukládám…" : "Změnit heslo"}
            </Button>

            <p className="text-center text-sm text-muted-foreground pt-2">
              <Link
                href="/auth/login"
                className="font-semibold text-primary hover:text-primary/80 transition-colors"
              >
                Zpět na přihlášení
              </Link>
            </p>
          </form>
        )}
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
}: {
  id: string
  label: string
  required?: boolean
  value: string
  onChange: (v: string) => void
  type?: string
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
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
