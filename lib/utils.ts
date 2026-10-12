import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "EUR",
  }).format(amount)
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat("cs-CZ").format(new Date(date))
}

export function formatDateTime(date: string): string {
  return new Intl.DateTimeFormat("cs-CZ", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(date))
}

/** Počet s českým tvarem: 1 faktura, 2–4 faktury, 0 a 5+ faktur. */
export function countCs(count: number, one: string, few: string, many: string): string {
  const word = count === 1 ? one : count >= 2 && count <= 4 ? few : many
  return `${count} ${word}`
}

export const invoiceCount = (count: number) => countCs(count, "faktura", "faktury", "faktur")
export const expenseCount = (count: number) => countCs(count, "náklad", "náklady", "nákladů")
