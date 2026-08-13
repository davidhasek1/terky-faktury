/**
 * Proměnné prostředí pro testy. Nejde o skutečná tajemství — OAuth vrstva jen
 * potřebuje nějaké tajemství a origin, aby šlo podepisovat a ověřovat tokeny.
 * Testy tak procházejí opravdovou cestou ověření, ne mockem.
 */
process.env.NEXT_PUBLIC_SITE_URL = "https://faktury.test"
process.env.MCP_TOKEN_SECRET = "test-secret-nejmene-32-znaku-dlouhe-000"
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.test"
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key"
