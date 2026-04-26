import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { TagsCell } from '../tags-cell';

/**
 * Phase 22 Plan 22-08 — Wave 5 D-14 / D-15 / D-18 contract.
 *
 * - Up to 3 alphabetized badges
 * - +N overflow chip when tags > 3
 * - Tooltip header `All tags ({N})` + full alphabetized comma-separated list
 * - Empty array renders nothing (no placeholder)
 * - +N chip is keyboard-reachable (tabIndex=0) with aria-label `Show all {N} tags`
 * - Custom maxVisible prop overrides default (3)
 * - Display casing preserved (no lowercasing on render)
 */
describe('Phase 22: TagsCell ≤3 + overflow tooltip', () => {
  it('empty array renders nothing visible', () => {
    const { container } = render(<TagsCell tags={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('single tag renders one badge', () => {
    render(<TagsCell tags={['outdoor']} />);
    expect(screen.getByText('outdoor')).toBeInTheDocument();
    // No +N overflow chip should mount
    expect(screen.queryByText(/^\+\d+$/)).toBeNull();
  });

  it('renders badges in alphabetical (case-insensitive) order', () => {
    const { container } = render(
      <TagsCell tags={['outdoor', 'entrance', 'perimeter']} />,
    );
    const badges = Array.from(container.querySelectorAll('span'))
      .map((el) => el.textContent ?? '')
      .filter((t) => ['outdoor', 'entrance', 'perimeter'].includes(t));
    expect(badges).toEqual(['entrance', 'outdoor', 'perimeter']);
  });

  it('renders 3 badges + "+2" overflow chip when count > 3', () => {
    render(<TagsCell tags={['a', 'b', 'c', 'd', 'e']} />);
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();
    expect(screen.getByText('c')).toBeInTheDocument();
    // Visible-cell (TooltipTrigger) of overflow chip — at minimum present in DOM
    expect(screen.getAllByText('+2').length).toBeGreaterThanOrEqual(1);
    // +5 / +4 chip should NOT be present
    expect(screen.queryByText('d')).toBeNull();
    expect(screen.queryByText('e')).toBeNull();
  });

  it('+N overflow chip is keyboard-focusable with aria-label "Show all N tags"', () => {
    render(<TagsCell tags={['a', 'b', 'c', 'd', 'e']} />);
    const chip = screen.getByLabelText('Show all 5 tags');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveAttribute('tabindex', '0');
  });

  it('overflow tooltip mounts on focus and shows header "All tags (N)" + full list', async () => {
    render(<TagsCell tags={['outdoor', 'entrance', 'perimeter', 'lobby', 'lot-A']} />);
    const chip = screen.getByLabelText('Show all 5 tags');
    fireEvent.focus(chip);
    // Wait a tick for base-ui tooltip portal to mount
    await new Promise((r) => setTimeout(r, 50));
    // Header
    const headers = await screen.findAllByText(/All tags \(5\)/);
    expect(headers.length).toBeGreaterThanOrEqual(1);
    // Full alphabetized list
    const fullList = await screen.findAllByText(
      'entrance, lobby, lot-A, outdoor, perimeter',
    );
    expect(fullList.length).toBeGreaterThanOrEqual(1);
  });

  it('respects custom maxVisible prop (e.g. 2 → 2 badges + "+2")', () => {
    render(<TagsCell tags={['a', 'b', 'c', 'd']} maxVisible={2} />);
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();
    expect(screen.queryByText('c')).toBeNull();
    expect(screen.queryByText('d')).toBeNull();
    expect(screen.getAllByText('+2').length).toBeGreaterThanOrEqual(1);
  });

  it('tag values render in their original casing (no lowercasing)', () => {
    render(<TagsCell tags={['Lobby', 'Entrance']} />);
    expect(screen.getByText('Lobby')).toBeInTheDocument();
    expect(screen.getByText('Entrance')).toBeInTheDocument();
    expect(screen.queryByText('lobby')).toBeNull();
    expect(screen.queryByText('entrance')).toBeNull();
  });
});
