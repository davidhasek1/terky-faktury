'use client';

import type React from 'react';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Trash2 } from 'lucide-react';
import { z } from 'zod';
import { SectionLabel } from '@/components/patterns/section-label';
import { INVOICE_ITEM_DESCRIPTIONS } from '@/lib/invoice-items';
import { formatScaled, parseDecimal, toDecimal, type Scaled } from '@/lib/money';
import { createBrowserServiceContext } from '@/lib/services/browser-context';
import {
  calculateInvoiceTotals,
  defaultRetentionRate,
} from '@/lib/services/invoice-totals';
import { createInvoice, updateInvoice } from '@/lib/services/invoices';
import { firstIssueMessage } from '@/lib/validation/common';
import { invoiceInputSchema } from '@/lib/validation/invoices';
import type { Customer, Invoice, InvoiceItem } from '@/lib/types';
import { toast } from 'sonner';

interface InvoiceFormProps {
  customers: Customer[];
  invoice?: Invoice;
  existingItems?: InvoiceItem[];
}

const getLocalDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

type FormInvoiceItem = {
  description: string;
  quantity: string;
  unit_price: string;
};

/**
 * Rozparsuje rozepsané pole. Během psaní jsou hodnoty jako "" nebo "1,"
 * běžné — pro živý náhled je bereme jako nulu, ostrou kontrolu dělá zod
 * až při ukládání.
 */
const parseScaled = (value: string): Scaled => {
  try {
    return parseDecimal(value);
  } catch {
    return 0;
  }
};

// Klasické boxed inputy (styl řídí komponenta Input); necháváme prázdné,
// ať se nepřepisuje nový výchozí vzhled.
const inputBare = '';
const inputBoxed = '';
const fieldLabel =
  'text-sm font-semibold text-muted-foreground';

export function InvoiceForm({
  customers,
  invoice,
  existingItems = [],
}: InvoiceFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showEmailWarning, setShowEmailWarning] = useState(false);

  const [formData, setFormData] = useState({
    invoice_number: invoice?.invoice_number || '',
    customer_id: invoice?.customer_id || undefined,
    issue_date: invoice?.issue_date || getLocalDate(),
    due_date:
      invoice?.due_date ||
      (() => {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 14);
        const year = dueDate.getFullYear();
        const month = String(dueDate.getMonth() + 1).padStart(2, '0');
        const day = String(dueDate.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      })(),
    tax_rate: invoice?.tax_rate?.toString() || '21',
    retention_rate: invoice?.retention_rate?.toString() || '0',
    notes: invoice?.notes || '',
  });

  const [items, setItems] = useState<FormInvoiceItem[]>(
    existingItems.length > 0
      ? existingItems.map((item) => ({
          description: item.description,
          quantity: item.quantity.toString(),
          unit_price: item.unit_price.toString(),
        }))
      : [{ description: '', quantity: '1', unit_price: '0' }],
  );

  useEffect(() => {
    if (!invoice) {
      const today = getLocalDate();
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 14);
      const year = dueDate.getFullYear();
      const month = String(dueDate.getMonth() + 1).padStart(2, '0');
      const day = String(dueDate.getDate()).padStart(2, '0');
      const dueDateStr = `${year}-${month}-${day}`;

      setFormData((prev) => ({
        ...prev,
        issue_date: today,
        due_date: dueDateStr,
      }));
    }
  }, []);

  useEffect(() => {
    if (formData.customer_id) {
      const selectedCustomer = customers.find(
        (c) => c.id === formData.customer_id,
      );
      if (selectedCustomer) {
        // Stejné pravidlo, jaké použije servisní vrstva i MCP nástroj.
        const retentionRate = toDecimal(
          defaultRetentionRate(selectedCustomer.is_business),
        ).toString();
        setFormData((prev) => ({
          ...prev,
          retention_rate: retentionRate,
        }));
      }
    }
  }, [formData.customer_id, customers]);

  const isValidNumber = (value: string): boolean => {
    if (value === '' || value === '.' || value === ',') return true;
    return /^\d*[.,]?\d*$/.test(value);
  };

  // Živý náhled počítá přesně tou funkcí, která fakturu i uloží.
  const totals = calculateInvoiceTotals({
    items: items.map((item) => ({
      quantity: parseScaled(item.quantity),
      unit_price: parseScaled(item.unit_price),
    })),
    tax_rate: parseScaled(formData.tax_rate),
    retention_rate: parseScaled(formData.retention_rate),
  });

  const addItem = () => {
    setItems([...items, { description: '', quantity: '1', unit_price: '0' }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (
    index: number,
    field: keyof FormInvoiceItem,
    value: string,
  ) => {
    setItems((rows) =>
      rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  };

  const saveInvoice = async () => {
    setIsLoading(true);

    try {
      // Validace i výpočty jsou stejné, jaké použije MCP nástroj — formulář
      // si nedrží vlastní pravidla.
      const input = invoiceInputSchema.parse({
        customer_id: formData.customer_id,
        issue_date: formData.issue_date,
        due_date: formData.due_date,
        tax_rate: formData.tax_rate,
        retention_rate: formData.retention_rate,
        notes: formData.notes,
        currency: 'EUR',
        items,
      });

      const ctx = await createBrowserServiceContext();

      if (invoice) {
        await updateInvoice(ctx, invoice.id, input);
        toast.success('Faktura byla úspěšně aktualizována');
      } else {
        const created = await createInvoice(ctx, input);
        toast.success(
          `Faktura ${created.invoice_number} byla úspěšně vytvořena`,
        );
      }

      router.push('/invoices');
      router.refresh();
    } catch (err) {
      console.error('[invoices] Nepodařilo se uložit fakturu:', err);
      toast.error(
        err instanceof z.ZodError
          ? firstIssueMessage(err)
          : err instanceof Error
            ? err.message
            : 'Nepodařilo se uložit fakturu',
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (invoice?.email_sent_at) {
      setShowEmailWarning(true);
      return;
    }

    await saveInvoice();
  };

  const handleConfirmEdit = async () => {
    setShowEmailWarning(false);
    await saveInvoice();
  };

  return (
    <>
      <AlertDialog open={showEmailWarning} onOpenChange={setShowEmailWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className='font-serif text-2xl font-normal'>
              Faktura již byla odeslána
            </AlertDialogTitle>
            <AlertDialogDescription className='space-y-2'>
              <span className='block'>
                Tato faktura již byla odeslána e-mailem zákazníkovi.
              </span>
              <span className='block font-semibold text-foreground'>
                Opravdu chcete změnit fakturu?
              </span>
              <span className='block text-sm text-muted-foreground'>
                Po uložení změn bude potřeba fakturu znovu odeslat e-mailem, aby
                zákazník obdržel aktualizovanou verzi.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zrušit</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmEdit}>
              Ano, změnit fakturu
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <form onSubmit={handleSubmit} className='space-y-12 sm:space-y-16'>
        <section>
          <SectionLabel title='Detaily' />
          <div className='grid gap-6 sm:gap-8 md:grid-cols-2'>
            <div className='space-y-2'>
              <Label htmlFor='invoice_number' className={fieldLabel}>
                Číslo faktury
              </Label>
              <Input
                id='invoice_number'
                value={formData.invoice_number}
                readOnly
                disabled
                placeholder={
                  invoice ? undefined : 'Přidělí se automaticky po uložení'
                }
                className={inputBare}
              />
            </div>

            <div className='space-y-2'>
              <Label htmlFor='customer_id' className={fieldLabel}>
                Zákazník <span className='text-primary'>*</span>
              </Label>
              <Select
                value={formData.customer_id}
                onValueChange={(value) =>
                  setFormData({ ...formData, customer_id: value })
                }
                required
              >
                <SelectTrigger id='customer_id'>
                  <SelectValue placeholder='Vybrat zákazníka' />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className='space-y-2'>
              <Label htmlFor='issue_date' className={fieldLabel}>
                Datum vystavení <span className='text-primary'>*</span>
              </Label>
              <Input
                id='issue_date'
                type='date'
                required
                value={formData.issue_date}
                onChange={(e) =>
                  setFormData({ ...formData, issue_date: e.target.value })
                }
                className={inputBare}
              />
            </div>

            <div className='space-y-2'>
              <Label htmlFor='due_date' className={fieldLabel}>
                Datum splatnosti <span className='text-primary'>*</span>
              </Label>
              <Input
                id='due_date'
                type='date'
                required
                value={formData.due_date}
                onChange={(e) =>
                  setFormData({ ...formData, due_date: e.target.value })
                }
                className={inputBare}
              />
            </div>

            <div className='space-y-2'>
              <Label htmlFor='tax_rate' className={fieldLabel}>
                Sazba DPH (%) <span className='text-primary'>*</span>
              </Label>
              <Input
                id='tax_rate'
                type='text'
                inputMode='decimal'
                required
                value={formData.tax_rate}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  const value = e.target.value;
                  if (isValidNumber(value)) {
                    setFormData({ ...formData, tax_rate: value });
                  }
                }}
                className={inputBare}
              />
            </div>

            <div className='space-y-2'>
              <Label htmlFor='retention_rate' className={fieldLabel}>
                Retención (%)
              </Label>
              <Input
                id='retention_rate'
                type='text'
                inputMode='decimal'
                value={formData.retention_rate}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  const value = e.target.value;
                  if (isValidNumber(value)) {
                    setFormData({ ...formData, retention_rate: value });
                  }
                }}
                className={inputBare}
              />
              <p className='text-xs text-muted-foreground italic'>
                Automaticky nastaveno podle typu zákazníka (15 % pro podnikající
                subjekt, 0 % pro ostatní).
              </p>
            </div>
          </div>
        </section>

        <section>
          <SectionLabel
            title='Položky'
            action={
              <Button
                type='button'
                variant='ghost'
                size='sm'
                onClick={addItem}
                className='text-sm text-muted-foreground hover:text-foreground'
              >
                <Plus className='mr-2 h-3.5 w-3.5' />
                Přidat položku
              </Button>
            }
          />

          <div className='rounded-lg border border-border bg-card divide-y divide-border shadow-[0_4px_28px_-12px_rgba(27,23,49,0.15)] overflow-hidden'>
            {items.map((item, index) => (
              <div
                key={index}
                className='grid gap-4 md:grid-cols-12 items-end px-5 py-6'
              >
                <div className='md:col-span-5 space-y-2'>
                  <Label
                    htmlFor={`description-${index}`}
                    className={fieldLabel}
                  >
                    Popis
                  </Label>
                  <Input
                    id={`description-${index}`}
                    required
                    value={item.description}
                    onChange={(e) =>
                      updateItem(index, 'description', e.target.value)
                    }
                    list={`description-options-${index}`}
                    placeholder='Vyberte nebo napište popis'
                    className={inputBoxed}
                  />
                  <datalist id={`description-options-${index}`}>
                    {INVOICE_ITEM_DESCRIPTIONS.map((description) => (
                      <option key={description} value={description} />
                    ))}
                  </datalist>
                </div>
                <div className='md:col-span-2 space-y-2'>
                  <Label htmlFor={`quantity-${index}`} className={fieldLabel}>
                    Množství
                  </Label>
                  <Input
                    id={`quantity-${index}`}
                    type='text'
                    inputMode='decimal'
                    required
                    value={item.quantity}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) =>
                      updateItem(index, 'quantity', e.target.value)
                    }
                    className={inputBoxed}
                  />
                </div>
                <div className='md:col-span-2 space-y-2'>
                  <Label htmlFor={`unit_price-${index}`} className={fieldLabel}>
                    Cena/ks
                  </Label>
                  <Input
                    id={`unit_price-${index}`}
                    type='text'
                    inputMode='decimal'
                    required
                    value={item.unit_price}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) =>
                      updateItem(index, 'unit_price', e.target.value)
                    }
                    className={inputBoxed}
                  />
                </div>
                <div className='md:col-span-2 space-y-2'>
                  <Label className={fieldLabel}>Celkem</Label>
                  <div className='h-10 flex items-center font-serif text-lg text-foreground tabular-nums'>
                    {formatScaled(totals.lineTotals[index])}
                  </div>
                </div>
                <div className='md:col-span-1 flex justify-end'>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon'
                    onClick={() => removeItem(index)}
                    disabled={items.length === 1}
                    className='text-muted-foreground hover:text-primary'
                  >
                    <Trash2 className='h-4 w-4' />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <SectionLabel title='Souhrn' />
          <div className='rounded-lg border border-border bg-card px-6 py-8 sm:px-10 sm:py-10 shadow-[0_4px_28px_-12px_rgba(27,23,49,0.15)]'>
            <div className='space-y-3 max-w-md ml-auto'>
              <SummaryRow
                label='Mezisoučet'
                value={formatScaled(totals.subtotal)}
              />
              <SummaryRow
                label={`DPH (${formData.tax_rate} %)`}
                value={formatScaled(totals.taxAmount)}
              />
              {Number.parseFloat(formData.retention_rate) > 0 && (
                <SummaryRow
                  label={`Retención (−${formData.retention_rate} %)`}
                  value={`−${formatScaled(totals.retentionAmount)}`}
                  destructive
                />
              )}
              <div className='flex items-baseline justify-between pt-4 border-t border-border'>
                <span className='text-xs text-muted-foreground'>
                  Celkem
                </span>
                <span className='font-serif text-3xl text-foreground tabular-nums'>
                  {formatScaled(totals.total)}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section>
          <SectionLabel title='Poznámky' />
          <Textarea
            id='notes'
            value={formData.notes}
            onChange={(e) =>
              setFormData({ ...formData, notes: e.target.value })
            }
            rows={4}
            placeholder='Volitelná poznámka, která se objeví na faktuře…'
            className='resize-none'
          />
        </section>

        <div className='flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4 border-t border-border'>
          <Button
            type='button'
            variant='ghost'
            onClick={() => router.back()}
            disabled={isLoading}
            className='text-sm text-muted-foreground hover:text-foreground'
          >
            Zrušit
          </Button>
          <Button
            type='submit'
            disabled={isLoading}
            className='text-sm shadow-none'
          >
            {isLoading
              ? 'Ukládám…'
              : invoice
                ? 'Uložit změny'
                : 'Vytvořit fakturu'}
          </Button>
        </div>
      </form>
    </>
  );
}

function SummaryRow({
  label,
  value,
  destructive,
}: {
  label: string;
  value: string;
  destructive?: boolean;
}) {
  return (
    <div className='flex items-baseline justify-between'>
      <span className='text-xs text-muted-foreground'>
        {label}
      </span>
      <span
        className={
          'text-base tabular-nums ' +
          (destructive ? 'text-primary italic' : 'text-foreground font-medium')
        }
      >
        {value}
      </span>
    </div>
  );
}
