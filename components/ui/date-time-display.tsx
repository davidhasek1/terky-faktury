"use client"

interface DateTimeDisplayProps {
  date: string
  format?: "date" | "datetime"
}

export function DateTimeDisplay({ date, format = "datetime" }: DateTimeDisplayProps) {
  const d = new Date(date)

  if (format === "date") {
    return (
      <span>
        {d.toLocaleDateString("cs-CZ", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        })}
      </span>
    )
  }

  return (
    <span>
      {d.toLocaleDateString("cs-CZ", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })}{" "}
      {d.toLocaleTimeString("cs-CZ", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })}
    </span>
  )
}
