import { Button, Heading, Link, Text } from "@react-email/components"
import * as React from "react"
import { BrandShell } from "./_layout"

// Obnova hesla. HTML se exportuje do Supabase
// (Authentication -> Email Templates -> Reset password).
export interface AuthResetPasswordEmailProps {
  confirmationUrl: string
}

export default function AuthResetPasswordEmail({
  // Výchozí hodnota = Supabase proměnná, aby ji `email export` vypsal do HTML.
  confirmationUrl = "{{ .ConfirmationURL }}",
}: AuthResetPasswordEmailProps) {
  return (
    <BrandShell lang="cs" preview="Obnovení hesla">
      <Text className="m-0 mb-[10px] text-[11px] font-bold uppercase tracking-[2px] text-violet">
        <span className="text-orange">&#9679;</span>&nbsp; Obnova hesla
      </Text>
      <Heading
        as="h1"
        className="m-0 mb-[20px] text-[28px] font-bold leading-[1.2] text-ink"
      >
        Obnovení hesla
      </Heading>
      <Text className="m-0 mb-[8px] text-[16px] leading-[1.6] text-soft">
        Dobrý den,
      </Text>
      <Text className="m-0 mb-[28px] text-[16px] leading-[1.6] text-soft">
        obdrželi jsme žádost o obnovení hesla k vašemu účtu. Nové heslo si
        nastavíte kliknutím na tlačítko níže.
      </Text>
      <Button
        href={confirmationUrl}
        className="box-border rounded-full bg-violet px-[30px] py-[14px] text-[15px] font-semibold text-white no-underline"
      >
        Nastavit nové heslo
      </Button>
      <Text className="m-0 mt-[28px] text-[13px] leading-[1.6] text-muted">
        Pokud jste o obnovu hesla nežádali, tento e-mail ignorujte. Pokud
        tlačítko nefunguje, zkopírujte odkaz do prohlížeče:
        <br />
        <Link href={confirmationUrl} className="break-all text-violet">
          {confirmationUrl}
        </Link>
      </Text>
    </BrandShell>
  )
}

AuthResetPasswordEmail.PreviewProps = {
  confirmationUrl: "{{ .ConfirmationURL }}",
} satisfies AuthResetPasswordEmailProps

export { AuthResetPasswordEmail }
