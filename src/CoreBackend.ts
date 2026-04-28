/**
 * Backend resolution — picks native module or JS core at runtime.
 *
 * Priority:
 *   1. Native module (AppCatReactNative) — full signal fidelity via xcframework/AAR
 *   2. JS core (vendored dist from appcat-core-rn) — works in Expo Go / bare RN without native build
 *
 * The JS core is loaded from ../core/appcat-core-rn which is populated
 * by the closed-source build pipeline (same pattern as web SDK).
 *
 * Hardening: `resolveBackend()` never throws. It returns `null` when no
 * backend is available; callers in `index.ts` surface that as either an
 * `AppCatError('NO_BACKEND', ...)` rejection (for `init`) or a swallowed
 * fallback (for best-effort calls). Every import/require here is guarded.
 */

import AppCatModule from './NativeAppCat';

export interface CoreBackend {
  readonly isNative: boolean;

  configure(
    appId: string,
    apiKey: string,
    options: Record<string, any>,
  ): Promise<{
    deepLinkParams: Record<string, string> | null;
    geo: { city: string | null; country: string | null; state: string | null } | null;
  }>;

  identify(data: Record<string, any>): Promise<{
    geo: { city: string | null; country: string | null; state: string | null } | null;
    deepLinkParams: Record<string, string> | null;
  }>;

  sendEvent(
    eventName: string,
    params: Record<string, any>,
    options: Record<string, any>,
  ): void;

  getAttribution(): Promise<Record<string, any> | null>;

  getDeviceContext(): Promise<Record<string, any> | null>;

  getAppCatId(): Promise<string>;

  isDisabled(): Promise<boolean>;

  setLogLevel(level: number): void;

  setTrackingConsent(granted: boolean): Promise<void>;
}

type CoreExports = Partial<Record<keyof CoreBackend, unknown>>;

function _hasRequired(core: CoreExports): boolean {
  const required: ReadonlyArray<keyof CoreBackend> = [
    'configure',
    'identify',
    'sendEvent',
    'getAttribution',
    'getDeviceContext',
    'getAppCatId',
    'isDisabled',
    'setLogLevel',
    'setTrackingConsent',
  ];
  for (const key of required) {
    if (typeof core[key] !== 'function') return false;
  }
  return true;
}

function _loadJsCore(): CoreBackend | null {
  let core: CoreExports;
  try {
    // Vendored pre-built JS core — same pattern as appcat-web-sdk/core/
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    core = require('../core/appcat-core-rn') as CoreExports;
  } catch {
    return null;
  }
  if (!core || !_hasRequired(core)) return null;

  const c = core as Required<CoreExports>;
  return {
    isNative: false,
    configure: c.configure as CoreBackend['configure'],
    identify: c.identify as CoreBackend['identify'],
    sendEvent: c.sendEvent as CoreBackend['sendEvent'],
    getAttribution: c.getAttribution as CoreBackend['getAttribution'],
    getDeviceContext: c.getDeviceContext as CoreBackend['getDeviceContext'],
    getAppCatId: c.getAppCatId as CoreBackend['getAppCatId'],
    isDisabled: c.isDisabled as CoreBackend['isDisabled'],
    setLogLevel: c.setLogLevel as CoreBackend['setLogLevel'],
    setTrackingConsent: c.setTrackingConsent as CoreBackend['setTrackingConsent'],
  };
}

function _wrapNative(native: NonNullable<typeof AppCatModule>): CoreBackend {
  return {
    isNative: true,
    configure: native.configure.bind(native),
    identify: native.identify.bind(native),
    sendEvent: native.sendEvent.bind(native),
    getAttribution: native.getAttribution.bind(native),
    getDeviceContext: native.getDeviceContext.bind(native),
    getAppCatId: native.getAppCatId.bind(native),
    isDisabled: native.isDisabled.bind(native),
    setLogLevel: native.setLogLevel.bind(native),
    setTrackingConsent: native.setTrackingConsent.bind(native),
  };
}

/**
 * Cache the resolved backend after the first call.
 * Resolution itself is pure — failures are captured as `null` and retried
 * only after an explicit `resetBackend()` (test-only).
 */
let _resolved: CoreBackend | null = null;
let _resolvedOnce = false;

/**
 * Resolve the best available backend, or `null` if none is usable.
 *
 * Never throws — inspect the return value. Callers in `index.ts` decide
 * whether a missing backend is fatal (init) or silent (best-effort calls).
 */
export function resolveBackend(): CoreBackend | null {
  if (_resolvedOnce) return _resolved;
  _resolvedOnce = true;

  try {
    if (AppCatModule) {
      _resolved = _wrapNative(AppCatModule);
      return _resolved;
    }
  } catch {
    // fall through to JS core
  }

  try {
    const jsCore = _loadJsCore();
    if (jsCore) {
      _resolved = jsCore;
      return _resolved;
    }
  } catch {
    // fall through
  }

  _resolved = null;
  return null;
}

/** Reset for testing. */
export function resetBackend(): void {
  _resolved = null;
  _resolvedOnce = false;
}
