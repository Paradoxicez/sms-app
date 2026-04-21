/**
 * Escape the five HTML-dangerous characters for safe interpolation into
 * raw HTML strings (e.g. `L.divIcon({ html })`, aria-label attributes,
 * or any server-rendered markup where user-provided text is embedded
 * without a framework's automatic escaping).
 *
 * Use this ONLY when interpolating into HTML strings. React JSX already
 * escapes by default — do not wrap JSX children with escapeHtml.
 *
 * Handles null/undefined defensively by returning the empty string.
 */
const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(str: string | null | undefined): string {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}
