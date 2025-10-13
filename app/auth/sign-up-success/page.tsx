import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle } from "lucide-react"
import Link from "next/link"

export default function SignUpSuccessPage() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <div className="flex justify-center mb-4">
              <CheckCircle className="h-12 w-12 text-green-500" />
            </div>
            <CardTitle className="text-2xl text-center">Zkontrolujte svůj email</CardTitle>
            <CardDescription className="text-center">
              Poslali jsme vám potvrzovací email. Klikněte na odkaz v emailu pro dokončení registrace.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center text-sm">
              <Link href="/auth/login" className="underline underline-offset-4">
                Zpět na přihlášení
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
