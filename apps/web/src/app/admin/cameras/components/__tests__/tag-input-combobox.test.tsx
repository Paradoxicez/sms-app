import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { TagInputCombobox } from '../tag-input-combobox';

/**
 * Phase 22 Plan 22-07 — TagInputCombobox component tests.
 *
 * Reference:
 * - .planning/phases/22-camera-metadata-utilization-surface-tags-description-across-/22-UI-SPEC.md
 *   §"Chip combobox spec" (lines 280–319) — full behavioral contract
 * - 22-VALIDATION.md row 22-W2-COMBOBOX — D-08 / D-09 / D-04 / D-05
 *
 * Critical assertions:
 * - Validation messaging uses warning amber tokens (text-amber-700 / dark:text-amber-400),
 *   NEVER `text-destructive` (UI-SPEC Negative Assertion #2 lines 117–121).
 */

function getInput(): HTMLInputElement {
  // The chip-row input is the only top-level <input> rendered by the component.
  // Locate via the role="group" wrapper to skip any input cmdk renders inside the
  // popover when it's open (those are inside data-slot="command").
  const group = screen.getByRole('group', { name: /tags/i });
  const input = group.querySelector('input');
  if (!input) throw new Error('TagInputCombobox input not found');
  return input as HTMLInputElement;
}

describe('TagInputCombobox — initial render', () => {
  it('renders chips for current value', () => {
    render(
      <TagInputCombobox
        value={['Lobby', 'Outdoor']}
        onChange={() => {}}
        suggestions={[]}
      />,
    );
    expect(screen.getByText('Lobby')).toBeInTheDocument();
    expect(screen.getByText('Outdoor')).toBeInTheDocument();
  });

  it('renders an empty input alongside chips', () => {
    render(
      <TagInputCombobox
        value={['Lobby']}
        onChange={() => {}}
        suggestions={[]}
      />,
    );
    expect(getInput().value).toBe('');
  });
});

describe('TagInputCombobox — commit behaviour', () => {
  it('Enter commits a typed value as a new chip', () => {
    const onChange = vi.fn();
    render(<TagInputCombobox value={[]} onChange={onChange} suggestions={[]} />);
    const input = getInput();
    fireEvent.change(input, { target: { value: 'Entrance' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(['Entrance']);
  });

  it('comma commits a typed value as a new chip', () => {
    const onChange = vi.fn();
    render(<TagInputCombobox value={[]} onChange={onChange} suggestions={[]} />);
    const input = getInput();
    fireEvent.change(input, { target: { value: 'Entrance' } });
    fireEvent.keyDown(input, { key: ',' });
    expect(onChange).toHaveBeenCalledWith(['Entrance']);
  });

  it('Backspace on empty input removes the last chip', () => {
    const onChange = vi.fn();
    render(
      <TagInputCombobox
        value={['a', 'b']}
        onChange={onChange}
        suggestions={[]}
      />,
    );
    const input = getInput();
    expect(input.value).toBe('');
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(onChange).toHaveBeenCalledWith(['a']);
  });

  it('case-insensitive dedup is silent (no onChange, input cleared)', () => {
    const onChange = vi.fn();
    render(
      <TagInputCombobox
        value={['Lobby']}
        onChange={onChange}
        suggestions={[]}
      />,
    );
    const input = getInput();
    fireEvent.change(input, { target: { value: 'lobby' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
    // Input should be cleared after silent dedup.
    expect(input.value).toBe('');
  });
});

describe('TagInputCombobox — validation (warning amber, not destructive red)', () => {
  it('rejects tag longer than maxLength and shows amber warning copy', () => {
    const onChange = vi.fn();
    render(<TagInputCombobox value={[]} onChange={onChange} suggestions={[]} />);
    const input = getInput();
    const tooLong = 'a'.repeat(51);
    fireEvent.change(input, { target: { value: tooLong } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
    const err = screen.getByText('Tags must be 50 characters or fewer.');
    expect(err).toBeInTheDocument();
    // UI-SPEC Negative Assertion #2: amber, NOT destructive.
    expect(err.className).toMatch(/amber/);
    expect(err.className).not.toMatch(/destructive/);
  });

  it('rejects when count exceeds maxTags and shows amber warning copy', () => {
    const onChange = vi.fn();
    const twenty = Array.from({ length: 20 }, (_, i) => `t${i}`);
    render(
      <TagInputCombobox
        value={twenty}
        onChange={onChange}
        suggestions={[]}
      />,
    );
    const input = getInput();
    fireEvent.change(input, { target: { value: 'extra' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
    const err = screen.getByText('Maximum 20 tags per camera.');
    expect(err).toBeInTheDocument();
    expect(err.className).toMatch(/amber/);
    expect(err.className).not.toMatch(/destructive/);
  });
});

describe('TagInputCombobox — suggestions', () => {
  it('filters suggestions by case-insensitive substring of input', () => {
    render(
      <TagInputCombobox
        value={[]}
        onChange={() => {}}
        suggestions={['Lobby', 'Outdoor', 'Entrance']}
      />,
    );
    const input = getInput();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'l' } });
    // Lobby contains 'l' (case-insensitive); Outdoor/Entrance do not.
    expect(screen.getByText('Lobby')).toBeInTheDocument();
    // The other suggestion items should be filtered out from the list.
    expect(screen.queryByText('Outdoor')).toBeNull();
    expect(screen.queryByText('Entrance')).toBeNull();
  });

  it('clicking a suggestion commits it as a chip', () => {
    const onChange = vi.fn();
    render(
      <TagInputCombobox
        value={[]}
        onChange={onChange}
        suggestions={['Lobby']}
      />,
    );
    const input = getInput();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Lobb' } });
    const suggestion = screen.getByText('Lobby');
    fireEvent.click(suggestion);
    expect(onChange).toHaveBeenCalledWith(['Lobby']);
  });

  it('"+ Add" row visible only when query has no exact match', () => {
    render(
      <TagInputCombobox
        value={[]}
        onChange={() => {}}
        suggestions={['Lobby']}
      />,
    );
    const input = getInput();
    fireEvent.focus(input);

    // Substring match (no exact match) -> "+ Add" should NOT show because Lobby
    // is in the suggestions list filtered by substring 'lob'.
    fireEvent.change(input, { target: { value: 'lob' } });
    expect(screen.queryByText(/\+ Add "lob"/)).toBeNull();

    // Exact case-insensitive match -> "+ Add" should NOT show.
    fireEvent.change(input, { target: { value: 'lobby' } });
    expect(screen.queryByText(/\+ Add "lobby"/)).toBeNull();

    // No match -> "+ Add 'newtag'" should show.
    fireEvent.change(input, { target: { value: 'newtag' } });
    expect(screen.getByText(/\+ Add "newtag"/)).toBeInTheDocument();
  });
});

describe('TagInputCombobox — chip × button', () => {
  it('clicking × removes the chip and uses correct aria-label', () => {
    const onChange = vi.fn();
    render(
      <TagInputCombobox
        value={['Lobby', 'x']}
        onChange={onChange}
        suggestions={[]}
      />,
    );
    const removeBtn = screen.getByRole('button', { name: /remove tag lobby/i });
    expect(removeBtn).toBeInTheDocument();
    fireEvent.click(removeBtn);
    expect(onChange).toHaveBeenCalledWith(['x']);
  });
});

describe('TagInputCombobox — disabled', () => {
  it('disabled disables input and hides chip × buttons', () => {
    render(
      <TagInputCombobox
        value={['Lobby']}
        onChange={() => {}}
        suggestions={['Lobby', 'Outdoor']}
        disabled
      />,
    );
    expect(getInput()).toBeDisabled();
    // No remove button rendered when disabled.
    expect(screen.queryByRole('button', { name: /remove tag/i })).toBeNull();
  });
});
