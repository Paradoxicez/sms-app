'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface DomainListEditorProps {
  domains: string[];
  onChange: (domains: string[]) => void;
}

function isValidDomain(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.includes(' ')) return false;
  if (trimmed === '*') return true;
  if (!trimmed.includes('.')) return false;
  return true;
}

export function DomainListEditor({ domains, onChange }: DomainListEditorProps) {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    const trimmed = input.trim();
    if (!trimmed) return;

    if (!isValidDomain(trimmed)) {
      setError('Invalid domain pattern. Use format: example.com or *.example.com');
      return;
    }

    if (domains.includes(trimmed)) {
      setError('Domain already added');
      return;
    }

    setError(null);
    onChange([...domains, trimmed]);
    setInput('');
  }

  function handleRemove(domain: string) {
    onChange(domains.filter((d) => d !== domain));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder="example.com or *.example.com"
          className="flex-1"
        />
        <Button type="button" variant="outline" onClick={handleAdd}>
          Add Domain
        </Button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {domains.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {domains.map((domain) => (
            <Badge key={domain} variant="secondary" className="gap-1 pr-1">
              {domain}
              <button
                type="button"
                onClick={() => handleRemove(domain)}
                className="ml-1 rounded-full p-0.5 hover:bg-muted"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Empty = allow all domains
        </p>
      )}
    </div>
  );
}
