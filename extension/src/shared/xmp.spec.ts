import { findXmpSourceTypes, readXmpAiSource } from './xmp';

const IPTC = 'http://cv.iptc.org/newscodes/digitalsourcetype/';
const encoder = new TextEncoder();

/** A minimal JPEG: SOI, an APP1 segment holding the XMP packet, some scan bytes, EOI. */
function jpegWithXmp(xmpBody: string): Uint8Array {
  const packet = encoder.encode(
    `http://ns.adobe.com/xap/1.0/\0<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>` +
      `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">` +
      xmpBody +
      `</rdf:RDF></x:xmpmeta><?xpacket end="w"?>`,
  );
  const length = packet.length + 2;
  return Uint8Array.from([
    0xff,
    0xd8, // SOI
    0xff,
    0xe1,
    length >> 8,
    length & 0xff, // APP1
    ...packet,
    0xff,
    0xda,
    0x00,
    0x02,
    0x12,
    0x34,
    0x56, // start of scan with a few data bytes
    0xff,
    0xd9, // EOI
  ]);
}

const description = (inner: string, attrs = ''): string =>
  `<rdf:Description rdf:about="" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" ${attrs}>${inner}</rdf:Description>`;

describe('readXmpAiSource', () => {
  it('REQ-F-004: detects trainedAlgorithmicMedia written as an attribute', () => {
    const file = jpegWithXmp(
      description('', `Iptc4xmpExt:DigitalSourceType="${IPTC}trainedAlgorithmicMedia"`),
    );
    expect(readXmpAiSource(file)).toBe('generated');
  });

  it('REQ-F-004: detects compositeWithTrainedAlgorithmicMedia written as an element', () => {
    const file = jpegWithXmp(
      description(
        `<Iptc4xmpExt:DigitalSourceType>${IPTC}compositeWithTrainedAlgorithmicMedia</Iptc4xmpExt:DigitalSourceType>`,
      ),
    );
    expect(readXmpAiSource(file)).toBe('edited');
  });

  it('REQ-F-004: detects the rdf:resource form and single quotes', () => {
    const resource = jpegWithXmp(
      description(`<Iptc4xmpExt:DigitalSourceType rdf:resource="${IPTC}trainedAlgorithmicMedia"/>`),
    );
    expect(readXmpAiSource(resource)).toBe('generated');
    const single = jpegWithXmp(
      description('', `Iptc4xmpExt:DigitalSourceType = '${IPTC}trainedAlgorithmicMedia'`),
    );
    expect(readXmpAiSource(single)).toBe('generated');
  });

  it('REQ-F-004: works for XMP in a PNG iTXt chunk', () => {
    const xmp = encoder.encode(
      `XML:com.adobe.xmp\0\0\0\0\0<x:xmpmeta>${description('', `Iptc4xmpExt:DigitalSourceType="${IPTC}trainedAlgorithmicMedia"`)}</x:xmpmeta>`,
    );
    const png = Uint8Array.from([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
      0,
      0,
      0,
      xmp.length,
      0x69,
      0x54,
      0x58,
      0x74, // length + "iTXt"
      ...xmp,
      0,
      0,
      0,
      0, // CRC (not checked)
    ]);
    expect(readXmpAiSource(png)).toBe('generated');
  });

  it('REQ-F-004: returns null for untagged samples', () => {
    expect(readXmpAiSource(jpegWithXmp(description('<dc:title>Holiday</dc:title>')))).toBeNull();
    expect(readXmpAiSource(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]))).toBeNull();
    expect(readXmpAiSource(new Uint8Array(0))).toBeNull();
  });

  it('REQ-F-004: other source types are not AI', () => {
    const camera = jpegWithXmp(
      description('', `Iptc4xmpExt:DigitalSourceType="${IPTC}digitalCapture"`),
    );
    expect(findXmpSourceTypes(camera)).toEqual([`${IPTC}digitalCapture`]);
    expect(readXmpAiSource(camera)).toBeNull();
  });

  it('REQ-F-004: generated wins when several values are present', () => {
    const file = jpegWithXmp(
      description(
        `<Iptc4xmpExt:DigitalSourceType>${IPTC}digitalCapture</Iptc4xmpExt:DigitalSourceType>`,
        `Iptc4xmpExt:DigitalSourceType="${IPTC}trainedAlgorithmicMedia"`,
      ),
    );
    expect(readXmpAiSource(file)).toBe('generated');
  });

  it('REQ-SEC-001: hostile values are ignored, not interpreted', () => {
    const values = [
      `http://evil.example/trainedAlgorithmicMedia`,
      `${IPTC}trainedAlgorithmicMedia&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;`,
      'x'.repeat(5000),
      '',
    ];
    for (const value of values) {
      const file = jpegWithXmp(description('', `Iptc4xmpExt:DigitalSourceType="${value}"`));
      expect(readXmpAiSource(file)).toBeNull();
    }
    // The property name with nothing parseable after it.
    expect(readXmpAiSource(encoder.encode('DigitalSourceType DigitalSourceType='))).toBeNull();
  });

  it('REQ-NF-001: scans a large file quickly', () => {
    const big = new Uint8Array(20 * 1024 * 1024).fill(0x44); // 20 MB of "D"
    const started = performance.now();
    expect(readXmpAiSource(big)).toBeNull();
    expect(performance.now() - started).toBeLessThan(1500);
  });
});
