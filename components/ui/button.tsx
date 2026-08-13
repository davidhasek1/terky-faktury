import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-ring/40 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-sm shadow-primary/25 hover:bg-primary/90 hover:shadow-md hover:shadow-primary/25',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/20',
        outline:
          'border border-border bg-card hover:bg-accent hover:text-accent-foreground',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/70',
        ghost:
          'hover:bg-accent hover:text-accent-foreground',
        link: 'rounded-none text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-5 has-[>svg]:px-4',
        sm: 'h-8 gap-1.5 px-4 has-[>svg]:px-3',
        lg: 'h-12 px-7 text-base has-[>svg]:px-6',
        icon: 'size-10',
        'icon-sm': 'size-8',
        'icon-lg': 'size-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  children,
  disabled,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /**
     * Probíhá mutace. Vymění ikonu tlačítka za spinner a zamkne ho.
     *
     * Popisek se schválně nemění — „Uložit změny" zůstane „Uložit změny".
     * Přepisování na „Ukládám…" mění šířku tlačítka pod kurzorem a popisek
     * přestane pojmenovávat akci. Akce se má jmenovat stejně celou cestu.
     *
     * Ikony se předávají jako potomci, jako u každého jiného tlačítka;
     * spinner je na dobu načítání jen dočasně překryje.
     */
    loading?: boolean
  }) {
  // `asChild` tlačítko předává potomka beze změny. Slot přijímá právě jedno
  // dítě, takže sem nesmí přibýt ani spinner, ani prázdný výraz — `{false}`
  // vedle potomka z toho udělá pole a Slot spadne. Proto dvě samostatné větve
  // místo jednoho `<Comp>` se společným tělem.
  if (asChild) {
    return (
      <Slot
        data-slot="button"
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      >
        {children}
      </Slot>
    )
  }

  return (
    <button
      data-slot="button"
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(
        buttonVariants({ variant, size }),
        loading && '[&>svg:not([data-slot=spinner])]:hidden',
        className,
      )}
      {...props}
    >
      {loading && (
        <Loader2 data-slot="spinner" className="animate-spin" aria-hidden="true" />
      )}
      {children}
    </button>
  )
}

export { Button, buttonVariants }
