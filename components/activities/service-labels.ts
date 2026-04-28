import type { ServiceType } from "@/lib/types"

export const SERVICE_LABELS: Record<ServiceType, string> = {
  cleaning: "Úklid",
  laundry: "Praní",
  apartment_service: "Servis apartmánu",
}

export const SERVICE_OPTIONS: { value: ServiceType; label: string }[] = [
  { value: "cleaning", label: SERVICE_LABELS.cleaning },
  { value: "laundry", label: SERVICE_LABELS.laundry },
  { value: "apartment_service", label: SERVICE_LABELS.apartment_service },
]
