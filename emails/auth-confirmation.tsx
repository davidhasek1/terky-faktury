import { Button, Heading, Link, Text } from "@react-email/components"
import * as React from "react"
import { BrandShell } from "./_layout"

// Potvrzení e-mailu po registraci. HTML se exportuje do Supabase
// (Authentication -> Email Templates -> Confirm signup).
export interface AuthConfirmationEmailProps {
  confirmationUrl: string
}

export default function AuthConfirmationEmail({
  // Výchozí hodnota = Supabase proměnná, aby ji `email export` vypsal do HTML.
  confirmationUrl = "{{ .ConfirmationURL }}",
}: AuthConfirmationEmailProps) {
  return (
    <BrandShell lang="cs" preview="Potvrďte svůj e-mail">
      <Text className="m-0 mb-[10px] text-[11px] font-bold uppercase tracking-[2px] text-violet">
        <span className="text-orange">&#9679;</span>&nbsp; Registrace
      </Text>
      <Heading
        as="h1"
        className="m-0 mb-[20px] text-[28px] font-bold leading-[1.2] text-ink"
      >
        Potvrďte svůj e-mail
      </Heading>
      <Text className="m-0 mb-[8px] text-[16px] leading-[1.6] text-soft">
        Dobrý den,
      </Text>
      <Text className="m-0 mb-[28px] text-[16px] leading-[1.6] text-soft">
        děkujeme za registraci. Kliknutím na tlačítko potvrďte svou e-mailovou
        adresu a aktivujte účet.
      </Text>
      <Button
        href={confirmationUrl}
        className="box-border rounded-full bg-violet px-[30px] py-[14px] text-[15px] font-semibold text-white no-underline"
      >
        Potvrdit e-mail
      </Button>
      <Text className="m-0 mt-[28px] text-[13px] leading-[1.6] text-muted">
        Pokud jste se neregistrovali, tento e-mail ignorujte. Pokud tlačítko
        nefunguje, zkopírujte odkaz do prohlížeče:
        <br />
        <Link href={confirmationUrl} className="break-all text-violet">
          {confirmationUrl}
        </Link>
      </Text>
    </BrandShell>
  )
}

AuthConfirmationEmail.PreviewProps = {
  confirmationUrl: "{{ .ConfirmationURL }}",
} satisfies AuthConfirmationEmailProps

export { AuthConfirmationEmail }
