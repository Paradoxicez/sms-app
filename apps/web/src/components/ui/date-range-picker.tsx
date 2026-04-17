"use client"

import * as React from "react"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"
import { type DateRange } from "react-day-picker"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface DateRangePickerProps {
  dateRange?: DateRange
  onDateRangeChange: (range: DateRange | undefined) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  numberOfMonths?: number
}

function DateRangePicker({
  dateRange,
  onDateRangeChange,
  placeholder = "Pick a date range",
  disabled = false,
  className,
  numberOfMonths = 2,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false)

  function formatDateRange(): string {
    if (!dateRange?.from) return placeholder
    if (dateRange.to) {
      return `${format(dateRange.from, "MMM d, yyyy")} - ${format(dateRange.to, "MMM d, yyyy")}`
    }
    return `${format(dateRange.from, "MMM d, yyyy")} - ...`
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            disabled={disabled}
            className={cn(
              "w-[300px] justify-start text-left font-normal",
              !dateRange?.from && "text-muted-foreground",
              className
            )}
          />
        }
      >
        <CalendarIcon className="mr-2 size-4" />
        {formatDateRange()}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={dateRange}
          onSelect={(range) => {
            onDateRangeChange(range)
            if (range?.from && range?.to) {
              setOpen(false)
            }
          }}
          numberOfMonths={numberOfMonths}
        />
      </PopoverContent>
    </Popover>
  )
}

export { DateRangePicker }
export type { DateRangePickerProps }
