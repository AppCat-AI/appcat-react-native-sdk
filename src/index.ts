/**
 * @appcat/react-native-sdk
 *
 * Deferred deep link resolution and attribution for React Native apps.
 *
 * Supports two backends (resolved automatically):
 *   1. Native module (xcframework/AAR) — full signal fidelity, dev builds
 *   2. JS core (vendored bundle) — works in Expo Go, no native build needed
 *
 * Usage:
 *   import AppCat, { AppCatError } from '@appcat/react-native-sdk';
 *
 *   try {
 *     const { deepLinkParams, geo } = await AppCat.init({ appId: '...', apiKey: '...' });
 *   } catch (err) {
 *     if (err instanceof AppCatError) { console.warn(err.code); }
 *   }
 *   const identity = await AppCat.identify({ userId: '...', email: '...' }); // never throws
 *   AppCat.sendEvent('Purchase', { value: 9.99, currency: 'USD' });          // fire-and-forget
 *   const attr = await AppCat.getAttribution();                              // null on any failure
 *   const id = await AppCat.getAppCatId();                                   // '' on any failure
 *
 * Hardening contract:
 *   - `init()` is the ONLY method that rejects (with `AppCatError`).
 *   - Every other method swallows errors, invokes `onError` if provided,
 *     and returns a typed fallback. The host app is never taken down by
 *     an unhandled promise rejection from this SDK.
 */

import { resolveBackend, resetBackend, type CoreBackend } from './CoreBackend';
import type {
  AppCatConfig,
  InitResponse,
  IdentifyResponse,
  IdentifyData,
  EventName,
  SendEventParams,
  AttributionProfile,
  DeviceContext,
} from './types';
import { AppCatError, LogLevel } from './types';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const EVENT_OPTIONS_KEYS = new Set(['eventId', 'value', 'currency', 'testEventCode']);

/**
 * Splits a flat SendEventParams object into the two-arg shape the core bridge
 * expects: { params } (custom_data) and { options } (eventId/value/currency).
 */
function splitEventParams(flat: SendEventParams): {
  params: Record<string, unknown>;
  options: Record<string, unknown>;
} {
  const params: Record<string, unknown> = {};
  const options: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(flat)) {
    if (val === undefined) continue;
    if (EVENT_OPTIONS_KEYS.has(key)) {
      options[key] = val;
    } else {
      params[key] = val;
    }
  }
  return { params, options };
}

function _describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  try { return String(err); } catch { return 'unknown error'; }
}

function _logWarn(msg: string): void {
  if (__DEV__) {
    try {
      // eslint-disable-next-line no-console
      console.warn(msg);
    } catch {
      // console can throw in exotic runtimes — ignore
    }
  }
}

function _reportError(err: unknown): void {
  if (!_onError) return;
  try {
    _onError(err instanceof Error ? err : new Error(_describe(err)));
  } catch {
    // host callback itself threw — never let that crash us
  }
}

/**
 * Safely resolve the backend. Returns `null` if unavailable; callers
 * decide whether that's fatal (init) or silent (best-effort).
 */
function _backend(): CoreBackend | null {
  try {
    return resolveBackend();
  } catch (err) {
    _reportError(err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// SDK state
// ---------------------------------------------------------------------------

let initialized = false;
let _onError: ((error: Error) => void) | undefined;
let _isNativeBackend = false;

const EMPTY_INIT_RESPONSE: InitResponse = { deepLinkParams: null, geo: null };
const EMPTY_IDENTIFY_RESPONSE: IdentifyResponse = { geo: null, deepLinkParams: null };

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const AppCat = {
  /**
   * Initialize the SDK and create the attribution profile.
   *
   * This is the one method that rejects (with `AppCatError`) so the host
   * app can observe setup failures. Subsequent calls are idempotent.
   *
   * @throws {AppCatError} with codes `INVALID_API_KEY`, `NO_BACKEND`,
   *   or `CONFIGURE_FAILED` (wrapping the underlying cause).
   */
  async init(cfg: AppCatConfig): Promise<InitResponse> {
    if (initialized) return EMPTY_INIT_RESPONSE;

    if (!cfg || typeof cfg.apiKey !== 'string' || cfg.apiKey.length === 0) {
      throw new AppCatError(
        'INVALID_API_KEY',
        '[@appcat/react-native-sdk] apiKey is required.',
      );
    }

    if (cfg.onError) {
      _onError = cfg.onError;
    }

    const backend = _backend();
    if (!backend) {
      throw new AppCatError(
        'NO_BACKEND',
        '[@appcat/react-native-sdk] No backend available.\n\n' +
          'Either:\n' +
          '  - Link the native module (pod install / rebuild) for full signal fidelity\n' +
          '  - Ensure the JS core is vendored in node_modules/@appcat/react-native-sdk/core/\n',
      );
    }
    _isNativeBackend = backend.isNative;

    let result: InitResponse;
    try {
      const options: Record<string, unknown> = {
        isDebug: cfg.isDebug ?? false,
        logLevel: cfg.logLevel ?? LogLevel.INFO,
        customerUserId: cfg.customerUserId ?? null,
      };
      result = (await backend.configure(
        cfg.appId ?? '',
        cfg.apiKey,
        options,
      )) as InitResponse;
    } catch (err) {
      // Preserve typed errors from the core; wrap everything else.
      if (err instanceof AppCatError) throw err;
      if (err instanceof Error && typeof (err as { code?: unknown }).code === 'string') {
        // Native promise rejection carries a stable string code.
        throw new AppCatError(
          'CONFIGURE_FAILED',
          err.message || 'configure() failed',
          err,
        );
      }
      throw new AppCatError(
        'CONFIGURE_FAILED',
        _describe(err) || 'configure() failed',
        err,
      );
    }

    if (cfg.logLevel !== undefined) {
      try {
        backend.setLogLevel(cfg.logLevel);
      } catch {
        // setLogLevel may not be available on older native builds
      }
    }

    initialized = true;
    return result ?? EMPTY_INIT_RESPONSE;
  },

  /**
   * Enrich the user profile with additional data.
   *
   * Best-effort: returns `null` before init or on any error. `onError`
   * is invoked when provided.
   */
  async identify(data: IdentifyData): Promise<IdentifyResponse | null> {
    if (!assertInitialized('identify')) return null;
    const backend = _backend();
    if (!backend) return null;
    try {
      const res = await backend.identify(data as Record<string, unknown>);
      return (res as IdentifyResponse) ?? EMPTY_IDENTIFY_RESPONSE;
    } catch (err) {
      _reportError(err);
      return null;
    }
  },

  /**
   * Track a conversion event. Fire-and-forget — never throws.
   *
   * Pass all event data in a single flat object. Reserved keys
   * (eventId, value, currency, testEventCode) are forwarded as options;
   * all other keys become custom_data on the event.
   *
   * @example
   * AppCat.sendEvent('ViewContent', { eventId: `vc_home_${sessionId}` });
   * AppCat.sendEvent('Purchase', { orderId, value: 9.99, currency: 'USD', eventId: `purchase_${orderId}` });
   */
  sendEvent(eventName: EventName, params?: SendEventParams): void {
    if (!assertInitialized('sendEvent')) return;
    try {
      if (__DEV__) {
        const revenueEvents: Set<string> = new Set(['Purchase', 'InitiateCheckout']);
        if (revenueEvents.has(eventName) && (params?.value == null || params?.currency == null)) {
          _logWarn(
            `[AppCat] '${eventName}' is missing value or currency. Meta and TikTok will silently drop this event without both fields.`,
          );
        }
      }
      const { params: customData, options } = splitEventParams(params ?? {});
      const backend = _backend();
      if (!backend) return;
      backend.sendEvent(eventName, customData, options);
    } catch (err) {
      _reportError(err);
    }
  },

  /**
   * Get cached attribution data.
   *
   * Returns the identify-cached profile if available, otherwise
   * the cached resolve attribution. Returns null if neither has run
   * or any error occurs.
   */
  async getAttribution(): Promise<AttributionProfile | null> {
    if (!assertInitialized('getAttribution')) return null;
    const backend = _backend();
    if (!backend) return null;
    try {
      return (await backend.getAttribution()) as AttributionProfile | null;
    } catch (err) {
      _reportError(err);
      return null;
    }
  },

  /**
   * Get cached device context.
   */
  async getDeviceContext(): Promise<DeviceContext | null> {
    if (!assertInitialized('getDeviceContext')) return null;
    const backend = _backend();
    if (!backend) return null;
    try {
      return (await backend.getDeviceContext()) as DeviceContext | null;
    } catch (err) {
      _reportError(err);
      return null;
    }
  },

  /**
   * Get the stable AppCat device identifier.
   * Returns IDFV on iOS, Android ID on Android. Empty string on any failure.
   */
  async getAppCatId(): Promise<string> {
    if (!assertInitialized('getAppCatId')) return '';
    const backend = _backend();
    if (!backend) return '';
    try {
      const id = await backend.getAppCatId();
      return typeof id === 'string' ? id : '';
    } catch (err) {
      _reportError(err);
      return '';
    }
  },

  /**
   * Check if the SDK has been remotely disabled (e.g. invalid API key,
   * server kill switch, compliance hold). Returns `false` on any failure.
   */
  async isDisabled(): Promise<boolean> {
    if (!assertInitialized('isDisabled')) return false;
    const backend = _backend();
    if (!backend) return false;
    try {
      return (await backend.isDisabled()) === true;
    } catch (err) {
      _reportError(err);
      return false;
    }
  },

  /**
   * Record the user's tracking-consent choice.
   *
   * Optional. Call after an ATT prompt, GDPR banner, or settings toggle.
   * When `granted` is false, AppCat stops forwarding certain PII fields
   * (e.g. email, phone) to ad networks on your behalf. Default behavior
   * (never calling this) is unchanged. Best-effort — never throws.
   */
  async setTrackingConsent(granted: boolean): Promise<void> {
    if (!assertInitialized('setTrackingConsent')) return;
    const backend = _backend();
    if (!backend) return;
    try {
      await backend.setTrackingConsent(granted === true);
    } catch (err) {
      _reportError(err);
    }
  },

  /**
   * Whether the SDK has been initialized.
   */
  isInitialized(): boolean {
    return initialized;
  },

  /**
   * Whether the SDK is using the native backend (true) or JS fallback (false).
   * Only valid after init() has been called.
   */
  isNativeBackend(): boolean {
    return _isNativeBackend;
  },

  /**
   * Reset all SDK state. Primarily for testing.
   */
  reset(): void {
    initialized = false;
    _onError = undefined;
    _isNativeBackend = false;
    resetBackend();
  },
};

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function assertInitialized(caller: string): boolean {
  if (!initialized) {
    const msg = `[@appcat/react-native-sdk] ${caller}() called before init(). Call AppCat.init() first.`;
    _logWarn(msg);
    _reportError(new AppCatError('NOT_CONFIGURED', msg));
    return false;
  }
  return true;
}

export default AppCat;

// Re-export types for consumers
export type {
  AppCatConfig,
  InitResponse,
  DeepLinkParams,
  AttributionProfile,
  IdentifyData,
  IdentifyResponse,
  EventName,
  SendEventParams,
  DeviceContext,
  AppCatErrorCode,
} from './types';
export { AppCatError, LogLevel } from './types';
