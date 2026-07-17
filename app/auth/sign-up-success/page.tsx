import { Mail } from "lucide-react"
import Link from "next/link"

export default function SignUpSuccessPage() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm text-center">
        <p className="font-serif text-2xl text-primary mb-3">Terky</p>
        <p className="text-[10px] uppercase tracking-[0.32em] text-muted-foreground mb-12">
          fakturační udělátko
        </p>

        <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-secondary mb-8">
          <Mail className="h-5 w-5 text-primary" />
        </div>

        <h1 className="font-serif text-4xl sm:text-5xl text-foreground tracking-tight leading-[1.05] mb-4">
          Zkontroluj svůj <span className="text-primary">e-mail.</span>
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed mb-10 max-w-xs mx-auto">
          Poslala jsem ti potvrzovací odkaz. Klikni na něj a registrace bude hotová.
        </p>

        <Link
          href="/auth/login"
          className="inline-flex text-[11px] uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground transition-colors"
        >
          Zpět na přihlášení
        </Link>
      </div>
    </div>
  )
}
