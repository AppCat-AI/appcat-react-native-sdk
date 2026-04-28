/**
 * AppCatReactNativeModule — Android native module for React Native.
 *
 * Thin bridge that delegates all calls to AppCatCore library.
 * Converts between React Native types (ReadableMap, Promise) and standard Kotlin types.
 *
 * Hardening contract:
 *   - No unchecked `!!` on host callbacks or RN inputs.
 *   - Every @ReactMethod body runs inside a try/catch that maps any
 *     unexpected throwable to a promise rejection with a stable code.
 *   - Fire-and-forget methods (`sendEvent`, `setLogLevel`) swallow
 *     exceptions so a misbehaving host never crashes the app.
 *   - Recursive type conversion handles null `Map` / `Array` children
 *     gracefully (RN can hand us unusual shapes on older versions).
 */

package com.appcat.reactnative

import com.appcat.core.AppCatCore
import com.facebook.react.bridge.*

class AppCatReactNativeModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "AppCatReactNative"

  // ---------------------------------------------------------------------
  // Stable reject codes (kept in sync with src/types.ts)
  // ---------------------------------------------------------------------

  private companion object {
    const val ERR_INTERNAL               = "ERR_INTERNAL"
    const val ERR_SET_TRACKING_CONSENT   = "ERR_SET_TRACKING_CONSENT"
  }

  /** Reject uniformly with ERR_INTERNAL + throwable cause. */
  private fun rejectInternal(promise: Promise, err: Throwable) {
    promise.reject(ERR_INTERNAL, err.message ?: err.javaClass.simpleName, err)
  }

  // MARK: - configure

  @ReactMethod
  fun configure(appId: String, apiKey: String, options: ReadableMap, promise: Promise) {
    try {
      val optionsMap = readableMapToMap(options)
      AppCatCore.instance.configure(
        context = reactApplicationContext,
        appId = appId,
        apiKey = apiKey,
        options = optionsMap,
        callback = object : AppCatCore.ResultCallback<Boolean> {
          override fun onSuccess(result: Boolean) {
            try {
              AppCatCore.instance.resolve(
                ddlToken = null,
                callback = object : AppCatCore.ResultCallback<Map<String, Any?>> {
                  override fun onSuccess(result: Map<String, Any?>) {
                    try {
                      val params = result["deepLinkParams"] as? Map<*, *>
                      val deepLinks = if (params != null && params.isNotEmpty()) params else null
                      val response = mapOf(
                        "deepLinkParams" to deepLinks,
                        "geo" to result["geo"],
                      )
                      promise.resolve(mapToWritableMap(response))
                    } catch (t: Throwable) {
                      promise.resolve(mapToWritableMap(mapOf("deepLinkParams" to null, "geo" to null)))
                    }
                  }
                  override fun onError(code: String, message: String) {
                    try {
                      promise.resolve(mapToWritableMap(mapOf("deepLinkParams" to null, "geo" to null)))
                    } catch (_: Throwable) { /* host consumed */ }
                  }
                }
              )
            } catch (_: Throwable) {
              try {
                promise.resolve(mapToWritableMap(mapOf("deepLinkParams" to null, "geo" to null)))
              } catch (_: Throwable) { /* host consumed */ }
            }
          }
          override fun onError(code: String, message: String) {
            try { promise.reject(code, message) } catch (_: Throwable) { /* host consumed */ }
          }
        }
      )
    } catch (t: Throwable) {
      rejectInternal(promise, t)
    }
  }

  // MARK: - resolve

  @ReactMethod
  fun resolve(ddlToken: String?, promise: Promise) {
    try {
      AppCatCore.instance.resolve(
        ddlToken = ddlToken,
        callback = object : AppCatCore.ResultCallback<Map<String, Any?>> {
          override fun onSuccess(result: Map<String, Any?>) {
            try { promise.resolve(mapToWritableMap(result)) } catch (_: Throwable) { }
          }
          override fun onError(code: String, message: String) {
            try { promise.reject(code, message) } catch (_: Throwable) { }
          }
        }
      )
    } catch (t: Throwable) {
      rejectInternal(promise, t)
    }
  }

  // MARK: - identify

  @ReactMethod
  fun identify(data: ReadableMap, promise: Promise) {
    try {
      val dataMap = readableMapToMap(data)
      AppCatCore.instance.identify(
        data = dataMap,
        callback = object : AppCatCore.ResultCallback<Map<String, Any?>?> {
          override fun onSuccess(result: Map<String, Any?>?) {
            try {
              promise.resolve(result?.let { mapToWritableMap(it) })
            } catch (_: Throwable) { }
          }
          override fun onError(code: String, message: String) {
            try { promise.reject(code, message) } catch (_: Throwable) { }
          }
        }
      )
    } catch (t: Throwable) {
      rejectInternal(promise, t)
    }
  }

  // MARK: - sendEvent (fire-and-forget)

  @ReactMethod
  fun sendEvent(eventName: String, params: ReadableMap?, options: ReadableMap?) {
    try {
      val paramsMap = params?.let { readableMapToMap(it) }
      val optionsMap = options?.let { readableMapToMap(it) }
      AppCatCore.instance.sendEvent(eventName = eventName, params = paramsMap, options = optionsMap)
    } catch (_: Throwable) {
      // fire-and-forget — never crash the host
    }
  }

  // MARK: - getAttribution

  @ReactMethod
  fun getAttribution(promise: Promise) {
    try {
      val attribution = AppCatCore.instance.getAttribution()
      promise.resolve(attribution?.let { mapToWritableMap(it) })
    } catch (t: Throwable) {
      rejectInternal(promise, t)
    }
  }

  // MARK: - getDeviceContext

  @ReactMethod
  fun getDeviceContext(promise: Promise) {
    try {
      val context = AppCatCore.instance.getDeviceContext()
      promise.resolve(context?.let { mapToWritableMap(it) })
    } catch (t: Throwable) {
      rejectInternal(promise, t)
    }
  }

  // MARK: - getAppCatId

  @ReactMethod
  fun getAppCatId(promise: Promise) {
    try {
      promise.resolve(AppCatCore.instance.getAppCatId())
    } catch (t: Throwable) {
      rejectInternal(promise, t)
    }
  }

  // MARK: - isDisabled

  @ReactMethod
  fun isDisabled(promise: Promise) {
    try {
      promise.resolve(AppCatCore.instance.isDisabled())
    } catch (t: Throwable) {
      rejectInternal(promise, t)
    }
  }

  // MARK: - setLogLevel (fire-and-forget)

  @ReactMethod
  fun setLogLevel(level: Double) {
    try {
      AppCatCore.instance.setLogLevel(level.toInt())
    } catch (_: Throwable) {
      // best-effort
    }
  }

  // MARK: - setTrackingConsent

  @ReactMethod
  fun setTrackingConsent(granted: Boolean, promise: Promise) {
    try {
      AppCatCore.instance.setTrackingConsent(granted) { result ->
        try {
          if (result.isSuccess) {
            promise.resolve(null)
          } else {
            val err = result.exceptionOrNull()
            promise.reject(
              ERR_SET_TRACKING_CONSENT,
              err?.message ?: "setTrackingConsent failed",
              err
            )
          }
        } catch (_: Throwable) { /* host consumed */ }
      }
    } catch (t: Throwable) {
      promise.reject(ERR_SET_TRACKING_CONSENT, t.message ?: "setTrackingConsent failed", t)
    }
  }

  // ---------------------------------------------------------------------
  // Type conversion helpers — null-safe, exception-free
  // ---------------------------------------------------------------------

  private fun readableMapToMap(map: ReadableMap): Map<String, Any?> {
    val result = mutableMapOf<String, Any?>()
    val iterator = map.keySetIterator()
    while (iterator.hasNextKey()) {
      val key = iterator.nextKey()
      try {
        result[key] = when (map.getType(key)) {
          ReadableType.Null -> null
          ReadableType.Boolean -> map.getBoolean(key)
          ReadableType.Number -> map.getDouble(key)
          ReadableType.String -> map.getString(key)
          ReadableType.Map -> map.getMap(key)?.let { readableMapToMap(it) }
          ReadableType.Array -> map.getArray(key)?.toArrayList()
        }
      } catch (_: Throwable) {
        // Defensive: a malformed entry shouldn't abort the whole conversion.
        result[key] = null
      }
    }
    return result
  }

  private fun mapToWritableMap(map: Map<String, Any?>): WritableMap {
    val writableMap = Arguments.createMap()
    for ((key, value) in map) {
      try {
        when (value) {
          null -> writableMap.putNull(key)
          is Boolean -> writableMap.putBoolean(key, value)
          is Int -> writableMap.putInt(key, value)
          is Long -> writableMap.putDouble(key, value.toDouble())
          is Float -> writableMap.putDouble(key, value.toDouble())
          is Double -> writableMap.putDouble(key, value)
          is String -> writableMap.putString(key, value)
          is Map<*, *> -> {
            val nested = mutableMapOf<String, Any?>()
            for ((k, v) in value) {
              if (k is String) nested[k] = v
            }
            writableMap.putMap(key, mapToWritableMap(nested))
          }
          else -> writableMap.putString(key, value.toString())
        }
      } catch (_: Throwable) {
        try { writableMap.putNull(key) } catch (_: Throwable) { /* give up on this key */ }
      }
    }
    return writableMap
  }
}
