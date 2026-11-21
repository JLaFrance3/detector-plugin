import { chipText } from './ui-bridge';

describe('chipText', () => {
  it('REQ-UI-002: Definite, Likely and the neutral marker differ by text', () => {
    expect(chipText('definite')).toBe('AI');
    expect(chipText('likely')).toBe('AI?');
    expect(chipText('none')).toBe('i');
  });

  it('REQ-UI-003: the neutral marker is never a checkmark', () => {
    expect(chipText('none')).not.toMatch(/[\u2713\u2714\u2705\u2611]/);
  });
});
