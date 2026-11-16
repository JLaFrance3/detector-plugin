import { MAX_TEXT_LENGTH, sanitizeText } from './sanitize-text';

/** Builds a string from code points so this file contains no invisible characters. */
const cp = (...codes: number[]): string => String.fromCodePoint(...codes);

const RLO = cp(0x202e); // right-to-left override
const ZWSP = cp(0x200b); // zero-width space
const GRIN = cp(0x1f600); // an emoji outside the basic plane (a surrogate pair in UTF-16)

describe('sanitizeText', () => {
  it('REQ-SEC-001: keeps ordinary text unchanged', () => {
    expect(sanitizeText('Adobe Photoshop 26.9.0')).toBe('Adobe Photoshop 26.9.0');
    expect(sanitizeText(`Caf${cp(0xe9)} M${cp(0xfc)}nchen ${cp(0x6771, 0x4eac)}`)).toBe(
      `Caf${cp(0xe9)} M${cp(0xfc)}nchen ${cp(0x6771, 0x4eac)}`,
    );
  });

  it('REQ-SEC-001: keeps HTML/script injection as inert plain text', () => {
    const attack = '<img src=x onerror=alert(1)><script>alert(document.cookie)</script>';
    // Nothing is parsed or rewritten: the UI shows this literally through interpolation.
    expect(sanitizeText(attack)).toBe(attack);
  });

  it('REQ-SEC-001: removes control characters', () => {
    const input = `Evil${cp(0x00)}Corp${cp(0x07)}${cp(0x1b)}[31m${cp(0x7f)}${cp(0x9f)}`;
    expect(sanitizeText(input)).toBe('EvilCorp[31m');
  });

  it('REQ-SEC-001: removes bidi override characters used to spoof names', () => {
    // "Adobe" followed by an override that would visually reverse the rest of the name.
    expect(sanitizeText(`Adobe${RLO}gnp.exe`)).toBe('Adobegnp.exe');
    const marks = [0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069];
    const input = `a${marks.map((m) => cp(m)).join('')}b${cp(0x200e)}${cp(0x200f)}${cp(0x61c)}c`;
    expect(sanitizeText(input)).toBe('abc');
  });

  it('REQ-SEC-001: removes zero-width and other invisible characters', () => {
    const input = `Ad${ZWSP}o${cp(0x200c)}b${cp(0x200d)}e${cp(0xfeff)} ${cp(0x2060)}Inc${cp(0xad)}`;
    expect(sanitizeText(input)).toBe('Adobe Inc');
    // Tag characters can smuggle hidden text.
    expect(sanitizeText(`ok${cp(0xe0041, 0xe0042, 0xe007f)}`)).toBe('ok');
  });

  it('REQ-SEC-001: collapses whitespace including newlines and tabs', () => {
    const input = `  Signed\n\n by\t\tsomeone ${cp(0xa0)}${cp(0x2003)}${cp(0x2028)} else  `;
    expect(sanitizeText(input)).toBe('Signed by someone else');
  });

  it('REQ-SEC-001: caps very long strings at 120 characters', () => {
    expect(MAX_TEXT_LENGTH).toBe(120);
    expect(sanitizeText('A'.repeat(100_000))).toHaveLength(120);
    expect(Array.from(sanitizeText('word '.repeat(1000)) ?? '').length).toBeLessThanOrEqual(120);
    expect(sanitizeText('abcdef', 3)).toBe('abc');
  });

  it('REQ-SEC-001: does not split a surrogate pair when truncating', () => {
    const clean = sanitizeText(GRIN.repeat(200)) ?? '';
    expect(Array.from(clean)).toHaveLength(120);
    expect(clean.endsWith(GRIN)).toBe(true);
  });

  it('REQ-SEC-001: removes lone surrogates', () => {
    const input = `a${String.fromCharCode(0xd800)}b${String.fromCharCode(0xdc00)}c`;
    expect(sanitizeText(input)).toBe('abc');
  });

  it('REQ-SEC-001: stays fast on a huge string of removable characters', () => {
    const started = performance.now();
    expect(sanitizeText(ZWSP.repeat(5_000_000))).toBeNull();
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('REQ-SEC-001: returns null for non-strings and empty results', () => {
    expect(sanitizeText(undefined)).toBeNull();
    expect(sanitizeText(null)).toBeNull();
    expect(sanitizeText(42)).toBeNull();
    expect(sanitizeText({ toString: () => 'x' })).toBeNull();
    expect(sanitizeText(['a'])).toBeNull();
    expect(sanitizeText(` ${ZWSP}${cp(0x00)}\n `)).toBeNull();
  });
});
