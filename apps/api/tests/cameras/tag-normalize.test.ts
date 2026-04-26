import { describe, it, expect } from 'vitest';
import {
  normalizeForDisplay,
  normalizeForDb,
  TagValidationError,
  TAG_MAX_LENGTH,
  TAG_MAX_PER_CAMERA,
} from '../../src/cameras/tag-normalize';

describe('Phase 22 / D-04 / D-05 — tag-normalize helpers', () => {
  describe('normalizeForDisplay', () => {
    it('trims and case-insensitively dedups, preserving first-seen casing', () => {
      // First occurrence ("  Lobby  ") wins after trim — subsequent "lobby"/"LOBBY" drop.
      expect(normalizeForDisplay(['  Lobby  ', 'lobby', 'LOBBY'])).toEqual([
        'Lobby',
      ]);
    });

    it('rejects empty and whitespace-only entries', () => {
      expect(normalizeForDisplay(['', '   ', 'a'])).toEqual(['a']);
    });

    it('throws TagValidationError("too_long") when any tag exceeds TAG_MAX_LENGTH', () => {
      expect(() => normalizeForDisplay(['x'.repeat(51)])).toThrow(
        TagValidationError,
      );
      try {
        normalizeForDisplay(['x'.repeat(51)]);
      } catch (e) {
        expect((e as TagValidationError).reason).toBe('too_long');
      }
    });

    it('throws TagValidationError("too_many") when count exceeds TAG_MAX_PER_CAMERA', () => {
      const tooMany = Array(21)
        .fill('')
        .map((_, i) => `t${i}`);
      expect(() => normalizeForDisplay(tooMany)).toThrow(TagValidationError);
      try {
        normalizeForDisplay(tooMany);
      } catch (e) {
        expect((e as TagValidationError).reason).toBe('too_many');
      }
    });
  });

  describe('normalizeForDb', () => {
    it('lowercases, trims, and dedups (case-insensitive); no length check', () => {
      expect(normalizeForDb(['Lobby', 'lobby ', 'LOBBY'])).toEqual(['lobby']);
    });

    it('Unicode-safe lowercasing (Café / CAFÉ → café)', () => {
      expect(normalizeForDb(['Café', 'CAFÉ'])).toEqual(['café']);
    });
  });

  describe('exported constants', () => {
    it('TAG_MAX_LENGTH === 50 and TAG_MAX_PER_CAMERA === 20', () => {
      expect(TAG_MAX_LENGTH).toBe(50);
      expect(TAG_MAX_PER_CAMERA).toBe(20);
    });
  });
});
