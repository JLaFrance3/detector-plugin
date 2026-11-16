// REQ-SEC-001: turns an untrusted string into bounded plain text.
// Characters are classified by code point number rather than with regular expressions so the
// rules are explicit and the source file itself contains no invisible characters.

export const MAX_TEXT_LENGTH = 120;

type CodePointRange = readonly [from: number, to: number];

const inRanges = (ranges: readonly CodePointRange[], cp: number): boolean =>
  ranges.some(([from, to]) => cp >= from && cp <= to);

/** Characters that become a single space. */
const WHITESPACE: readonly CodePointRange[] = [
  [0x09, 0x0d], // tab, line feed, vertical tab, form feed, carriage return
  [0x20, 0x20], // space
  [0x85, 0x85], // next line
  [0xa0, 0xa0], // no-break space
  [0x1680, 0x1680], // ogham space mark
  [0x2000, 0x200a], // en quad to hair space
  [0x2028, 0x2029], // line and paragraph separators
  [0x202f, 0x202f], // narrow no-break space
  [0x205f, 0x205f], // medium mathematical space
  [0x3000, 0x3000], // ideographic space
];

/** Characters that are removed. */
const REMOVED: readonly CodePointRange[] = [
  [0x00, 0x1f], // C0 controls (whitespace ones are matched first, above)
  [0x7f, 0x9f], // delete and C1 controls
  [0xad, 0xad], // soft hyphen
  [0x61c, 0x61c], // Arabic letter mark (bidi)
  [0x180e, 0x180e], // Mongolian vowel separator
  [0x200b, 0x200f], // zero-width space/joiners, left-to-right and right-to-left marks
  [0x202a, 0x202e], // bidi embeddings and overrides
  [0x2060, 0x206f], // word joiner, invisible operators, bidi isolates, deprecated formats
  [0xd800, 0xdfff], // lone surrogates (paired ones arrive as one code point above 0xFFFF)
  [0xfe00, 0xfe0f], // variation selectors
  [0xfeff, 0xfeff], // byte order mark / zero-width no-break space
  [0xfff9, 0xfffb], // interlinear annotation controls
  [0xfffe, 0xffff], // noncharacters
  [0xe0000, 0xe007f], // tag characters
  [0xe0100, 0xe01ef], // variation selectors supplement
];

/**
 * Returns safe plain text, or null when the value is not a string or nothing printable is
 * left: control, bidirectional and invisible characters removed, whitespace collapsed, at
 * most `maxLength` characters (code points). Markup is deliberately not stripped: it is
 * harmless as text and the UI never parses it (REQ-SEC-002).
 */
export function sanitizeText(value: unknown, maxLength = MAX_TEXT_LENGTH): string | null {
  if (typeof value !== 'string') return null;

  let out = '';
  let length = 0;
  let pendingSpace = false;
  let scanned = 0;
  // Iterating a string yields whole code points, so surrogate pairs are never split.
  for (const char of value.normalize('NFC')) {
    // Bound the work on hostile input that is mostly removable characters.
    if (++scanned > maxLength * 50 || length >= maxLength) break;
    const cp = char.codePointAt(0) ?? 0;
    if (inRanges(WHITESPACE, cp)) {
      pendingSpace = length > 0;
      continue;
    }
    if (inRanges(REMOVED, cp)) continue;
    if (pendingSpace) {
      if (length + 1 >= maxLength) break;
      out += ' ';
      length++;
      pendingSpace = false;
    }
    out += char;
    length++;
  }
  return out === '' ? null : out;
}
