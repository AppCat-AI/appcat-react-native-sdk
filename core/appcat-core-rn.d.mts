/**
 * AppCat Core (RN) — error types and defensive utilities.
 *
 * Host RN apps cannot tolerate unhandled promise rejections from an SDK:
 * LogBox overlays degrade DX and mask real app bugs. Every public API
 * boundary runs through `safely`/`guarded*` wrappers so no throw ever
 * escapes into the host runtime.
 */
type AppCatErrorCode = 'INVALID_API_KEY' | 'CONFIG_FETCH_FAILED' | 'NOT_CONFIGURED' | 'NETWORK_ERROR' | 'INTERNAL';
/**
 * Typed error surfaced to callers that MUST observe failure
 * (e.g. `configure()` rejecting on an invalid API key).
 */
declare class AppCatError extends Error {
    readonly code: AppCatErrorCode;
    readonly cause?: unknown;
    constructor(code: AppCatErrorCode, message: string, cause?: unknown);
}

/**
 * AppCat Core, React Native (JS fallback).
 *
 * Pure JS implementation of the AppCat native module interface.
 * Used when native modules (xcframework/AAR) are not available,
 * e.g. in Expo Go or bare RN without native AppCat build.
 *
 * Implements the same Spec as NativeAppCat.ts so the open-source
 * SDK can swap between native and JS backends transparently.
 *
 * Safety contract: no public API boundary may throw into the host app
 * runtime. Only `configure()` rejects, and it rejects with a typed
 * `AppCatError`. Every other method either returns a typed fallback
 * (null/empty/false) or is strictly fire-and-forget.
 */
interface Geo {
    city: string | null;
    country: string | null;
    state: string | null;
}
interface ConfigureResult {
    deepLinkParams: Record<string, string> | null;
    geo: Geo | null;
}
interface IdentifyResult {
    geo: Geo | null;
    deepLinkParams: Record<string, string> | null;
}
declare function configure(appId: string, apiKey: string, options: Record<string, unknown>): Promise<ConfigureResult>;
declare function identify(data: Record<string, unknown>): Promise<IdentifyResult>;
declare function sendEvent(eventName: string, params: Record<string, unknown>, options: Record<string, unknown>): void;
declare function getAttribution(): Promise<Record<string, unknown> | null>;
declare function getDeviceContext(): Promise<Record<string, unknown> | null>;
declare function getAppCatId(): Promise<string>;
declare function isDisabled(): Promise<boolean>;
declare function setLogLevel(level: number): void;
declare function getLogLevel(): number;
/**
 * Record the user's tracking-consent choice.
 *
 * When `granted = false`, the server stamps the attribution profile as
 * `trackingConsent: 'denied'` and the CAPI pipeline strips `em`/`ph`
 * from Meta/TikTok payloads. Default behavior (never called) is unchanged.
 */
declare function setTrackingConsent(granted: boolean): Promise<void>;
/**
 * Set device identity signals for resolve/sendEvent payloads.
 * Called by the host app when user profile loads.
 */
declare function setDeviceId(id: string): void;
declare function setUserGeo(geo: Record<string, unknown>): void;
/**
 * Reset all state. For testing only.
 */
declare function reset(): void;

export { AppCatError, type AppCatErrorCode, configure, getAppCatId, getAttribution, getDeviceContext, getLogLevel, identify, isDisabled, reset, sendEvent, setDeviceId, setLogLevel, setTrackingConsent, setUserGeo };
