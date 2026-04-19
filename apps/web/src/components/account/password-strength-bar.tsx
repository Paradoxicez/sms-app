"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Zxcvbn = (password: string) => { score: 0 | 1 | 2 | 3 | 4 };
export type StrengthLevel = "empty" | "weak" | "medium" | "strong";

interface Props {
  password: string;
}

export function PasswordStrengthBar({ password }: Props) {
  const [zxcvbn, setZxcvbn] = useState<Zxcvbn | null>(null);
  const [score, setScore] = useState<0 | 1 | 2 | 3 | 4 | null>(null);

  // Lazy load the heavy zxcvbn bundle on first mount. NO static top-level import.
  useEffect(() => {
    let alive = true;
    (async () => {
      const [core, common, en] = await Promise.all([
        import("@zxcvbn-ts/core"),
        import("@zxcvbn-ts/language-common"),
        import("@zxcvbn-ts/language-en"),
      ]);
      // Merge dictionaries + adjacency graph from language packs
      const zxcvbnOptions = (core as unknown as {
        zxcvbnOptions: {
          setOptions: (opts: Record<string, unknown>) => void;
        };
      }).zxcvbnOptions;
      zxcvbnOptions.setOptions({
        dictionary: {
          ...(common as { dictionary?: Record<string, unknown> }).dictionary,
          ...(en as { dictionary?: Record<string, unknown> }).dictionary,
        },
        graphs: (common as { adjacencyGraphs?: unknown }).adjacencyGraphs,
        translations: (en as { translations?: unknown }).translations,
      });
      const zx = (core as unknown as { zxcvbn: Zxcvbn }).zxcvbn;
      if (alive) setZxcvbn(() => zx);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Debounce scoring by 150ms
  useEffect(() => {
    if (!zxcvbn) {
      setScore(null);
      return;
    }
    if (!password) {
      setScore(null);
      return;
    }
    const t = setTimeout(() => setScore(zxcvbn(password).score), 150);
    return () => clearTimeout(t);
  }, [password, zxcvbn]);

  const level: StrengthLevel =
    score === null
      ? "empty"
      : score <= 1
        ? "weak"
        : score <= 3
          ? "medium"
          : "strong";

  const label = {
    empty: "Enter a password",
    weak: "Weak",
    medium: "Medium",
    strong: "Strong",
  }[level];

  const fillClass = {
    empty: "bg-muted",
    weak: "bg-destructive",
    medium: "bg-amber-500",
    strong: "bg-primary",
  }[level];

  const filledCount = { empty: 0, weak: 1, medium: 2, strong: 3 }[level];

  const labelClass = {
    empty: "text-muted-foreground",
    weak: "text-destructive",
    medium: "text-amber-600",
    strong: "text-primary",
  }[level];

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="flex items-center gap-2"
      data-testid="password-strength-bar"
      data-level={level}
    >
      <div className="flex flex-1 gap-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full",
              i < filledCount ? fillClass : "bg-muted",
            )}
          />
        ))}
      </div>
      <span className={cn("text-sm font-semibold", labelClass)}>{label}</span>
    </div>
  );
}
