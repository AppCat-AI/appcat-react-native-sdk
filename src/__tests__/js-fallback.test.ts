/**
 * Tests for the JS core fallback path.
 *
 * Simulates Expo Go where NativeModules.AppCatReactNative is unavailable
 * and the JS core from ../core/appcat-core-rn is used instead.
 */

// Mock react-native WITHOUT the AppCatReactNative native module
jest.mock('react-native', () => ({
  NativeModules: {},
  TurboModuleRegistry: {
    getEnforcing: jest.fn(() => {
      throw new Error('TurboModule not available');
    }),
  },
  Platform: { OS: 'ios', select: (obj: any) => obj.ios ?? obj.default ?? '' },
}));

// Mock the vendored JS core (simulates the built dist in core/)
const jsCoreMock = {
  configure: jest.fn().mockResolvedValue({ deepLinkParams: null }),
  identify: jest.fn().mockResolvedValue(null),
  sendEvent: jest.fn(),
  getAttribution: jest.fn().mockResolvedValue(null),
  getDeviceContext: jest.fn().mockResolvedValue(null),
  getAppCatId: jest.fn().mockResolvedValue('js-fallback-id'),
  isDisabled: jest.fn().mockResolvedValue(false),
  setLogLevel: jest.fn(),
  setTrackingConsent: jest.fn().mockResolvedValue(undefined),
};

jest.mock('../../core/appcat-core-rn', () => jsCoreMock);

import AppCat from '../index';

const validConfig = {
  appId: 'test-app-id',
  apiKey: 'test-api-key',
};

beforeEach(() => {
  AppCat.reset();
  jest.clearAllMocks();
});

describe('JS fallback backend', () => {
  it('initializes using JS core when native module is unavailable', async () => {
    await AppCat.init(validConfig);

    expect(AppCat.isInitialized()).toBe(true);
    expect(AppCat.isNativeBackend()).toBe(false);
    expect(jsCoreMock.configure).toHaveBeenCalledWith(
      'test-app-id',
      'test-api-key',
      expect.objectContaining({ isDebug: false, logLevel: 1, customerUserId: null }),
    );
  });

  it('init() returns { deepLinkParams } from configure', async () => {
    const deepLinkParams = { promo: 'summer', ref: 'tiktok' };
    jsCoreMock.configure.mockResolvedValueOnce({ deepLinkParams });

    const result = await AppCat.init(validConfig);

    expect(jsCoreMock.configure).toHaveBeenCalledWith(
      'test-app-id',
      'test-api-key',
      expect.any(Object),
    );
    expect(result).toEqual({ deepLinkParams });
  });

  it('init() returns { deepLinkParams: null } when no match', async () => {
    jsCoreMock.configure.mockResolvedValueOnce({ deepLinkParams: null });
    const result = await AppCat.init(validConfig);
    expect(result).toEqual({ deepLinkParams: null });
  });

  it('identify() delegates to JS core', async () => {
    await AppCat.init(validConfig);
    const profile = { source: 'paid' };
    jsCoreMock.identify.mockResolvedValueOnce(profile);

    const result = await AppCat.identify({ userId: 'u1' });

    expect(jsCoreMock.identify).toHaveBeenCalledWith({ userId: 'u1' });
    expect(result).toEqual(profile);
  });

  it('sendEvent() delegates to JS core', async () => {
    await AppCat.init(validConfig);
    AppCat.sendEvent('Purchase', { revenue: 9.99, currency: 'USD' });

    expect(jsCoreMock.sendEvent).toHaveBeenCalledWith(
      'Purchase',
      { revenue: 9.99 },
      { currency: 'USD' },
    );
  });

  it('getAppCatId() returns JS-generated id', async () => {
    await AppCat.init(validConfig);
    const id = await AppCat.getAppCatId();

    expect(jsCoreMock.getAppCatId).toHaveBeenCalled();
    expect(id).toBe('js-fallback-id');
  });

  it('onError callback works with JS fallback', async () => {
    const onError = jest.fn();
    await AppCat.init({ ...validConfig, onError });
    const err = new Error('identify fail');
    jsCoreMock.identify.mockRejectedValueOnce(err);

    const result = await AppCat.identify({ userId: 'u1' });

    expect(onError).toHaveBeenCalledWith(err);
    expect(result).toBeNull();
  });

  it('initializes with apiKey only (no appId)', async () => {
    await AppCat.init({ apiKey: 'key-only' });

    expect(AppCat.isInitialized()).toBe(true);
    expect(jsCoreMock.configure).toHaveBeenCalledWith(
      '',
      'key-only',
      expect.any(Object),
    );
  });
});
