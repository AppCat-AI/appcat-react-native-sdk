import { NativeModules } from 'react-native';
import AppCat from '../index';

// ---------------------------------------------------------------------------
// Mock setup — native module available
// ---------------------------------------------------------------------------

jest.mock('react-native', () => ({
  NativeModules: {
    AppCatReactNative: {
      configure: jest.fn().mockResolvedValue({ deepLinkParams: null }),
      identify: jest.fn().mockResolvedValue(null),
      sendEvent: jest.fn(),
      getAttribution: jest.fn().mockResolvedValue(null),
      getDeviceContext: jest.fn().mockResolvedValue(null),
      getAppCatId: jest.fn().mockResolvedValue(''),
      isDisabled: jest.fn().mockResolvedValue(false),
      setLogLevel: jest.fn(),
      setTrackingConsent: jest.fn().mockResolvedValue(undefined),
    },
  },
  TurboModuleRegistry: {
    getEnforcing: jest.fn(() => {
      throw new Error('TurboModule not available in test');
    }),
  },
  Platform: { OS: 'ios', select: (obj: any) => obj.ios ?? obj.default ?? '' },
}));

const nativeMock = NativeModules.AppCatReactNative as {
  configure: jest.Mock;
  identify: jest.Mock;
  sendEvent: jest.Mock;
  getAttribution: jest.Mock;
  getDeviceContext: jest.Mock;
  getAppCatId: jest.Mock;
  isDisabled: jest.Mock;
  setLogLevel: jest.Mock;
  setTrackingConsent: jest.Mock;
};

const validConfig = {
  appId: 'test-app-id',
  apiKey: 'test-api-key',
};

beforeEach(() => {
  AppCat.reset();
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// init() — returns InitResponse { deepLinkParams }
// ---------------------------------------------------------------------------

describe('init()', () => {
  it('throws when apiKey is missing', async () => {
    await expect(
      AppCat.init({ apiKey: '' }),
    ).rejects.toThrow('apiKey is required');
  });

  it('calls NativeModules.configure with correct arguments', async () => {
    await AppCat.init(validConfig);

    expect(nativeMock.configure).toHaveBeenCalledWith(
      'test-app-id',
      'test-api-key',
      expect.objectContaining({ isDebug: false, logLevel: 1, customerUserId: null }),
    );
  });

  it('returns { deepLinkParams: null } when no match', async () => {
    nativeMock.configure.mockResolvedValueOnce({ deepLinkParams: null });
    const result = await AppCat.init(validConfig);
    expect(result).toEqual({ deepLinkParams: null });
  });

  it('returns { deepLinkParams } when match found', async () => {
    const deepLinkParams = { promo: 'summer', ref: 'tiktok' };
    nativeMock.configure.mockResolvedValueOnce({ deepLinkParams });
    const result = await AppCat.init(validConfig);
    expect(result).toEqual({ deepLinkParams });
  });

  it('passes empty appId to backend when not provided', async () => {
    await AppCat.init({ apiKey: 'test-api-key' });

    expect(nativeMock.configure).toHaveBeenCalledWith(
      '',
      'test-api-key',
      expect.any(Object),
    );
  });

  it('sets initialized state to true', async () => {
    expect(AppCat.isInitialized()).toBe(false);
    await AppCat.init(validConfig);
    expect(AppCat.isInitialized()).toBe(true);
  });

  it('reports native backend when native module is available', async () => {
    await AppCat.init(validConfig);
    expect(AppCat.isNativeBackend()).toBe(true);
  });

  it('is idempotent — second call returns empty InitResponse', async () => {
    nativeMock.configure.mockResolvedValueOnce({ deepLinkParams: { promo: 'summer' } });
    const first = await AppCat.init(validConfig);
    expect(first).toEqual({ deepLinkParams: { promo: 'summer' } });

    const second = await AppCat.init(validConfig);
    expect(second).toEqual({ deepLinkParams: null, geo: null });

    expect(nativeMock.configure).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// identify()
// ---------------------------------------------------------------------------

describe('identify()', () => {
  it('returns null before init', async () => {
    const result = await AppCat.identify({ userId: 'u1' });
    expect(result).toBeNull();
  });

  it('delegates to NativeModules.identify', async () => {
    await AppCat.init(validConfig);
    const profile = { source: 'paid', userId: 'u1' };
    nativeMock.identify.mockResolvedValueOnce(profile);

    const result = await AppCat.identify({ userId: 'u1', email: 'a@b.com' });

    expect(nativeMock.identify).toHaveBeenCalledWith({
      userId: 'u1',
      email: 'a@b.com',
    });
    expect(result).toEqual(profile);
  });

  it('returns null on error', async () => {
    await AppCat.init(validConfig);
    nativeMock.identify.mockRejectedValueOnce(new Error('fail'));

    const result = await AppCat.identify({ userId: 'u1' });

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// sendEvent()
// ---------------------------------------------------------------------------

describe('sendEvent()', () => {
  it('is a no-op before init (does not throw)', () => {
    expect(() => AppCat.sendEvent('Purchase', { value: 9.99, currency: 'USD' })).not.toThrow();
    expect(nativeMock.sendEvent).not.toHaveBeenCalled();
  });

  it('splits reserved keys into options, rest into params', async () => {
    await AppCat.init(validConfig);
    AppCat.sendEvent('Purchase', {
      orderId: 'ord_123',
      value: 9.99,
      currency: 'USD',
      eventId: 'purchase_ord_123',
    });

    expect(nativeMock.sendEvent).toHaveBeenCalledWith(
      'Purchase',
      { orderId: 'ord_123' },
      { value: 9.99, currency: 'USD', eventId: 'purchase_ord_123' },
    );
  });

  it('passes empty objects when params are omitted', async () => {
    await AppCat.init(validConfig);
    AppCat.sendEvent('ViewContent');

    expect(nativeMock.sendEvent).toHaveBeenCalledWith('ViewContent', {}, {});
  });

  it('never throws even if native module throws', async () => {
    await AppCat.init(validConfig);
    nativeMock.sendEvent.mockImplementationOnce(() => {
      throw new Error('native crash');
    });

    expect(() => AppCat.sendEvent('Purchase')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// getAttribution()
// ---------------------------------------------------------------------------

describe('getAttribution()', () => {
  it('returns null before init', async () => {
    const result = await AppCat.getAttribution();
    expect(result).toBeNull();
  });

  it('delegates to NativeModules.getAttribution', async () => {
    await AppCat.init(validConfig);
    const attr = { source: 'paid' };
    nativeMock.getAttribution.mockResolvedValueOnce(attr);

    const result = await AppCat.getAttribution();

    expect(nativeMock.getAttribution).toHaveBeenCalled();
    expect(result).toEqual(attr);
  });

  it('returns null on error', async () => {
    await AppCat.init(validConfig);
    nativeMock.getAttribution.mockRejectedValueOnce(new Error('fail'));

    const result = await AppCat.getAttribution();

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getDeviceContext()
// ---------------------------------------------------------------------------

describe('getDeviceContext()', () => {
  it('returns null before init', async () => {
    const result = await AppCat.getDeviceContext();
    expect(result).toBeNull();
  });

  it('delegates to NativeModules.getDeviceContext', async () => {
    await AppCat.init(validConfig);
    const ctx = { vendor_id: 'abc', os_version: '17.0' };
    nativeMock.getDeviceContext.mockResolvedValueOnce(ctx);

    const result = await AppCat.getDeviceContext();

    expect(nativeMock.getDeviceContext).toHaveBeenCalled();
    expect(result).toEqual(ctx);
  });

  it('returns null on error', async () => {
    await AppCat.init(validConfig);
    nativeMock.getDeviceContext.mockRejectedValueOnce(new Error('fail'));

    const result = await AppCat.getDeviceContext();

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isInitialized() / reset()
// ---------------------------------------------------------------------------

describe('isInitialized()', () => {
  it('returns false before init', () => {
    expect(AppCat.isInitialized()).toBe(false);
  });

  it('returns true after init', async () => {
    await AppCat.init(validConfig);
    expect(AppCat.isInitialized()).toBe(true);
  });
});

describe('reset()', () => {
  it('resets initialized state', async () => {
    await AppCat.init(validConfig);
    expect(AppCat.isInitialized()).toBe(true);

    AppCat.reset();
    expect(AppCat.isInitialized()).toBe(false);
  });

  it('allows re-initialization after reset', async () => {
    await AppCat.init(validConfig);
    AppCat.reset();
    await AppCat.init(validConfig);

    expect(nativeMock.configure).toHaveBeenCalledTimes(2);
    expect(AppCat.isInitialized()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// onError callback
// ---------------------------------------------------------------------------

describe('onError callback', () => {
  it('is called on identify error', async () => {
    const onError = jest.fn();
    await AppCat.init({ ...validConfig, onError });
    const err = new Error('identify fail');
    nativeMock.identify.mockRejectedValueOnce(err);

    await AppCat.identify({ userId: 'u1' });

    expect(onError).toHaveBeenCalledWith(err);
  });

  it('is called on sendEvent error', async () => {
    const onError = jest.fn();
    await AppCat.init({ ...validConfig, onError });
    const err = new Error('sendEvent fail');
    nativeMock.sendEvent.mockImplementationOnce(() => { throw err; });

    AppCat.sendEvent('Purchase', { value: 9.99, currency: 'USD', eventId: 'purchase_1' });

    expect(onError).toHaveBeenCalledWith(err);
  });

  it('is cleared after reset', async () => {
    const onError = jest.fn();
    await AppCat.init({ ...validConfig, onError });
    AppCat.reset();
    await AppCat.init(validConfig);

    nativeMock.identify.mockRejectedValueOnce(new Error('fail'));
    await AppCat.identify({ userId: 'u1' });

    expect(onError).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getAppCatId / isDisabled
// ---------------------------------------------------------------------------

describe('getAppCatId', () => {
  it('returns empty string before init', async () => {
    const id = await AppCat.getAppCatId();
    expect(id).toBe('');
  });

  it('delegates to native module', async () => {
    await AppCat.init(validConfig);
    nativeMock.getAppCatId.mockResolvedValueOnce('test-device-id');

    const id = await AppCat.getAppCatId();

    expect(nativeMock.getAppCatId).toHaveBeenCalled();
    expect(id).toBe('test-device-id');
  });
});

describe('isDisabled', () => {
  it('returns false before init', async () => {
    const disabled = await AppCat.isDisabled();
    expect(disabled).toBe(false);
  });

  it('delegates to native module', async () => {
    await AppCat.init(validConfig);
    nativeMock.isDisabled.mockResolvedValueOnce(false);

    const disabled = await AppCat.isDisabled();

    expect(nativeMock.isDisabled).toHaveBeenCalled();
    expect(disabled).toBe(false);
  });
});
