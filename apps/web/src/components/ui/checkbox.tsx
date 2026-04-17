"use client"

import * as React from "react"
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { cn } from "@/lib/utils"
import { CheckIcon, MinusIcon } from "lucide-react"

function Checkbox({
  className,
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  indeterminate,
  ...props
}: CheckboxPrimitive.Root.Props & {
  "aria-label"?: string
}) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      role="checkbox"
      checked={checked}
      defaultChecked={defaultChecked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      indeterminate={indeterminate}
      className={cn(
        "peer inline-flex size-4 shrink-0 items-center justify-center rounded-sm border border-input transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[checked]:bg-primary data-[checked]:border-primary data-[checked]:text-primary-foreground data-[indeterminate]:bg-primary data-[indeterminate]:border-primary data-[indeterminate]:text-primary-foreground",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center">
        {indeterminate ? (
          <MinusIcon className="size-3" />
        ) : (
          <CheckIcon className="size-3" />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
