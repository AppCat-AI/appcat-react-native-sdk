// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Stable error codes surfaced from the wrapper and both backends.
 *
 * Native bridges map their native errors to these same string codes
 * (see `ERR_NOT_CONFIGURED`, `ERR_INVALID_CONFIG`, ...). The JS core
 * also throws `AppCatError` with the same code shape so host apps can
 * branch on `.code` regardless of backend.
 */
export type AppCatErrorCode =
  | 'INVALID_API_KEY'
  | 'INVALID_CONFIG'
  | 'NOT_CONFIGURED'
  | 'NO_BACKEND'
  | 'SERIALIZE_FAILED'
  | 'SET_TRACKING_CONSENT_FAILED'
  | 'CONFIGURE_FAILED'
  | 'INTERNAL';

/**
 * Typed error thrown from `init()` (the only method that rejects).
 * All other public methods swallow + log and return typed fallbacks so
 * the host app never sees an unhandled promise rejection.
 */
export class AppCatError extends Error {
  readonly code: AppCatErrorCode;
  readonly cause?: unknown;

  constructor(code: AppCatErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'AppCatError';
    this.code = code;
    this.cause = cause;
  }
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface AppCatConfig {
  /** API key for authenticating with the AppCat server. */
  readonly apiKey: string;

  /**
   * App ID — resolved automatically from API key if omitted.
   * Only provide if you want to skip the server handshake.
   */
  readonly appId?: string;

  /** Enable debug logging (default: false). */
  readonly isDebug?: boolean;

  /** Log level: 0=DEBUG, 1=INFO, 2=WARN, 3=ERROR (default: 1). */
  readonly logLevel?: LogLevel;

  /** Optional customer user ID to associate with this device/session. */
  readonly customerUserId?: string | null;

  /**
   * Optional error callback. Called on non-fatal SDK errors instead of
   * throwing. If omitted, errors are silently swallowed (best-effort).
   */
  readonly onError?: (error: unknown) => void;
}

/** Log verbosity level. */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

// ---------------------------------------------------------------------------
// Init response
// ---------------------------------------------------------------------------

/** Query params from the original ad link URL. */
export type DeepLinkParams = Record<string, string | undefined>;

/** Geo data returned by the server based on the device's IP. */
export interface GeoResponse {
  /** City name, or null if unavailable. */
  readonly city: string | null;
  /** ISO country code, or null if unavailable. */
  readonly country: string | null;
  /** State/region/province, or null if unavailable. */
  readonly state: string | null;
}

/** Structured response from init() / configure(). */
export interface InitResponse {
  /** Deep link query params from the matched ad click URL, or null if no match. */
  readonly deepLinkParams: DeepLinkParams | null;
  /** Geo data resolved from the device's IP during attribution, or null if unavailable. */
  readonly geo: GeoResponse | null;
}

/** Structured response from identify(). */
export interface IdentifyResponse {
  /** Geo data from the attribution profile, or null if unavailable. */
  readonly geo: GeoResponse | null;
  /** Deep link params from the attribution profile, or null if none. */
  readonly deepLinkParams: DeepLinkParams | null;
}

// ---------------------------------------------------------------------------
// Attribution profile
// ---------------------------------------------------------------------------

/**
 * The full attribution profile.
 */
export type AttributionProfile = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Identify
// ---------------------------------------------------------------------------

export interface IdentifyData {
  readonly userId?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly name?: string;
  /** RevenueCat subscriber IDs for cross-referencing attribution on server-side events. */
  readonly revenueCatIds?: readonly string[];
  readonly geo?: {
    readonly city?: string;
    readonly countryCode?: string;
    readonly carrier?: string;
    readonly timezone?: string;
    readonly latitude?: number;
    readonly longitude?: number;
  };
  readonly customAttributes?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/** Standard event names. */
export type EventName =
  | 'MobileAppInstall'
  | 'ViewContent'
  | 'AddToCart'
  | 'InitiateCheckout'
  | 'StartTrial'
  | 'Subscribe'
  | 'Purchase'
  | 'CompleteRegistration'
  | 'Search'
  | (string & {}); // allow custom event names

/**
 * Parameters for a sendEvent call.
 *
 * Reserved keys (eventId, value, currency, testEventCode) are routed to the
 * options payload internally. All other keys become custom_data on the event.
 *
 * @example
 * AppCat.sendEvent('Purchase', { orderId: 'ord_1', value: 9.99, currency: 'USD', eventId: 'purchase_ord_1' });
 * AppCat.sendEvent('ViewContent', { eventId: `vc_home_${sessionId}` });
 */
export interface SendEventParams {
  readonly eventId?: string;
  readonly value?: number;
  readonly currency?: string;
  readonly testEventCode?: string | null;
  readonly [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Device context (opaque — fields collected internally by native SDK)
// ---------------------------------------------------------------------------

export type DeviceContext = Record<string, unknown>;
