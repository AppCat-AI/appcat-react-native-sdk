/**
 * TurboModule spec for AppCat React Native SDK.
 *
 * Supports both architectures:
 * - New Architecture (TurboModules / JSI) — direct native bindings, no JSON bridge
 * - Old Architecture (NativeModules) — JSON serialization bridge
 *
 * React Native 0.74+ uses TurboModules by default.
 *
 * Hardening: every access to `react-native` here is guarded. In exotic
 * runtimes (web bundles, snapshot builds, misconfigured metro) importing
 * `react-native` or calling `TurboModuleRegistry.get` can throw. We must
 * never let that crash the host app — if we can't find a native module we
 * fall back to `null` and the JS core takes over.
 */

import type { TurboModule } from 'react-native';

export interface Spec extends TurboModule {
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

/**
 * Resolve the native module defensively.
 *
 * Order of attempts:
 *   1. `TurboModuleRegistry.get` (non-enforcing — returns null if missing)
 *   2. `NativeModules.AppCatReactNative`
 *
 * Any access that throws (e.g. RN internals erroring on a malformed module
 * registry) is caught and falls through to the next strategy.
 */
function _loadNativeModule(): Spec | null {
  let rn: typeof import('react-native') | null = null;
  try {
    // Dynamic require — the static import above is types-only.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    rn = require('react-native');
  } catch {
    return null;
  }
  if (!rn) return null;

  try {
    const turbo = rn.TurboModuleRegistry;
    if (turbo && typeof turbo.get === 'function') {
      const mod = turbo.get<Spec>('AppCatReactNative');
      if (mod) return mod;
    }
  } catch {
    // ignore — fall through to NativeModules
  }

  try {
    const native = rn.NativeModules as Record<string, unknown> | undefined;
    const mod = native?.['AppCatReactNative'];
    if (mod && typeof mod === 'object') return mod as Spec;
  } catch {
    // ignore
  }

  return null;
}

const AppCatModule: Spec | null = _loadNativeModule();

export default AppCatModule;
