"use client"

import { useEffect, useRef, useState } from "react"
import { Search, X } from "lucide-react"

import { Input } from "@/components/ui/input"

interface TreeSearchProps {
  value: string
  onChange: (value: string) => void
}

export function TreeSearch({ value, onChange }: TreeSearchProps) {
  const [localValue, setLocalValue] = useState(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setLocalValue(value)
  }, [value])

  function handleChange(newValue: string) {
    setLocalValue(newValue)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      onChange(newValue)
    }, 200)
  }

  function handleClear() {
    setLocalValue("")
    onChange("")
  }

  return (
    <div className="relative px-2 py-2">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        value={localValue}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Search hierarchy..."
        className="pl-8 pr-8 h-8 text-sm"
      />
      {localValue && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
