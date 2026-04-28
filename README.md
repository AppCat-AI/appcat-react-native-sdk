# @appcat/react-native-sdk

Track events and attribute installs across Meta, TikTok, Google Ads, and Apple Search Ads. Resolve deferred deep links to route users to the right content after install.

## Overview

- Track standard and custom events across ad platforms
- Track revenue events with currency and value
- Resolve deferred deep links after install to route users to the right screen
- Support Apple Search Ads attribution signals on iOS when available
- Retrieve the AppCat device ID and attribution data
- Use the native backend in development/bare builds, with a JS fallback for Expo Go or runtimes without native modules

## Get an API Key

You need an AppCat API key (and optionally an App ID) before the SDK can run.

1. Sign up at [appcat.ai](https://appcat.ai).
2. Click **+ New Product** in the top right and create your app. Select the platforms your RN app targets (iOS, Android, or both).
3. In the sidebar, open **SDK Guides → API Key Management**.
4. Copy your **API Key**. The **App ID** is optional — it can be resolved automatically from the API key.

Pass these into `AppCat.init(...)` below.

## Features (with examples)

### Getting Started

Add your credentials to `.env` (Expo projects use the `EXPO_PUBLIC_` prefix):

```bash
EXPO_PUBLIC_APPCAT_APP_ID=your-app-id
EXPO_PUBLIC_APPCAT_API_KEY=your-api-key
```

#### 1. Init

Initialize the SDK with your credentials. This automatically creates the attribution profile and resolves any deferred deep links. `appId` is optional if the API key can resolve it from AppCat.

```typescript
import AppCat from '@appcat/react-native-sdk';

await AppCat.init({
  appId: process.env.EXPO_PUBLIC_APPCAT_APP_ID,
  apiKey: process.env.EXPO_PUBLIC_APPCAT_API_KEY,
});
```

#### 2. Deep Links

`init()` returns a response with deep link params from the matched ad click URL. Use this to route users to the right screen on first open.

```typescript
const response = await AppCat.init({
  appId: process.env.EXPO_PUBLIC_APPCAT_APP_ID,
  apiKey: process.env.EXPO_PUBLIC_APPCAT_API_KEY,
});
if (response.deepLinkParams) {
  // route user based on params
}
```

**Response:**

| Field | Type | Description |
|-------|------|-------------|
| `deepLinkParams` | `Record<string, string> \| null` | Query params from the matched ad click URL, or `null` if no match |
| `geo` | `{ city: string \| null, country: string \| null, state: string \| null } \| null` | Geo data. e.g. `{ city: "San Francisco", country: "US", state: "CA" }` |

### Event Tracking

```typescript
AppCat.sendEvent('Purchase', { item: 'premium_plan' });
AppCat.sendEvent('ViewContent', { category: 'shoes', productId: 'SKU-100' });
AppCat.sendEvent('CompleteRegistration');
```

### Revenue Tracking

```typescript
AppCat.sendEvent('Purchase', { item: 'annual_plan', value: 49.99, currency: 'USD' });
```

### Installation ID and Attribution

```typescript
const deviceId = await AppCat.getAppCatId();
const attribution = await AppCat.getAttribution();
```

### Apple Ads Attribution (iOS)

Apple Search Ads attribution signals are collected on iOS when available during SDK initialization. No app-side setup is required.

## Installation

```bash
npm install @appcat/react-native-sdk
```

> **Recommended:** Use an Expo development build or a bare React Native app for full native signal fidelity. Expo Go can use the bundled JS fallback, but native iOS/Android signals are limited.

### Expo (managed workflow with development build)

```bash
npx expo install @appcat/react-native-sdk
npx expo prebuild
npx expo run:ios
npx expo run:android
```

After installing, rebuild your development client. The native modules are linked automatically during `prebuild`. You do **not** need to run `pod install` manually — `expo prebuild` handles it.

If you already have a development build and just need to update the native side:

```bash
npx expo prebuild --clean
npx expo run:ios   # or run:android
```

### Bare React Native / Ejected Expo

```bash
npm install @appcat/react-native-sdk
cd ios && pod install
```

Then rebuild your app:

```bash
npx react-native run-ios
npx react-native run-android
```

### Android — No Additional Configuration

The closed-source `appcat-core.aar` is bundled inside the npm package under `android/libs/` and the SDK module's `build.gradle` declares a local `flatDir` repository to find it. No extra steps required for native Android builds.

### iOS — No Additional Configuration

CocoaPods dependencies (including the `AppCatCoreKit.xcframework`) are resolved automatically via the podspec bundled with the package.

## Platform Requirements

| Platform | Minimum Version |
|----------|----------------|
| iOS | 13.0+ |
| Android | 5.0+ (API 21) |
| React Native | 0.72+ |
| Expo SDK | 49+ (development build recommended; Expo Go uses JS fallback) |
| Node.js | 16+ |
| Java | 17+ for Android native builds |
| Swift | 5.10+ / Xcode 16+ for iOS native builds |

The package currently registers a bridge native module and defensively checks `TurboModuleRegistry` when available.

## Quick Start

Add credentials to `.env`:

```bash
EXPO_PUBLIC_APPCAT_APP_ID=your-app-id
EXPO_PUBLIC_APPCAT_API_KEY=your-api-key
```

```typescript
import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import AppCat from '@appcat/react-native-sdk';

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AppCat.init({
      appId: process.env.EXPO_PUBLIC_APPCAT_APP_ID,
      apiKey: process.env.EXPO_PUBLIC_APPCAT_API_KEY,
    }).then(({ deepLinkParams, geo }) => {
      if (deepLinkParams) {
        console.log('Deep link params:', deepLinkParams);
      }
      setReady(true);
    });
  }, []);

  // Identify — call post-login when PII becomes available
  function onLogin(user: { id: string; email: string }) {
    AppCat.identify({
      userId: user.id,
      email: user.email,
      // revenueCatIds: ['rc_user_123'],
    });
  }

  // Track events after init has completed
  function onPurchase() {
    AppCat.sendEvent('Purchase', { item: 'premium_plan', value: 9.99, currency: 'USD' });
  }

  return (
    <View>
      <Text>My App</Text>
    </View>
  );
}
```

## API

### `AppCat.init(config)`

Initialize the SDK and create the attribution profile. Automatically resolves deferred deep links and returns any matched query params. Must be called before any other method.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `config.appId` | `string` | No | Your AppCat application ID. Resolved from `apiKey` if omitted |
| `config.apiKey` | `string` | Yes | API key for your AppCat project |
| `config.isDebug` | `boolean` | No | Enable debug logging (default: `false`) |
| `config.logLevel` | `LogLevel` | No | Log verbosity: `DEBUG`, `INFO`, `WARN`, `ERROR` (default: `INFO`) |
| `config.customerUserId` | `string` | No | User ID to associate with this session |
| `config.onError` | `(error: unknown) => void` | No | Callback for non-fatal SDK errors |

**Returns:** `Promise<InitResponse>` — `{ deepLinkParams: DeepLinkParams | null, geo: { city, country, state } | null }`.

**Response:**

| Field | Type | Description |
|-------|------|-------------|
| `deepLinkParams` | `Record<string, string \| undefined> \| null` | Query params from the matched ad click URL, or `null` if no match |
| `geo` | `{ city: string \| null, country: string \| null, state: string \| null } \| null` | Geo data. e.g. `{ city: "San Francisco", country: "US", state: "CA" }` |

**Example:**

```typescript
const response = await AppCat.init({
  appId: process.env.EXPO_PUBLIC_APPCAT_APP_ID,
  apiKey: process.env.EXPO_PUBLIC_APPCAT_API_KEY,
});
if (response.deepLinkParams) {
  console.log(response.deepLinkParams);
}
```

---

### `AppCat.identify(data)`

Optional. Enrich the attribution profile with PII for stronger ad platform matching. Call after login, signup, or whenever user data becomes available.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `data.userId` | `string` | No | Your internal user ID |
| `data.email` | `string` | No | User email address |
| `data.phone` | `string` | No | User phone number |
| `data.name` | `string` | No | User display name |
| `data.geo` | `object` | No | Location data (city, countryCode, timezone, etc.) |
| `data.revenueCatIds` | `string[]` | No | RevenueCat app user IDs to associate with this profile |
| `data.customAttributes` | `Record<string, unknown>` | No | Any additional key-value pairs |

**Returns:** `Promise<{ geo, deepLinkParams } | null>`

**Response:**

| Field | Type | Description |
|-------|------|-------------|
| `geo` | `{ city: string \| null, country: string \| null, state: string \| null } \| null` | Geo data. e.g. `{ city: "San Francisco", country: "US", state: "CA" }` |
| `deepLinkParams` | `Record<string, string> \| null` | Deep link params from the attribution profile |

**Example:**

```typescript
const result = await AppCat.identify({
  userId: 'user_123',
  email: 'user@example.com',
  name: 'Jane Smith',
  revenueCatIds: ['rc_user_123'],
});
```

---

### `AppCat.sendEvent(eventName, params?)`

Track a conversion event. This method never throws.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `eventName` | `string` | Yes | Event name (see available events below) |
| `params` | `Record<string, unknown>` | No | Custom event parameters |
| `params.eventId` | `string` | No | Unique event ID for deduplication |
| `params.value` | `number` | No | Monetary value of the event |
| `params.currency` | `string` | No | ISO 4217 currency code (e.g. `"USD"`) |
| `params.testEventCode` | `string` | No | Test event code for validation |

**Returns:** `void`

**Example:**

```typescript
AppCat.sendEvent('Subscribe', { plan: 'annual', value: 99.99, currency: 'USD', eventId: 'order-abc-123' });
```

---

### `AppCat.setTrackingConsent(granted)`

Optional. Record the user's tracking-consent choice after ATT, GDPR, or an in-app privacy setting. When `granted` is `false`, AppCat stops forwarding certain PII fields to ad networks on your behalf.

**Returns:** `Promise<void>`

---

### `AppCat.getAttribution()`

Get cached attribution data. Returns the enriched profile if available, or `null` if neither `init()` nor `identify()` has been called.

**Returns:** `Promise<AttributionProfile | null>`

---

### `AppCat.getDeviceContext()`

Get cached device context.

**Returns:** `Promise<DeviceContext | null>`

---

### `AppCat.getAppCatId()`

Get the stable AppCat device identifier.

**Returns:** `Promise<string>`

---

### `AppCat.isDisabled()`

Check if the SDK has been remotely disabled.

**Returns:** `Promise<boolean>`

---

### `AppCat.isInitialized()`

Check whether the SDK has been initialized.

**Returns:** `boolean`

---

### `AppCat.isNativeBackend()`

Check whether the SDK is using the native backend instead of the JS fallback. Only valid after `init()`.

**Returns:** `boolean`

---

### `AppCat.reset()`

Reset SDK state for tests.

**Returns:** `void`

## Privacy

Call `setTrackingConsent(false)` when the user denies tracking consent. Avoid logging raw deep-link params, email, phone, or attribution payloads in production.

## Available Event Types

| Event Name | Description |
|------------|-------------|
| `MobileAppInstall` | App installed |
| `ViewContent` | User viewed content |
| `AddToCart` | Item added to cart |
| `InitiateCheckout` | Checkout started |
| `StartTrial` | Free trial started |
| `Subscribe` | Subscription started |
| `Purchase` | Purchase completed |
| `CompleteRegistration` | Registration completed |
| `Search` | Search performed |

Custom event names are also supported as any string value.

## License

MIT -- see [LICENSE](./LICENSE) for details.
