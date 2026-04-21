import { describe, it, expect } from 'vitest';

import { escapeHtml } from './escape-html';

describe('escapeHtml', () => {
  it('escapes the five HTML-dangerous characters', () => {
    expect(escapeHtml('&')).toBe('&amp;');
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('>')).toBe('&gt;');
    expect(escapeHtml('"')).toBe('&quot;');
    expect(escapeHtml("'")).toBe('&#39;');
  });

  it('escapes mixed input', () => {
    expect(escapeHtml('<img src="x" onerror=\'alert(1)\'>')).toBe(
      '&lt;img src=&quot;x&quot; onerror=&#39;alert(1)&#39;&gt;',
    );
  });

  it('handles null/undefined defensively', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('leaves safe strings untouched', () => {
    expect(escapeHtml('Lobby Front Door')).toBe('Lobby Front Door');
  });
});
