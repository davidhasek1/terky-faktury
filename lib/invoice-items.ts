/**
 * Ustálené popisy položek faktury.
 *
 * Faktury se vystavují **španělsky**, i když aplikace mluví česky. Aby popisy
 * nevznikaly pokaždé jinak, drží se tady na jednom místě: nabízí je našeptávač
 * ve formuláři a podle stejného seznamu je používá i MCP nástroj, když si
 * uživatel řekne o fakturu v ChatGPT česky.
 *
 * `czech` slouží jen k tomu, aby model poznal, který český pojem odpovídá
 * kterému španělskému popisu. Na faktuře se nikdy neobjeví.
 */
export const INVOICE_ITEM_PRESETS = [
  { description: "Limpieza de apartamentos", czech: "úklid, úklid apartmánů" },
  { description: "Lavado de ropa", czech: "praní, prádlo" },
] as const

/** Nabídka pro `<datalist>` ve formuláři. */
export const INVOICE_ITEM_DESCRIPTIONS = INVOICE_ITEM_PRESETS.map(
  (preset) => preset.description,
)

/**
 * Popis pole `description` pro schéma MCP nástroje. Modelu říká, že má
 * překládat do španělštiny, i když prompt přišel česky.
 */
export function invoiceItemDescriptionHint(): string {
  const presets = INVOICE_ITEM_PRESETS.map(
    (preset) => `„${preset.description}" (${preset.czech})`,
  ).join(", ")

  return (
    "Popis položky tak, jak se má vytisknout na faktuře. Faktury se vystavují " +
    "španělsky — použij španělský popis i tehdy, když uživatel mluví česky. " +
    `Ustálené popisy: ${presets}. Jinou službu popiš španělsky vlastními slovy ` +
    "a v odpovědi uživateli ji česky vysvětli."
  )
}
