/**
 * Práce s penězi a desetinnými čísly bez chyb plovoucí desetinné čárky.
 *
 * Databáze drží částky jako DECIMAL(12,2) a množství jako DECIMAL(10,2).
 * V TypeScriptu s nimi proto počítáme jako s celými čísly ve setinách
 * ("centy" u částek, "setiny" u množství) a na hranici databáze převádíme
 * zpět na `number` se dvěma desetinnými místy.
 *
 * Nikdy nepoužívej `parseFloat` na částku z uživatelského vstupu — použij
 * `parseDecimal`, který odmítne nesmysly místo aby tiše vrátil NaN nebo 0.
 */

/** Počet setin (např. 100,50 € → 10050). */
export type Scaled = number

const SCALE = 100
const MAX_SCALED = 999_999_999_999

/**
 * Rozparsuje desetinné číslo zadané jako řetězec nebo číslo na setiny.
 * Přijímá čárku i tečku jako oddělovač a mezery jako oddělovač tisíců.
 *
 * @throws {RangeError} pokud vstup není platné desetinné číslo se dvěma místy
 */
export function parseDecimal(input: string | number): Scaled {
  const raw = typeof input === "number" ? formatNumberForParse(input) : input

  const normalized = raw.trim().replace(/\s| /g, "").replace(",", ".")

  if (normalized === "" || !/^-?\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new RangeError(`Neplatné desetinné číslo: "${raw}"`)
  }

  const negative = normalized.startsWith("-")
  const [whole, fraction = ""] = normalized.replace("-", "").split(".")
  const scaled = Number(whole) * SCALE + Number(fraction.padEnd(2, "0"))

  if (!Number.isSafeInteger(scaled) || scaled > MAX_SCALED) {
    throw new RangeError(`Číslo je mimo povolený rozsah: "${raw}"`)
  }

  return negative ? -scaled : scaled
}

function formatNumberForParse(value: number): string {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Neplatné desetinné číslo: "${value}"`)
  }
  // Zaokrouhlíme na dvě místa, ať `0.1 + 0.2` neshodí parser.
  return (Math.round(value * SCALE) / SCALE).toFixed(2)
}

/** Převede setiny zpět na `number` pro zápis do DECIMAL(x,2). */
export function toDecimal(scaled: Scaled): number {
  return Math.round(scaled) / SCALE
}

/** Načte hodnotu z databáze (DECIMAL přichází jako `number`) na setiny. */
export function fromDecimal(value: number | string | null | undefined): Scaled {
  if (value === null || value === undefined) return 0
  return parseDecimal(value)
}

/**
 * Součin dvou hodnot v setinách zpět v setinách — např. množství × cena.
 * Zaokrouhluje se běžným obchodním způsobem (půlka nahoru).
 */
export function multiplyScaled(a: Scaled, b: Scaled): Scaled {
  return roundHalfUp((a * b) / SCALE)
}

/**
 * Procentuální podíl. Sazba se zadává v setinách procenta
 * (21 % → 2100), aby seděla na DECIMAL(5,2) v databázi.
 */
export function percentOf(amount: Scaled, rateScaled: Scaled): Scaled {
  return roundHalfUp((amount * rateScaled) / (SCALE * SCALE))
}

export function sumScaled(values: readonly Scaled[]): Scaled {
  return values.reduce((total, value) => total + value, 0)
}

function roundHalfUp(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value)
}

/** Formátování pro souhrny určené člověku i modelu (EUR, cs-CZ jako ve zbytku appky). */
export function formatScaled(scaled: Scaled): string {
  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "EUR",
  }).format(toDecimal(scaled))
}
