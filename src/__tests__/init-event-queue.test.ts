/**
 * Events sent while init() is in flight.
 *
 * init() only resolves once the backend has finished configuring, which can
 * take seconds. Events fired in that window must be held and delivered in
 * order, not dropped.
 */
import { NativeModules } from 'react-native';
import AppCat, { AppCatError } from '../index';

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
  sendEvent: jest.Mock;
};

const validConfig = { appId: 'test-app-id', apiKey: 'test-api-key' };

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Starts init() with a configure call that stays pending until released. */
function startHeldInit(config: Parameters<typeof AppCat.init>[0] = validConfig) {
  const configure = deferred<{ deepLinkParams: null }>();
  nativeMock.configure.mockReturnValueOnce(configure.promise);
  const init = AppCat.init(config);
  return { configure, init };
}

/** Event ids delivered to the backend, in delivery order. */
function deliveredIds(): unknown[] {
  return nativeMock.sendEvent.mock.calls.map((call) => call[2].eventId);
}

let debugSpy: jest.SpyInstance;
let warnSpy: jest.SpyInstance;

beforeEach(() => {
  AppCat.reset();
  jest.clearAllMocks();
  debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  debugSpy.mockRestore();
  warnSpy.mockRestore();
});

describe('sendEvent() while init() is in flight', () => {
  it('holds events until init resolves, then delivers them in call order', async () => {
    const { configure, init } = startHeldInit();

    AppCat.sendEvent('ViewContent', { eventId: 'e1' });
    AppCat.sendEvent('AddToCart', { eventId: 'e2' });
    AppCat.sendEvent('Purchase', { eventId: 'e3', value: 9.99, currency: 'USD' });

    expect(nativeMock.sendEvent).not.toHaveBeenCalled();
    expect(AppCat.isInitialized()).toBe(false);

    configure.resolve({ deepLinkParams: null });
    await init;

    expect(deliveredIds()).toEqual(['e1', 'e2', 'e3']);
  });

  it('delivers held events before any event sent after init resolved', async () => {
    const { configure, init } = startHeldInit();
    AppCat.sendEvent('ViewContent', { eventId: 'during-1' });
    AppCat.sendEvent('ViewContent', { eventId: 'during-2' });

    configure.resolve({ deepLinkParams: null });
    await init;
    AppCat.sendEvent('ViewContent', { eventId: 'after' });

    expect(deliveredIds()).toEqual(['during-1', 'during-2', 'after']);
  });

  it('keeps the params / options split and snapshots the payload at call time', async () => {
    const { configure, init } = startHeldInit();
    const payload = { orderId: 'ord_1', value: 9.99, currency: 'USD', eventId: 'purchase_1' };

    AppCat.sendEvent('Purchase', payload);
    payload.orderId = 'mutated-after-call';

    configure.resolve({ deepLinkParams: null });
    await init;

    expect(nativeMock.sendEvent).toHaveBeenCalledTimes(1);
    expect(nativeMock.sendEvent).toHaveBeenCalledWith(
      'Purchase',
      { orderId: 'ord_1' },
      { value: 9.99, currency: 'USD', eventId: 'purchase_1', eventTimeUnix: expect.any(Number) },
    );
  });

  it('does not report NOT_CONFIGURED for held events', async () => {
    const onError = jest.fn();
    const { configure, init } = startHeldInit({ ...validConfig, onError });

    AppCat.sendEvent('ViewContent', { eventId: 'e1' });

    configure.resolve({ deepLinkParams: null });
    await init;

    expect(onError).not.toHaveBeenCalled();
  });

  it('a held event that throws on delivery does not block the rest', async () => {
    const onError = jest.fn();
    const { configure, init } = startHeldInit({ ...validConfig, onError });
    AppCat.sendEvent('ViewContent', { eventId: 'e1' });
    AppCat.sendEvent('ViewContent', { eventId: 'e2' });
    AppCat.sendEvent('ViewContent', { eventId: 'e3' });

    const boom = new Error('native crash');
    nativeMock.sendEvent.mockImplementationOnce(() => {
      throw boom;
    });
    configure.resolve({ deepLinkParams: null });
    await expect(init).resolves.toEqual({ deepLinkParams: null });

    expect(deliveredIds()).toEqual(['e1', 'e2', 'e3']);
    expect(onError).toHaveBeenCalledWith(boom);
  });
});

describe('event time of held events', () => {
  const T0_MS = Date.UTC(2026, 0, 15, 12, 0, 0);
  const T0 = Math.floor(T0_MS / 1000);
  const TWENTY_MINUTES_MS = 20 * 60 * 1000;
  let nowSpy: jest.SpyInstance;

  beforeEach(() => {
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(T0_MS);
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  it('is the time sendEvent() was called, not the time of delivery', async () => {
    const { configure, init } = startHeldInit();
    AppCat.sendEvent('Purchase', { eventId: 'p1', value: 9.99, currency: 'USD' });

    nowSpy.mockReturnValue(T0_MS + 5000);
    AppCat.sendEvent('ViewContent', { eventId: 'v1' });

    nowSpy.mockReturnValue(T0_MS + TWENTY_MINUTES_MS);
    configure.resolve({ deepLinkParams: null });
    await init;

    expect(nativeMock.sendEvent.mock.calls.map((c) => c[2].eventTimeUnix)).toEqual([T0, T0 + 5]);
    // It is an option for the core, never a custom param.
    expect(nativeMock.sendEvent.mock.calls[0][1]).toEqual({});
  });

  it('survives a rejected init and a retry 20 minutes later', async () => {
    const first = startHeldInit();
    AppCat.sendEvent('Purchase', { eventId: 'p1', value: 9.99, currency: 'USD' });
    first.configure.reject(new Error('offline'));
    await expect(first.init).rejects.toBeInstanceOf(AppCatError);

    nowSpy.mockReturnValue(T0_MS + TWENTY_MINUTES_MS);
    await AppCat.init(validConfig);

    expect(nativeMock.sendEvent).toHaveBeenCalledWith(
      'Purchase',
      {},
      { eventId: 'p1', value: 9.99, currency: 'USD', eventTimeUnix: T0 },
    );
  });

  it('a host-supplied eventTimeUnix wins over the enqueue time', async () => {
    const { configure, init } = startHeldInit();
    AppCat.sendEvent('Purchase', { eventId: 'p1', eventTimeUnix: 1700000000 });

    configure.resolve({ deepLinkParams: null });
    await init;

    expect(nativeMock.sendEvent).toHaveBeenCalledWith(
      'Purchase',
      {},
      { eventId: 'p1', eventTimeUnix: 1700000000 },
    );
  });

  it.each([[0], [-1], ['1700000000'], [null], [Number.NaN]])(
    'an unusable host value (%j) falls back to the enqueue time',
    async (bad) => {
      const { configure, init } = startHeldInit();
      AppCat.sendEvent('Purchase', { eventId: 'p1', eventTimeUnix: bad as unknown as number });

      nowSpy.mockReturnValue(T0_MS + TWENTY_MINUTES_MS);
      configure.resolve({ deepLinkParams: null });
      await init;

      expect(nativeMock.sendEvent.mock.calls[0][2].eventTimeUnix).toBe(T0);
    },
  );

  it('events sent after init are passed through unstamped (the core stamps them)', async () => {
    await AppCat.init(validConfig);

    AppCat.sendEvent('ViewContent', { eventId: 'v1' });
    AppCat.sendEvent('ViewContent', { eventId: 'v2', eventTimeUnix: 1700000000 });

    expect(nativeMock.sendEvent.mock.calls.map((c) => [c[1], c[2]])).toEqual([
      [{}, { eventId: 'v1' }],
      [{}, { eventId: 'v2', eventTimeUnix: 1700000000 }],
    ]);
  });
});

describe('sendEvent() before init() is called (unchanged behaviour)', () => {
  it('drops the event; a later init does not deliver it', async () => {
    AppCat.sendEvent('ViewContent', { eventId: 'too-early' });

    await AppCat.init(validConfig);

    expect(nativeMock.sendEvent).not.toHaveBeenCalled();
  });
});

describe('when init() rejects', () => {
  it('keeps held events and delivers them, in order, when a later init succeeds', async () => {
    const first = startHeldInit();
    AppCat.sendEvent('ViewContent', { eventId: 'e1' });
    AppCat.sendEvent('ViewContent', { eventId: 'e2' });

    first.configure.reject(new Error('network down'));
    await expect(first.init).rejects.toBeInstanceOf(AppCatError);

    expect(nativeMock.sendEvent).not.toHaveBeenCalled();
    expect(AppCat.isInitialized()).toBe(false);

    const retry = startHeldInit();
    AppCat.sendEvent('ViewContent', { eventId: 'e3' });
    retry.configure.resolve({ deepLinkParams: null });
    await retry.init;

    expect(deliveredIds()).toEqual(['e1', 'e2', 'e3']);
  });

  it('drops events sent after the rejection while no init is in flight', async () => {
    const onError = jest.fn();
    const first = startHeldInit({ ...validConfig, onError });
    first.configure.reject(new Error('network down'));
    await expect(first.init).rejects.toBeInstanceOf(AppCatError);

    AppCat.sendEvent('ViewContent', { eventId: 'between-attempts' });

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'NOT_CONFIGURED' }));

    await AppCat.init(validConfig);
    expect(nativeMock.sendEvent).not.toHaveBeenCalled();
  });

  it('never throws from sendEvent and never delivers twice', async () => {
    const first = startHeldInit();
    expect(() => AppCat.sendEvent('ViewContent', { eventId: 'e1' })).not.toThrow();
    first.configure.reject(new Error('network down'));
    await expect(first.init).rejects.toBeInstanceOf(AppCatError);

    await AppCat.init(validConfig);
    await AppCat.init(validConfig); // idempotent once initialized

    expect(deliveredIds()).toEqual(['e1']);
  });
});

describe('pending-event cap', () => {
  const CAP = 100;

  it('holds at most 100 events, dropping the oldest with a debug log', async () => {
    const { configure, init } = startHeldInit();
    for (let i = 0; i < CAP + 5; i += 1) {
      AppCat.sendEvent('ViewContent', { eventId: `e${i}` });
    }

    configure.resolve({ deepLinkParams: null });
    await init;

    const expected = Array.from({ length: CAP }, (_, i) => `e${i + 5}`);
    expect(deliveredIds()).toEqual(expected);
    expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('Dropping the oldest'));
    expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('Dropped 5 event(s)'));
  });

  it('does not log when the cap is not reached', async () => {
    const { configure, init } = startHeldInit();
    for (let i = 0; i < CAP; i += 1) {
      AppCat.sendEvent('ViewContent', { eventId: `e${i}` });
    }

    configure.resolve({ deepLinkParams: null });
    await init;

    expect(nativeMock.sendEvent).toHaveBeenCalledTimes(CAP);
    expect(debugSpy).not.toHaveBeenCalled();
  });

  it('still applies across a rejected init and its retry', async () => {
    const first = startHeldInit();
    for (let i = 0; i < CAP; i += 1) {
      AppCat.sendEvent('ViewContent', { eventId: `a${i}` });
    }
    first.configure.reject(new Error('network down'));
    await expect(first.init).rejects.toBeInstanceOf(AppCatError);

    const retry = startHeldInit();
    AppCat.sendEvent('ViewContent', { eventId: 'b0' });
    retry.configure.resolve({ deepLinkParams: null });
    await retry.init;

    const ids = deliveredIds();
    expect(ids).toHaveLength(CAP);
    expect(ids[0]).toBe('a1');
    expect(ids[CAP - 1]).toBe('b0');
  });
});

describe('reset()', () => {
  it('discards held events', async () => {
    const first = startHeldInit();
    AppCat.sendEvent('ViewContent', { eventId: 'e1' });
    first.configure.reject(new Error('network down'));
    await expect(first.init).rejects.toBeInstanceOf(AppCatError);

    AppCat.reset();
    await AppCat.init(validConfig);

    expect(nativeMock.sendEvent).not.toHaveBeenCalled();
  });
});
