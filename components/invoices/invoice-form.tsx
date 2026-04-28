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
import { SectionLabel } from '@/components/layout/section-label';
import { createClient } from '@/lib/supabase/client';
import type { Customer, Invoice, InvoiceItem } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';

interface InvoiceFormProps {
  customers: Customer[];
  invoice?: Invoice;
  existingItems?: InvoiceItem[];
  existingInvoices?: { invoice_number: string }[];
}

const generateNextInvoiceNumber = (
  existingInvoices: { invoice_number: string }[],
): string => {
  const currentYear = new Date().getFullYear();

  const currentYearInvoices = existingInvoices.filter((inv) => {
    const match = inv.invoice_number.match(/^(\d{4})-(\d+)$/);
    if (match) {
      const year = Number.parseInt(match[1]);
      return year === currentYear;
    }
    return false;
  });

  if (currentYearInvoices.length === 0) {
    return `${currentYear}-001`;
  }

  let maxNumber = 0;
  for (const inv of currentYearInvoices) {
    const match = inv.invoice_number.match(/^(\d{4})-(\d+)$/);
    if (match) {
      const num = Number.parseInt(match[2]);
      if (num > maxNumber) {
        maxNumber = num;
      }
    }
  }

  const nextNumber = maxNumber + 1;
  return `${currentYear}-${String(nextNumber).padStart(3, '0')}`;
};

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
  total: number;
};

const inputBare =
  'border-0 border-b border-border rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary text-base bg-transparent';
const inputBoxed =
  'border border-border rounded-md focus-visible:ring-1 focus-visible:ring-primary text-base bg-card';
const fieldLabel =
  'text-[10px] uppercase tracking-[0.22em] font-medium text-muted-foreground';

export function InvoiceForm({
  customers,
  invoice,
  existingItems = [],
  existingInvoices = [],
}: InvoiceFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showEmailWarning, setShowEmailWarning] = useState(false);

  const [formData, setFormData] = useState({
    invoice_number:
      invoice?.invoice_number || generateNextInvoiceNumber(existingInvoices),
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
          total: item.total,
        }))
      : [{ description: '', quantity: '1', unit_price: '0', total: 0 }],
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
        const retentionRate = selectedCustomer.is_business ? '15' : '0';
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

  const parseNumber = (value: string): number => {
    const normalized = value.replace(',', '.');
    const parsed = Number.parseFloat(normalized);
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  const calculateItemTotal = (quantity: string, unitPrice: string) => {
    return parseNumber(quantity) * parseNumber(unitPrice);
  };

  const calculateSubtotal = () => {
    return items.reduce((sum, item) => sum + item.total, 0);
  };

  const calculateTax = () => {
    const taxRate = Number.parseFloat(formData.tax_rate) || 0;
    return (calculateSubtotal() * taxRate) / 100;
  };

  const calculateRetention = () => {
    const retentionRate = Number.parseFloat(formData.retention_rate) || 0;
    return (calculateSubtotal() * retentionRate) / 100;
  };

  const calculateTotal = () => {
    return calculateSubtotal() + calculateTax() - calculateRetention();
  };

  const addItem = () => {
    setItems([
      ...items,
      { description: '', quantity: '1', unit_price: '0', total: 0 },
    ]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (
    index: number,
    field: keyof FormInvoiceItem,
    value: string | number,
  ) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };

    if (field === 'quantity' || field === 'unit_price') {
      newItems[index].total = calculateItemTotal(
        newItems[index].quantity,
        newItems[index].unit_price,
      );
    }

    setItems(newItems);
  };

  const saveInvoice = async () => {
    setIsLoading(true);

    if (!formData.customer_id) {
      toast.error('Musíte vybrat zákazníka');
      setIsLoading(false);
      return;
    }

    const taxRate = Number.parseFloat(formData.tax_rate);
    const retentionRate = Number.parseFloat(formData.retention_rate);

    if (Number.isNaN(taxRate) || taxRate < 0) {
      toast.error('Sazba DPH musí být platné číslo');
      setIsLoading(false);
      return;
    }

    if (Number.isNaN(retentionRate) || retentionRate < 0) {
      toast.error('Retención musí být platné číslo');
      setIsLoading(false);
      return;
    }

    for (const item of items) {
      const quantity = parseNumber(item.quantity);
      const unitPrice = parseNumber(item.unit_price);

      if (Number.isNaN(quantity) || quantity <= 0) {
        toast.error('Množství musí být platné číslo větší než 0');
        setIsLoading(false);
        return;
      }
      if (Number.isNaN(unitPrice)) {
        toast.error('Cena/ks musí být platné číslo');
        setIsLoading(false);
        return;
      }
    }

    const supabase = createClient();

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('Musíte být přihlášeni');
      }

      const subtotal = calculateSubtotal();
      const taxAmount = calculateTax();
      const retentionAmount = calculateRetention();
      const total = calculateTotal();

      const baseInvoiceData = {
        invoice_number: formData.invoice_number,
        customer_id: formData.customer_id,
        issue_date: formData.issue_date,
        due_date: formData.due_date,
        tax_rate: taxRate,
        retention_rate: retentionRate,
        notes: formData.notes,
        subtotal,
        tax_amount: taxAmount,
        retention_amount: retentionAmount,
        total,
      };

      let invoiceId = invoice?.id;

      if (invoice) {
        const { error: invoiceError } = await supabase
          .from('invoices')
          .update(baseInvoiceData)
          .eq('id', invoice.id);

        if (invoiceError) {
          throw invoiceError;
        }

        const { error: deleteError } = await supabase
          .from('invoice_items')
          .delete()
          .eq('invoice_id', invoice.id);

        if (deleteError) {
          throw deleteError;
        }
      } else {
        const newInvoiceData = {
          ...baseInvoiceData,
          user_id: user.id,
        };

        const { data: newInvoice, error: invoiceError } = await supabase
          .from('invoices')
          .insert([newInvoiceData])
          .select()
          .single();

        if (invoiceError) {
          throw invoiceError;
        }

        invoiceId = newInvoice.id;
      }

      const itemsData = items.map((item) => ({
        invoice_id: invoiceId,
        description: item.description,
        quantity: parseNumber(item.quantity),
        unit_price: parseNumber(item.unit_price),
        total: item.total,
      }));

      const { error: itemsError } = await supabase
        .from('invoice_items')
        .insert(itemsData);

      if (itemsError) {
        throw itemsError;
      }

      toast.success(
        invoice
          ? 'Faktura byla úspěšně aktualizována'
          : 'Faktura byla úspěšně vytvořena',
      );
      router.push('/invoices');
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Nepodařilo se uložit fakturu',
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
            <AlertDialogTitle className='font-serif italic text-2xl font-normal'>
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
          <SectionLabel number='01' title='Detaily' />
          <div className='grid gap-6 sm:gap-8 md:grid-cols-2'>
            <div className='space-y-2'>
              <Label htmlFor='invoice_number' className={fieldLabel}>
                Číslo faktury <span className='text-primary'>*</span>
              </Label>
              <Input
                id='invoice_number'
                required
                value={formData.invoice_number}
                onChange={(e) =>
                  setFormData({ ...formData, invoice_number: e.target.value })
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
                <SelectTrigger
                  id='customer_id'
                  className='border-0 border-b border-border rounded-none px-0 focus:ring-0 text-base bg-transparent shadow-none h-auto py-2'
                >
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
          <div className='flex items-center justify-between gap-4 mb-6 sm:mb-8'>
            <div className='flex items-center gap-4 min-w-0 flex-1'>
              <span className='text-[10px] uppercase tracking-[0.3em] text-muted-foreground font-medium tabular-nums'>
                02
              </span>
              <span
                className='text-[10px] uppercase tracking-[0.3em] text-muted-foreground'
                aria-hidden='true'
              >
                —
              </span>
              <span className='font-serif italic text-xl sm:text-2xl text-foreground'>
                Položky
              </span>
              <span className='flex-1 h-px bg-border' aria-hidden='true' />
            </div>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={addItem}
              className='text-[11px] uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground'
            >
              <Plus className='mr-2 h-3.5 w-3.5' />
              Přidat položku
            </Button>
          </div>

          <div className='border border-border bg-card divide-y divide-border'>
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
                    <option value='Limpieza de apartamentos' />
                    <option value='Lavado de ropa' />
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
                    {formatCurrency(item.total)}
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
          <SectionLabel number='03' title='Souhrn' />
          <div className='border border-border bg-card px-6 py-8 sm:px-10 sm:py-10'>
            <div className='space-y-3 max-w-md ml-auto'>
              <SummaryRow
                label='Mezisoučet'
                value={formatCurrency(calculateSubtotal())}
              />
              <SummaryRow
                label={`DPH (${formData.tax_rate} %)`}
                value={formatCurrency(calculateTax())}
              />
              {Number.parseFloat(formData.retention_rate) > 0 && (
                <SummaryRow
                  label={`Retención (−${formData.retention_rate} %)`}
                  value={`−${formatCurrency(calculateRetention())}`}
                  destructive
                />
              )}
              <div className='flex items-baseline justify-between pt-4 border-t border-border'>
                <span className='text-[10px] uppercase tracking-[0.25em] text-muted-foreground'>
                  Celkem
                </span>
                <span className='font-serif text-3xl text-foreground tabular-nums'>
                  {formatCurrency(calculateTotal())}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section>
          <SectionLabel number='04' title='Poznámky' />
          <Textarea
            id='notes'
            value={formData.notes}
            onChange={(e) =>
              setFormData({ ...formData, notes: e.target.value })
            }
            rows={4}
            placeholder='Volitelná poznámka, která se objeví na faktuře…'
            className='border border-border bg-card rounded-md focus-visible:ring-1 focus-visible:ring-primary text-base resize-none'
          />
        </section>

        <div className='flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4 border-t border-border'>
          <Button
            type='button'
            variant='ghost'
            onClick={() => router.back()}
            disabled={isLoading}
            className='text-[11px] uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground'
          >
            Zrušit
          </Button>
          <Button
            type='submit'
            disabled={isLoading}
            className='text-[11px] uppercase tracking-[0.22em] shadow-none'
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
      <span className='text-[10px] uppercase tracking-[0.22em] text-muted-foreground'>
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
