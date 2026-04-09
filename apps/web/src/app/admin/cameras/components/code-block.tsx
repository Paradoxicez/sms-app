'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface CodeBlockProps {
  code: string;
  language?: string;
}

export function CodeBlock({ code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: do nothing
    }
  }

  return (
    <div className="relative rounded-md bg-[hsl(0,0%,9%)] p-3">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleCopy}
        className="absolute right-2 top-2 h-8 text-xs text-white/70 hover:text-white hover:bg-white/10"
      >
        {copied ? (
          <>
            <Check className="mr-1.5 h-3.5 w-3.5" />
            Copied!
          </>
        ) : (
          <>
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            Copy
          </>
        )}
      </Button>
      <pre className="overflow-x-auto pt-6">
        <code className="font-mono text-xs text-white whitespace-pre">
          {code}
        </code>
      </pre>
    </div>
  );
}
