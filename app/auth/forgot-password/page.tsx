"use client"

import type React from "react"
import { Mail } from 'lucide-react'

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/patterns/form-field"
import Link from "next/link"
import { useState } from "react"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || window.location.origin}/auth/reset-password`,
      })
      if (error) throw error
      setSuccess(true)
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
          <p className="text-xs text-muted-foreground mb-8">
            fakturační udělátko
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl text-foreground tracking-tight leading-[1.05]">
            Zapomenuté <span className="text-primary">heslo.</span>
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Pošlu ti odkaz pro obnovení hesla.
          </p>
        </div>

        {success ? (
          <div className="space-y-6 text-center">
            <p className="font-serif text-lg text-foreground leading-relaxed">
              E-mail s odkazem byl odeslán na <br />
              <span className="text-primary">{email}</span>.
            </p>
            <p className="text-sm text-muted-foreground">
              Zkontroluj svou schránku.
            </p>
            <Button
              asChild
              className="w-full text-sm shadow-none"
            >
              <Link href="/auth/login">Zpět na přihlášení</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-6">
            <FormField
              id="email"
              label="Email"
              required
              hint="Pošleme na něj odkaz pro nastavení nového hesla."
            >
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </FormField>

            {error && (
              <p className="font-serif text-sm text-primary">{error}</p>
            )}

            <Button
              type="submit"
              className="w-full text-sm shadow-none"
              loading={isLoading}
            >
              <Mail />
              Odeslat odkaz
            </Button>

            <p className="text-center text-sm text-muted-foreground pt-2">
              Vzpomněla sis?{" "}
              <Link
                href="/auth/login"
                className="font-semibold text-primary hover:text-primary/80 transition-colors"
              >
                Přihlas se
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
