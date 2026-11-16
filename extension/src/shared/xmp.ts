// REQ-F-004: reads the IPTC digital source type from unsigned XMP metadata.
// Pure function over the file bytes, so it works for JPEG (APP1), PNG (iTXt) and WebP (XMP
// chunk) alike without a parser for each container: an XMP packet is plain UTF-8 XML embedded
// in the file. Everything found here is unverified and attacker-controlled.
import { strongestAiSource } from './sanitize';
import type { AiSource } from './types';

/** XMP property name, e.g. Iptc4xmpExt:DigitalSourceType. */
const NEEDLE = Array.from('DigitalSourceType', (c) => c.charCodeAt(0));
const MAX_OCCURRENCES = 16;
const VALUE_WINDOW = 300;

// The value follows the property name in one of three XMP serializations:
//   attribute:      Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/..."
//   element:        <Iptc4xmpExt:DigitalSourceType>http://cv.iptc.org/...</...>
//   resource:       <Iptc4xmpExt:DigitalSourceType rdf:resource="http://cv.iptc.org/..."/>
const VALUE =
  /^(?:\s*=\s*["']([^"'<>]{1,200})["']|\s*>\s*([^<>]{1,200})<|\s+rdf:resource\s*=\s*["']([^"'<>]{1,200})["'])/;

function indexOfBytes(haystack: Uint8Array, needle: readonly number[], from: number): number {
  const first = needle[0] ?? -1;
  let i = haystack.indexOf(first, from);
  outer: while (i !== -1 && i + needle.length <= haystack.length) {
    for (let j = 1; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        i = haystack.indexOf(first, i + 1);
        continue outer;
      }
    }
    return i;
  }
  return -1;
}

/** Every digital source type value written in the file's XMP, unvalidated. */
export function findXmpSourceTypes(bytes: Uint8Array): string[] {
  const values: string[] = [];
  let at = indexOfBytes(bytes, NEEDLE, 0);
  while (at !== -1 && values.length < MAX_OCCURRENCES) {
    const start = at + NEEDLE.length;
    const window = bytes.subarray(start, start + VALUE_WINDOW);
    // Latin-1 keeps one character per byte; the values of interest are ASCII URIs.
    const text = String.fromCharCode(...window);
    const match = VALUE.exec(text);
    const value = match?.[1] ?? match?.[2] ?? match?.[3];
    if (value !== undefined) values.push(value.trim());
    at = indexOfBytes(bytes, NEEDLE, start);
  }
  return values;
}

/** The AI source type declared in the file's unsigned XMP metadata, if any. */
export function readXmpAiSource(bytes: Uint8Array): AiSource | null {
  return strongestAiSource(findXmpSourceTypes(bytes));
}
