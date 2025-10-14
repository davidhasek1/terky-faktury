import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(amount)
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat("cs-CZ").format(new Date(date))
}

export function formatDateTime(date: string): string {
  const d = new Date(date)
  console.log("[v0] formatDateTime input:", date)
  console.log("[v0] formatDateTime parsed:", d.toString())
  console.log("[v0] formatDateTime ISO:", d.toISOString())

  return new Intl.DateTimeFormat("cs-CZ", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d)
}
