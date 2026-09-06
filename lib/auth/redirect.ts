/**
 * Základ URL, na kterou se má uživatel vrátit z e-mailu od Supabase Auth
 * (potvrzení registrace, obnova hesla).
 *
 * Zdrojem pravdy je `NEXT_PUBLIC_SITE_URL` — stejná proměnná, ze které se
 * skládají odkazy na veřejné stažení faktury i OAuth `issuer`. Jeden origin
 * pro celou aplikaci znamená, že stačí povolit jednu doménu v Supabase
 * (Authentication → URL Configuration) a nic se nerozejde.
 *
 * Dřív se tu četla proměnná `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL`. Ta byla
 * zbytek po v0 scaffoldu a v produkci ukazovala na `https://v0.app/...`.
 * Supabase takový redirect nemá v allow-listu, takže ho zahodil a odkaz v
 * e-mailu spadl zpátky na Site URL — což byl localhost. Proto je pryč.
 */
export function authRedirectBase(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL
  if (configured) return configured.replace(/\/$/, "")

  // Poslední záchrana pro prostředí, kde se proměnná nedostala do buildu.
  // V prohlížeči je to pořád lepší než prázdný redirect; na serveru nic není.
  if (typeof window !== "undefined") return window.location.origin

  return ""
}

/** Absolutní URL uvnitř aplikace pro `redirectTo` / `emailRedirectTo`. */
export function authRedirectUrl(path = ""): string {
  if (!path) return authRedirectBase()
  return `${authRedirectBase()}${path.startsWith("/") ? path : `/${path}`}`
}
