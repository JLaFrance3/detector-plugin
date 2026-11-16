import { hostnameOf, isActiveOn, parseSettings, withSiteDisabled } from './settings';
import { DEFAULT_SETTINGS } from './types';

describe('settings', () => {
  it('REQ-F-010: defaults are on globally with the cloud second opinion off', () => {
    expect(DEFAULT_SETTINGS).toEqual({ enabled: true, disabledSites: [], cloudEnabled: false });
    expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('corrupt')).toEqual(DEFAULT_SETTINGS);
  });

  it('REQ-F-010: stored settings are validated field by field', () => {
    expect(
      parseSettings({
        enabled: false,
        cloudEnabled: 'yes',
        disabledSites: ['News.Example', 'news.example', 7, 'bad host!', '<script>'],
        extra: 1,
      }),
    ).toEqual({ enabled: false, cloudEnabled: false, disabledSites: ['news.example'] });
  });

  it('REQ-F-010: the global switch turns the extension off everywhere', () => {
    const off = parseSettings({ enabled: false });
    expect(isActiveOn(off, 'news.example')).toBe(false);
    expect(isActiveOn(parseSettings({}), 'news.example')).toBe(true);
  });

  it('REQ-F-010: a site can be switched off by hostname and back on', () => {
    const disabled = withSiteDisabled(DEFAULT_SETTINGS, 'Social.Example', true);
    expect(disabled.disabledSites).toEqual(['social.example']);
    expect(isActiveOn(disabled, 'social.example')).toBe(false);
    expect(isActiveOn(disabled, 'SOCIAL.example')).toBe(false);
    expect(isActiveOn(disabled, 'other.example')).toBe(true);
    // Switching it off twice does not duplicate the entry.
    expect(withSiteDisabled(disabled, 'social.example', true).disabledSites).toHaveLength(1);
    expect(withSiteDisabled(disabled, 'social.example', false).disabledSites).toEqual([]);
  });

  it('REQ-F-010: hostnames come from http(s) page URLs only', () => {
    expect(hostnameOf('https://Www.Example.com:8443/a?b#c')).toBe('www.example.com');
    expect(hostnameOf('http://127.0.0.1:5000/')).toBe('127.0.0.1');
    expect(hostnameOf('chrome://extensions')).toBeNull();
    expect(hostnameOf('file:///C:/page.html')).toBeNull();
    expect(hostnameOf('not a url')).toBeNull();
    expect(hostnameOf(undefined)).toBeNull();
  });
});
