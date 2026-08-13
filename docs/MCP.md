# MCP integrace — ovládání aplikace z ChatGPT

Aplikace vystavuje **MCP server** (Model Context Protocol) na adrese `/mcp`.
Po připojení konektoru umíš v ChatGPT přirozeným jazykem hledat zákazníky,
prohlížet faktury, vystavovat je, odesílat e-mailem a vést deník služeb.

Příkaz „Vytvoř fakturu klientovi ABC na 100 €" model rozloží na několik kroků:
najde zákazníka, spočítá fakturu, ukáže ti souhrn, počká na tvé potvrzení
a teprve pak fakturu vystaví.

---

> **Proč je to postavené takhle:** rozhodnutí jsou zaznamenaná v `docs/adr/`.
> **Co má integrace umět a proč:** `docs/prd/mcp-integration.md`.
> **Pravidlo:** nová funkcionalita v aplikaci se přidává i do MCP ve stejné
> změně — viz `CLAUDE.md`.

## Obsah

- [Architektura](#architektura)
- [Autentizace](#autentizace)
- [Připojení k ChatGPT](#připojení-k-chatgpt)
- [Osobní tokeny](#osobní-tokeny)
- [Dostupné nástroje](#dostupné-nástroje)
- [Příklady příkazů](#příklady-příkazů)
- [Potvrzování zápisů](#potvrzování-zápisů)
- [Bezpečnostní omezení](#bezpečnostní-omezení)
- [Proměnné prostředí](#proměnné-prostředí)
- [Lokální spuštění](#lokální-spuštění)
- [Testy](#testy)
- [Jak přidat další nástroj](#jak-přidat-další-nástroj)
- [Nasazení](#nasazení)

---

## Architektura

MCP je **integrační vrstva nad servisní vrstvou**, ne druhá implementace
aplikace. Nástroje neobsahují žádná business pravidla — jen mapují vstup
na volání služeb a výsledek na strukturovanou odpověď.

```
ChatGPT
   │  Streamable HTTP + Bearer token
   ▼
app/mcp/route.ts ──► lib/mcp/handler.ts
                        │ 1. ověření access tokenu (lib/mcp/auth.ts)
                        │ 2. Supabase klient jménem uživatele
                        ▼
                     lib/mcp/server.ts  (registrace nástrojů)
                        │ 3. lib/mcp/define-tool.ts — scope, rate limit, audit
                        ▼
                     lib/mcp/tools/*    (mapování + formátování)
                        │ 4. zod validace, potvrzení, idempotence
                        ▼
                     lib/services/*     ◄── stejné funkce volá i webové UI
                        ▼
                     Supabase (RLS)
```

| Vrstva | Kde | Za co odpovídá |
| --- | --- | --- |
| Transport | `app/mcp/route.ts`, `lib/mcp/handler.ts` | Streamable HTTP, limit velikosti těla, CORS |
| Autentizace | `lib/mcp/auth.ts`, `lib/oauth/*`, `lib/mcp/personal-tokens.ts` | Bearer token (OAuth i osobní), OAuth 2.1 server |
| Obal nástroje | `lib/mcp/define-tool.ts` | oprávnění, rate limit, převod chyb, audit |
| Nástroje | `lib/mcp/tools/*` | vstupní schémata, souhrny, potvrzení, idempotence |
| Business logika | `lib/services/*` | výpočty, pořadí zápisů, doménová pravidla |
| Autorizace | Supabase RLS | `auth.uid() = user_id` |

**Servisní vrstvu sdílí UI i MCP.** Když se změní výpočet faktury, změní se
na obou místech naráz, protože je jen jeden: `lib/services/invoice-totals.ts`.

### Jak MCP vystupuje vůči databázi

MCP nemá cookie session, ale autorizaci nechceme přesouvat do aplikačního kódu.
`lib/supabase/user-scoped.ts` si proto od Supabase vyžádá **skutečný access
token** daného uživatele: přes Auth Admin API vyrobí `generateLink` jednorázový
`hashed_token` (e-mail se neodesílá, endpoint jen generuje) a `verifyOtp` ho
vymění za session. Token se drží v paměti procesu do konce své platnosti,
takže na jedno volání auth API připadá zhruba hodina provozu.

Databáze díky tomu vidí přesně stejnou identitu jako při práci v prohlížeči
a **platí úplně stejná RLS pravidla**.

Vlastní podepisování tokenu tu záměrně není: projekt běží na asymetrických
podpisových klíčích a jejich privátní půlku Supabase ven nevydává. Legacy HS256
secret by fungoval, ale je ve stavu „previously used" a Supabase sám doporučuje
ho revokovat — integrace by jednou tiše odešla.

Service-role klíč slouží jen tam, kde žádný přihlášený uživatel neexistuje:
úložiště OAuth klientů, veřejné stažení faktury podle `public_id` a právě
vydání uživatelského tokenu výše. Data nástrojů se přes něj nikdy nečtou.

---

## Autentizace

ChatGPT umí u vlastních konektorů buď „bez autentizace", nebo OAuth — vlastní
hlavičky ani statické API klíče nepodporuje. Supabase Auth přitom není OAuth
server pro cizí aplikace, je to poskytovatel identity jen pro tuhle appku.

Aplikace proto obsahuje **vlastní minimální OAuth 2.1 authorization server**,
který staví na existujícím přihlášení do Supabase:

| Endpoint | Popis |
| --- | --- |
| `/.well-known/oauth-protected-resource` | metadata chráněného zdroje (RFC 9728) |
| `/.well-known/oauth-authorization-server` | metadata autorizačního serveru (RFC 8414) |
| `/api/oauth/register` | dynamická registrace klienta (RFC 7591) |
| `/api/oauth/authorize` | Authorization Code Flow, vyžaduje přihlášení |
| `/oauth/authorize` | souhlasná obrazovka (česky) |
| `/api/oauth/token` | výměna kódu a rotace refresh tokenu |
| `/api/oauth/revoke` | odvolání tokenu (RFC 7009) |

Vlastnosti:

- **PKCE `S256` je povinné**, metoda `plain` je odmítnutá.
- **Access token** je JWT (HS256, `MCP_TOKEN_SECRET`) s platností 30 minut,
  `aud` = `https://<doména>/mcp`. Token vydaný pro jiný zdroj neprojde.
- **Refresh token** je neprůhledný, v databázi jen jako SHA-256, platí 30 dní
  a **rotuje se** při každém použití. Použití už zrotovaného tokenu je příznak
  úniku — zneplatní se celá rotační rodina.
- **Autorizační kód** žije 60 sekund a je jednorázový.
- **Rozsahy:** `invoices:read` (čtení) a `invoices:write` (zápis).

### Postup přihlášení

1. ChatGPT zavolá `/mcp` bez tokenu → dostane `401` s hlavičkou
   `WWW-Authenticate` odkazující na metadata zdroje.
2. Načte metadata, zaregistruje se jako klient a přesměruje tě
   na `/api/oauth/authorize`.
3. Nejsi-li přihlášený, middleware tě pošle na `/auth/login?redirect_to=…`
   a po přihlášení tě vrátí zpět.
4. Uvidíš souhlasnou obrazovku s názvem aplikace a požadovanými oprávněními.
5. Po povolení dostane ChatGPT kód, vymění ho za tokeny a konektor je hotový.

Přístup odebereš buď v ChatGPT (smazáním konektoru), nebo zavoláním
`/api/oauth/revoke`. Už vydaný access token doběhne do 30 minut.

### Druhá cesta: osobní token

Klienti, kteří OAuth neumí (Claude Desktop, MCP Inspector, vlastní skript),
můžou použít **osobní přístupový token** s prefixem `tfm_`. Vydává si ho
uživatel sám na stránce `/connect` — viz [Osobní tokeny](#osobní-tokeny).

`lib/mcp/auth.ts` rozliší obě podoby podle prefixu a obě vyústí ve stejnou
identitu. Rate limit, potvrzování zápisů, audit i RLS pro ně platí totožně.

---

## Připojení k ChatGPT

Celý postup je i přímo v aplikaci na stránce **Připojení** (`/connect`) —
včetně MCP adresy s tlačítkem na zkopírování. Tenhle dokument je jeho
podrobnější verze.

Potřebuješ účet ChatGPT **Plus, Pro, Business nebo Enterprise** a nasazenou
aplikaci na veřejné HTTPS doméně.

1. V ChatGPT otevři **Nastavení → Konektory** (Settings → Connectors).
2. Zapni **Vývojářský režim** (Developer mode / Advanced settings).
3. Klikni na **Vytvořit** / **Add custom connector**.
4. Vyplň:
   - **Název:** `Terky Faktury`
   - **URL MCP serveru:** `https://<tvoje-doména>/mcp`
   - **Autentizace:** `OAuth`
5. Potvrď. ChatGPT se sám zaregistruje a otevře přihlášení.
6. Přihlas se svým účtem a na souhlasné obrazovce klikni **Povolit přístup**.
7. V novém chatu konektor zapni (ikona nástrojů → *Terky Faktury*).

Ověření, že server odpovídá:

```bash
curl -i https://<tvoje-doména>/mcp -X POST \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
# Očekávané: HTTP/1.1 401 + hlavička WWW-Authenticate s resource_metadata

curl -s https://<tvoje-doména>/.well-known/oauth-protected-resource | jq
curl -s https://<tvoje-doména>/.well-known/oauth-authorization-server | jq
```

---

## Osobní tokeny

Stránka **`/connect`** umožňuje vygenerovat token pro MCP klienty bez OAuth.

**Vlastnosti**

- Tvar `tfm_<43 znaků>`, 256 bitů entropie.
- V databázi je jen **SHA-256**; otevřenou podobu uživatel vidí jedinkrát
  při vytvoření a nikde se neukládá.
- Má název, oprávnění (**jen čtení**, nebo **čtení a zápis**) a platnost
  (30 dní / 90 dní / 1 rok).
- V seznamu jsou poslední čtyři znaky, čas posledního použití a stav.
- Odvolání platí okamžitě. Jeden uživatel má nejvýše 10 platných tokenů.

**Správa** běží přes `/api/mcp/tokens`, autorizuje se **cookie session** —
ne MCP tokenem, aby jedním tokenem nešlo vyrobit další. Data drží tabulka
`mcp_personal_tokens` (migrace `016`) bez RLS politik; uživatel s ní pracuje
přes SECURITY DEFINER funkce, ověření tokenu při volání běží pod service-role
klientem s dotazem přišpendleným na jeden otisk.

**Použití v Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "terky-faktury": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote", "https://<doména>/mcp",
        "--header", "Authorization: Bearer tfm_..."
      ]
    }
  }
}
```

**Ověření z terminálu:**

```bash
curl -s -X POST https://<doména>/mcp \
  -H "Authorization: Bearer tfm_..." \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

> Token zastupuje celý účet. Zacházej s ním jako s heslem, nedávej ho
> do repozitáře a pro klienty, kteří jen čtou přehledy, vydej variantu
> **jen pro čtení**.

---

## Dostupné nástroje

Všech 19 nástrojů vyžaduje platný token. Sloupec *Oprávnění* říká, jaký scope
musí token mít.

### Zákazníci

| Nástroj | Typ | Oprávnění | Účel |
| --- | --- | --- | --- |
| `search_customers` | čtení | `invoices:read` | Najde kandidáty podle jména, e-mailu, NIE nebo NIF. Vrací seznam, nikdy nevybírá sám. |
| — | — | — | *`list_invoices`, `get_invoice_summary` a `get_company_profile` vracejí navíc `account.email` — u prázdné odpovědi je z ní pak poznat, že je konektor připojený k jinému účtu.* |
| `get_customer` | čtení | `invoices:read` | Úplné údaje jednoho zákazníka. |
| `create_customer` | zápis | `invoices:write` | Založí zákazníka. Dvoufázový. |
| `update_customer` | zápis | `invoices:write` | Přepíše údaje zákazníka. Dvoufázový. |

### Faktury

| Nástroj | Typ | Oprávnění | Účel |
| --- | --- | --- | --- |
| `list_invoices` | čtení | `invoices:read` | Seznam s filtry `all/paid/unpaid/overdue`, zákazník, období. |
| `get_invoice` | čtení | `invoices:read` | Detail včetně položek a sazeb. |
| `get_invoice_summary` | čtení | `invoices:read` | Agregace: počty a částky celkem / zaplaceno / nezaplaceno / po splatnosti. |
| `get_invoice_download_link` | čtení | `invoices:read` | Veřejný odkaz na PDF (ten samý, co dostane zákazník). |
| `create_invoice` | zápis | `invoices:write` | Vystaví fakturu. Číslo přiděluje databáze. Dvoufázový. |
| `update_invoice` | zápis | `invoices:write` | Přepíše fakturu včetně položek. Dvoufázový. |
| `set_invoice_payment` | zápis | `invoices:write` | Označí zaplaceno / zruší platbu. Dvoufázový. |
| `send_invoice_email` | **riziková** | `invoices:write` | Odešle fakturu zákazníkovi. Nevratné. |
| `delete_invoice` | **destruktivní** | `invoices:write` | Trvale smaže fakturu i položky. |

### Deník služeb

| Nástroj | Typ | Oprávnění | Účel |
| --- | --- | --- | --- |
| `list_activities` | čtení | `invoices:read` | Záznamy úklidu, praní a servisu apartmánu. |
| `get_activity` | čtení | `invoices:read` | Detail aktivity včetně služeb. |
| `create_activity` | zápis | `invoices:write` | Zapíše aktivitu. Dvoufázový. |
| `update_activity` | zápis | `invoices:write` | Přepíše aktivitu včetně služeb. Dvoufázový. |
| `set_activity_status` | zápis | `invoices:write` | Označí aktivitu zaplacenou / nezaplacenou. Dvoufázový. |

### Firma

| Nástroj | Typ | Oprávnění | Účel |
| --- | --- | --- | --- |
| `get_company_profile` | čtení | `invoices:read` | Údaje vystavovatele tištěné na fakturách. |

### Co přes MCP dostupné není a proč

| Operace | Důvod |
| --- | --- |
| Přihlášení, registrace, reset hesla (`/auth/*`) | práce s hesly a tokeny |
| OAuth endpointy | infrastruktura autentizace, ne uživatelská operace |
| Veřejné stažení faktury (`/api/invoices/{download,public}/*`) | běží bez uživatelského kontextu; data jsou dostupná přes `get_invoice` |
| **Mazání zákazníka** | maže kaskádou i všechny jeho faktury a aktivity — nepřijatelné riziko v konverzaci |
| **Mazání aktivity** | destruktivní operace nízké hodnoty; zůstává v aplikaci |
| Zápis do firemního profilu | mění fakturační identitu na všech budoucích dokladech |
| Surové PDF | velký binární výstup; místo něj se vrací odkaz |

---

## Příklady příkazů

```
Najdi klienta ABC.
```
→ `search_customers`. Když existuje víc „Nováků", model ukáže kandidáty
s maskovaným e-mailem a počtem faktur a zeptá se, kterého myslíš.

```
Zobraz nezaplacené faktury po splatnosti.
```
→ `list_invoices` s `status: "overdue"`.

```
Připrav fakturu klientovi ABC na 100 EUR.
```
→ `search_customers` → `create_invoice` bez tokenu → souhrn (zákazník, položky,
DPH, retención, datum vystavení i splatnosti, celkem) → čeká na tvůj souhlas →
`create_invoice` znovu, se stejnými argumenty a s tokenem.

```
Odešli potvrzenou fakturu klientovi ABC.
```
→ `list_invoices` → `send_invoice_email` bez tokenu → souhrn s příjemcem
a upozorněními → po souhlasu `send_invoice_email` znovu, s tokenem.

Další, co funguje:

```
Kolik mi zákazníci dluží?
Označ fakturu 2026-014 jako zaplacenou k 15. dubnu.
Co jsme dělali pro klienta ABC v květnu?
Zapiš úklid u klienta ABC za 30 € na dnešek.
```

---

## Potvrzování zápisů

Žádná zápisová operace se neprovede bez potvrzení. Model si potvrzení nemůže
vyrobit sám — prostý parametr `confirmed: true` by nestačil.

Obě fáze obstará **jeden nástroj, volaný dvakrát**:

1. **Bez `confirmation_token`** nástroj spočítá výsledek, uloží otisk parametrů
   (SHA-256 kanonizovaného JSONu) a vrátí:
   - `saved: false` a `status` — slovy, co se ještě **nestalo**,
   - `required_action` — jméno nástroje, který se má zavolat znovu,
   - `summary` — přesně to, co se stane,
   - `warnings` — např. „faktura už byla odeslána",
   - `confirmation_token` — jednorázový, platný 5 minut.
2. **ChatGPT ukáže souhrn** a vyžádá si výslovný souhlas.
3. **Tentýž nástroj se zavolá znovu** se stejnými argumenty plus tokenem.
4. **Databáze ověří**, že token patří témuž uživateli, témuž nástroji
   a nezměněným parametrům, a atomicky ho spotřebuje.
5. Teprve pak proběhne operace a odpověď má `saved: true`.

Token je neplatný, když: vypršel, už byl použit, patří jinému uživateli,
nebo se změnil jakýkoli parametr (třeba jen částka).

U vytvoření faktury souhrn vždy obsahuje klienta, částku, měnu, položky,
množství, sazbu DPH, retención, datum vystavení, datum splatnosti a způsob
úhrady.

### Proč jeden nástroj místo dvou

Původně na to byly nástroje dva — `prepare_*` a zapisující. V provozu to
opakovaně selhalo, vždy na přechodu mezi nimi:

- model ukázal souhrn z `prepare_invoice` a zapisující nástroj vůbec nezavolal,
  takže uživateli faktura chyběla, i když mu ChatGPT oznámil úspěch,
- zapisující schéma odmítlo `null`, které příprava sama vrátila,
- do vstupního schématu se prosákl tvar otisku: mazání faktury vyžadovalo
  `action: "delete"` a `paid_date: null`, což model nesestavil a klient volání
  zahodil ještě před odesláním — takže po něm nezůstala stopa ani v auditu.

Teď model volá stejný nástroj se stejnými argumenty a jen přidá token. Otisk se
počítá až uvnitř z normalizovaných hodnot, takže netvoří veřejné rozhraní,
a chybějící hodnoty (datum, sazby, měnu) doplní server v obou fázích stejně.

### Idempotence

`create_invoice`, `create_customer`, `create_activity` a `send_invoice_email`
přijímají `idempotency_key`. Opakované volání se stejným klíčem vrátí původní
výsledek (`replayed: true`) místo aby vzniklá druhá faktura nebo odešel druhý
e-mail. Stejný klíč s jinými parametry je chyba `IDEMPOTENCY_KEY_REUSED`.

---

## Bezpečnostní omezení

**Izolace uživatelů.** Každý požadavek běží pod podepsaným Supabase JWT
konkrétního uživatele, takže o přístupu rozhoduje RLS v databázi. `user_id`
se nikdy nebere z parametrů nástroje.

**Nejednoznačnost.** `search_customers` vrací kandidáty s příznakem
`ambiguous` a instrukcí zeptat se uživatele. Server nikdy nevybere první
výsledek za tebe.

**Prompt injection.** Texty z databáze (názvy, poznámky, popisy) jsou
nedůvěryhodný obsah. Do výstupu jdou přes `safeText` — bez řídicích znaků
a zkrácené — a vždy jako datová hodnota. Všechna bezpečnostní rozhodnutí
dělá backend deterministicky; obsah dat nemůže spustit jiný nástroj ani
obejít potvrzení.

**Chyby.** Odpověď má vždy tvar `{ success, data }` nebo
`{ success: false, error: { code, message, retryable } }`. Ven nejde stack
trace, SQL, tokeny ani interní konfigurace — ty zůstávají v serverovém logu.

**Limity.**

| Co | Hodnota |
| --- | --- |
| Volání celkem | 120 / minutu / uživatel |
| Zápisy | 20 / minutu / uživatel |
| Odeslané e-maily | 10 / hodinu / uživatel |
| Velikost požadavku | 256 kB |
| Výsledků v seznamu | max. 50 |
| Položek na faktuře | max. 50 |
| Timeout obsluhy | 60 s |

**Audit.** Každé volání se zapisuje do `mcp_audit_log`: uživatel, klient,
nástroj, čas, výsledek, chybový kód, id dotčeného zdroje, idempotency key,
id potvrzení a doba běhu. Vstupní objekty, osobní údaje ani tokeny se
do auditu nezapisují.

**Měna.** Aplikace umí jen EUR. Jiná měna skončí chybou, ne tichým převodem.

**Peníze.** Částky se přenášejí jako řetězce a počítají celočíselně
v centech (`lib/money.ts`), takže nevznikají chyby plovoucí desetinné čárky.

---

## Proměnné prostředí

Nové proměnné potřebné pro MCP (celý seznam je v `.env.example`
a v tabulce v `DEPLOYMENT.md`):

| Proměnná | Povinná | Popis |
| --- | --- | --- |
| `MCP_TOKEN_SECRET` | ano | Tajemství pro podpis access tokenů a autorizačních požadavků. Alespoň 32 znaků. Vygeneruj `openssl rand -base64 48`. |
| `SUPABASE_SERVICE_ROLE_KEY` | ano | Servisní klíč pro úložiště OAuth, veřejné stažení faktury a vydávání uživatelských session pro MCP. **Nikdy nesmí do prohlížeče.** |

`NEXT_PUBLIC_SITE_URL` musí přesně odpovídat veřejné doméně — skládá se z ní
`issuer` i `resource` v OAuth metadatech. Když nesedí, ChatGPT konektor
nepřipojí.

Tajemství nikdy nepatří do zdrojového kódu; `.env.example` obsahuje jen
zástupné hodnoty.

---

## Lokální spuštění

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local     # doplň hodnoty
pnpm dev
```

ChatGPT na `localhost` nedosáhne. Pro ruční zkoušku:

```bash
# Metadata
curl -s http://localhost:3000/.well-known/oauth-authorization-server | jq

# Bez tokenu → 401 s odkazem na metadata
curl -i -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Kompletní tok včetně nástrojů prochází v testech
(`tests/mcp/`), takže na většinu ověření není potřeba běžící server.
Pro zkoušku s reálným klientem vystav dev server přes tunel
(`ngrok http 3000`) a nastav `NEXT_PUBLIC_SITE_URL` na jeho HTTPS adresu.

---

## Testy

```bash
pnpm test          # jednorázově
pnpm test:watch    # ve smyčce
pnpm typecheck
pnpm build
```

Testy běží proti in-memory náhradě Supabase (`tests/helpers/fake-supabase.ts`),
takže nepotřebují databázi, Docker ani síť. Náhrada napodobuje i RLS — klient
je vázaný na uživatele a cizí řádky nevidí — proto mají testy izolace tenantů
smysl.

Co je pokryté:

| Oblast | Soubor |
| --- | --- |
| Inicializace serveru, seznam nástrojů, anotace | `tests/mcp/protocol.test.ts` |
| Chybějící, poškozený, vypršelý a cizí token | `tests/mcp/protocol.test.ts` |
| Limit velikosti a neplatný JSON | `tests/mcp/protocol.test.ts` |
| Čtení, filtry, souhrny | `tests/mcp/tools.test.ts` |
| Nejednoznačné vyhledávání | `tests/mcp/tools.test.ts` |
| Neplatný vstup a nepodporovaná měna | `tests/mcp/tools.test.ts` |
| Nedostatečná oprávnění | `tests/mcp/tools.test.ts` |
| Přístup k datům jiného uživatele | `tests/mcp/tools.test.ts`, `tests/services/invoices.test.ts` |
| Potvrzení: chybějící, vymyšlené, vypršelé, použité, pozměněné, cizí | `tests/mcp/tools.test.ts` |
| Obě fáze zápisu u všech nástrojů | `tests/mcp/two-phase.test.ts` |
| Idempotence a konflikt klíče | `tests/mcp/tools.test.ts` |
| Destruktivní operace | `tests/mcp/tools.test.ts` |
| Rate limiting | `tests/mcp/tools.test.ts` |
| Ochrana citlivých dat ve výstupu | `tests/mcp/tools.test.ts` |
| Audit | `tests/mcp/tools.test.ts` |
| OAuth: registrace, PKCE, rotace, reuse detection, revokace | `tests/oauth/flow.test.ts` |
| Osobní tokeny: generování, oprávnění, odvolání, expirace, izolace | `tests/mcp/personal-tokens.test.ts` |
| Vydávání uživatelského Supabase tokenu, cache a chyby | `tests/mcp/user-scoped.test.ts` |
| Peníze a výpočty faktury | `tests/money.test.ts` |
| Servisní vrstva | `tests/services/invoices.test.ts` |

---

## Jak přidat další nástroj

1. **Potřebnou business logiku dej do `lib/services/`**, ne do nástroje.
   Když už tam je, jen ji zavolej.
2. **Vytvoř definici** v `lib/mcp/tools/<doména>.ts`:

```ts
export const getSomethingTool = defineTool({
  name: "get_something",           // anglicky, sloveso_podstatné jméno
  title: "Něco",                   // krátký název pro uživatele
  description:
    "Co nástroj dělá a KDY ho má model použít. Napiš i to, co dělat nemá.",
  inputSchema: {
    something_id: z.string().uuid().describe("Odkud id vzít."),
  },
  annotations: {
    readOnlyHint: true,            // nic nemění
    destructiveHint: false,        // nevratná operace?
    idempotentHint: true,          // opakování má stejný efekt?
    openWorldHint: false,          // sahá mimo aplikaci (e-mail, platba)?
  },
  scope: "invoices:read",          // invoices:read | invoices:write
  rateLimit: "call",               // call | write | email
  handler: async (args, ctx) => {
    const something = await getSomething(ctx.service, args.something_id)
    return {
      payload: { something: presentSomething(something) },
      resourceType: "something",
      resourceId: something.id,
    }
  },
})
```

3. **Zaregistruj ho** v `lib/mcp/server.ts`.
4. **U zápisu obal tělo do `twoPhase()`** (`lib/mcp/two-phase.ts`). Předej mu
   jméno nástroje, `args.confirmation_token`, normalizované parametry pro otisk,
   `status`, `summary` a funkci `execute`. Normalizaci dělej jednou funkcí, aby
   obě fáze spočítaly stejný otisk. `confirmation_token` musí být v schématu
   vždy **volitelný** — v první fázi ho model nemá odkud vzít.
5. **Doplň nástroj do testu** `tests/mcp/protocol.test.ts` (seznam nástrojů)
   a napiš mu vlastní test v `tests/mcp/tools.test.ts`.
6. **Doplň řádek do tabulky** v tomto dokumentu.

Oprávnění, rate limit, převod chyb ani audit řešit nemusíš — dělá je obal
v `lib/mcp/define-tool.ts`.

---

## Nasazení

1. **Migrace.** Push na `master` spustí `supabase db push`
   (viz `DEPLOYMENT.md`). Migrace `014` zakládá tabulky pro OAuth a MCP,
   `015` ruší děravé veřejné RLS politiky a `016` přidává osobní tokeny.
2. **Proměnné prostředí.** Do Vercelu doplň `MCP_TOKEN_SECRET`
   a `SUPABASE_SERVICE_ROLE_KEY` do všech prostředí, ve kterých má MCP fungovat.
3. **Doména.** Zkontroluj, že `NEXT_PUBLIC_SITE_URL` odpovídá produkční
   doméně (ne `*.vercel.app`, pokud používáš vlastní doménu).
4. **Ověření po nasazení:**
   ```bash
   curl -s https://<doména>/.well-known/oauth-protected-resource | jq
   curl -i -X POST https://<doména>/mcp \
     -H 'Content-Type: application/json' \
     -H 'Accept: application/json, text/event-stream' \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'   # → 401
   ```
5. **Připoj konektor** v ChatGPT podle
   [postupu výše](#připojení-k-chatgpt) a vyzkoušej „Najdi klienta ABC".
6. **Zkontroluj stránku `/connect`** — musí ukazovat správnou MCP adresu
   (ne `localhost`) a musí jít vygenerovat i odvolat token.

### Po nasazení migrace 015

Veřejné stažení faktury přestane fungovat, pokud není nastavený
`SUPABASE_SERVICE_ROLE_KEY` — nově ho obsluhuje serverová routa místo
anonymního klíče. Nasazuj obojí zároveň a po nasazení otevři jeden
`/invoices/download/<publicId>` odkaz pro kontrolu.
