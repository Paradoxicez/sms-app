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
    <div className="relative rounded-md bg-[hsl(0,0%,9%)] p-4">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleCopy}
        className="absolute right-2 top-2 h-7 text-xs text-white/70 hover:text-white hover:bg-white/10"
      >
        {copied ? (
          <>
            <Check className="mr-1 h-3 w-3" />
            Copied!
          </>
        ) : (
          <>
            <Copy className="mr-1 h-3 w-3" />
            Copy
          </>
        )}
      </Button>
      <pre className="overflow-x-auto text-sm leading-relaxed">
        <code className="font-mono text-xs text-white/90 whitespace-pre">
          {code}
        </code>
      </pre>
    </div>
  );
}
