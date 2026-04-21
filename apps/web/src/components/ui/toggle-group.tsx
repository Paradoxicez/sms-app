"use client"

import * as React from "react"
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group"
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"
import { type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { toggleVariants } from "@/components/ui/toggle"

/**
 * Single/multiple toggle group with a shadcn-like API layered over @base-ui/react.
 *
 * Supports:
 *   <ToggleGroup type="single" value="7d" onValueChange={(v) => v && setRange(v)}>
 *   <ToggleGroup type="multiple" value={["a","b"]} onValueChange={(vals) => ...}>
 */

type ToggleGroupContextValue = {
  size: VariantProps<typeof toggleVariants>["size"]
  variant: VariantProps<typeof toggleVariants>["variant"]
}

const ToggleGroupContext = React.createContext<ToggleGroupContextValue>({
  size: "default",
  variant: "default",
})

type ToggleGroupSingleProps = {
  type: "single"
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
}

type ToggleGroupMultipleProps = {
  type: "multiple"
  value?: string[]
  defaultValue?: string[]
  onValueChange?: (value: string[]) => void
}

type ToggleGroupProps = (
  | ToggleGroupSingleProps
  | ToggleGroupMultipleProps
) &
  VariantProps<typeof toggleVariants> & {
    className?: string
    children?: React.ReactNode
    disabled?: boolean
  }

function ToggleGroup({
  className,
  variant = "default",
  size = "default",
  children,
  ...props
}: ToggleGroupProps) {
  const { type } = props

  // Normalize controlled/uncontrolled value to the array shape base-ui expects.
  const controlledArray = React.useMemo<string[] | undefined>(() => {
    if (type === "single") {
      const v = props.value
      if (v === undefined) return undefined
      return v === "" ? [] : [v]
    }
    return props.value
  }, [type, props.value])

  const defaultArray = React.useMemo<string[] | undefined>(() => {
    if (type === "single") {
      const dv = props.defaultValue
      if (dv === undefined) return undefined
      return dv === "" ? [] : [dv]
    }
    return props.defaultValue
  }, [type, props.defaultValue])

  const handleChange = React.useCallback(
    (vals: string[]) => {
      if (type === "single") {
        // Take the last-pressed value; empty array means nothing pressed.
        const next = vals.length > 0 ? vals[vals.length - 1] : ""
        props.onValueChange?.(next as string)
      } else {
        props.onValueChange?.(vals)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [type, props.onValueChange],
  )

  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      multiple={type === "multiple"}
      value={controlledArray}
      defaultValue={defaultArray}
      onValueChange={handleChange}
      disabled={props.disabled}
      className={cn(
        "group/toggle-group inline-flex items-center rounded-md data-[variant=outline]:shadow-xs",
        className,
      )}
    >
      <ToggleGroupContext.Provider value={{ variant, size }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive>
  )
}

type ToggleGroupItemProps = TogglePrimitive.Props<string> &
  VariantProps<typeof toggleVariants>

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  value,
  ...props
}: ToggleGroupItemProps) {
  const context = React.useContext(ToggleGroupContext)
  const resolvedVariant = variant ?? context.variant
  const resolvedSize = size ?? context.size

  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      data-variant={resolvedVariant}
      data-size={resolvedSize}
      role="radio"
      value={value}
      className={cn(
        toggleVariants({
          variant: resolvedVariant,
          size: resolvedSize,
        }),
        "min-w-0 flex-1 shrink-0 rounded-none shadow-none first:rounded-l-md last:rounded-r-md focus:z-10 focus-visible:z-10 data-[variant=outline]:border-l-0 data-[variant=outline]:first:border-l",
        className,
      )}
      {...props}
    >
      {children}
    </TogglePrimitive>
  )
}

export { ToggleGroup, ToggleGroupItem }
