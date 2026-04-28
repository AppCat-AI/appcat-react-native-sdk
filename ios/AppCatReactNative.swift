/**
 * AppCatReactNative — iOS native module for React Native.
 *
 * Thin bridge that delegates all calls to AppCatCore framework.
 * Converts between RCT types and native Swift types.
 *
 * Hardening contract:
 *   - No forced unwraps (`!`), `try!`, `as!`, or `fatalError` anywhere.
 *   - Every promise-returning method resolves or rejects exactly once.
 *   - Native `AppCatError` cases map to stable string codes so the JS
 *     wrapper can inspect `(err as { code?: string }).code` reliably.
 *   - `sendEvent` and `setLogLevel` are fire-and-forget — any thrown
 *     NSException would terminate the host app anyway, but AppCatCore
 *     never throws NSExceptions so they stay bare for lowest latency.
 */

import Foundation
import React
import AppCatCoreKit

@objc(AppCatReactNative)
class AppCatReactNative: NSObject {

  // MARK: - Stable reject codes (kept in sync with src/types.ts)

  private static let ERR_INVALID_CONFIG    = "ERR_INVALID_CONFIG"
  private static let ERR_NOT_CONFIGURED    = "ERR_NOT_CONFIGURED"
  private static let ERR_SERIALIZE         = "ERR_SERIALIZE"
  private static let ERR_RESOLVE           = "ERR_RESOLVE"
  private static let ERR_IDENTIFY          = "ERR_IDENTIFY"
  private static let ERR_SET_TRACKING      = "ERR_SET_TRACKING_CONSENT"
  private static let ERR_INTERNAL          = "ERR_INTERNAL"

  /// Wrap a Swift `Error` as `NSError` for stable RN promise bridging.
  private static func asNSError(_ err: Error) -> NSError {
    if let ns = err as NSError? { return ns }
    return NSError(
      domain: "AppCatCoreKit",
      code: -1,
      userInfo: [NSLocalizedDescriptionKey: String(describing: err)]
    )
  }

  // MARK: - configure

  @objc
  func configure(
    _ appId: String,
    apiKey: String,
    options: NSDictionary,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    let opts = (options as? [String: Any]) ?? [:]
    AppCatCore.shared.configure(appId: appId, apiKey: apiKey, options: opts) { result in
      switch result {
      case .success:
        AppCatCore.shared.resolve(ddlToken: nil) { resolveResult in
          switch resolveResult {
          case .success(let value):
            let params = value["deepLinkParams"] as? [String: String]
            let rawGeo = value["geo"] as? [String: Any]
            let response: [String: Any] = [
              "deepLinkParams": params?.isEmpty == false ? (params as Any) : NSNull(),
              "geo": rawGeo ?? NSNull(),
            ]
            resolve(response)
          case .failure:
            // Resolve failure is non-fatal; configure still succeeded.
            resolve(["deepLinkParams": NSNull(), "geo": NSNull()])
          }
        }
      case .failure(let error):
        switch error {
        case .invalidConfig(let msg):
          reject(Self.ERR_INVALID_CONFIG, msg, Self.asNSError(error))
        case .notConfigured:
          reject(Self.ERR_NOT_CONFIGURED, "Call configure() first", Self.asNSError(error))
        case .serializationFailed(let inner):
          reject(Self.ERR_SERIALIZE, "Serialization failed", Self.asNSError(inner))
        }
      }
    }
  }

  // MARK: - resolve

  @objc
  func resolve(
    _ ddlToken: String?,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    AppCatCore.shared.resolve(ddlToken: ddlToken) { result in
      switch result {
      case .success(let value):
        resolve(value)
      case .failure(let error):
        switch error {
        case .notConfigured:
          reject(Self.ERR_NOT_CONFIGURED, "Call configure() first", Self.asNSError(error))
        default:
          reject(Self.ERR_RESOLVE, "Resolve failed", Self.asNSError(error))
        }
      }
    }
  }

  // MARK: - identify

  @objc
  func identify(
    _ data: NSDictionary,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    let dict = (data as? [String: Any]) ?? [:]
    AppCatCore.shared.identify(data: dict) { result in
      switch result {
      case .success(let value):
        resolve(value)
      case .failure(let error):
        switch error {
        case .notConfigured:
          reject(Self.ERR_NOT_CONFIGURED, "Call configure() first", Self.asNSError(error))
        case .serializationFailed(let inner):
          reject(Self.ERR_SERIALIZE, "Failed to serialize identify data", Self.asNSError(inner))
        default:
          reject(Self.ERR_IDENTIFY, "Identify failed", Self.asNSError(error))
        }
      }
    }
  }

  // MARK: - sendEvent (fire-and-forget)

  @objc
  func sendEvent(
    _ eventName: String,
    params: NSDictionary?,
    options: NSDictionary?
  ) {
    let paramsDict = (params as? [String: Any])
    let optionsDict = (options as? [String: Any])
    AppCatCore.shared.sendEvent(eventName: eventName, params: paramsDict, options: optionsDict)
  }

  // MARK: - getAttribution

  @objc
  func getAttribution(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    let value = AppCatCore.shared.getAttribution()
    // Pass explicit `nil` (not an implicit one) so the bridge never
    // receives a garbage-typed payload on older RN versions.
    resolve(value as Any?)
  }

  // MARK: - getDeviceContext

  @objc
  func getDeviceContext(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    let value = AppCatCore.shared.getDeviceContext()
    resolve(value as Any?)
  }

  // MARK: - getAppCatId

  @objc
  func getAppCatId(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve(AppCatCore.shared.getAppCatId())
  }

  // MARK: - isDisabled

  @objc
  func isDisabled(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve(AppCatCore.shared.isDisabled())
  }

  // MARK: - setLogLevel

  @objc
  func setLogLevel(_ level: NSNumber) {
    AppCatCore.shared.setLogLevel(level.intValue)
  }

  // MARK: - setTrackingConsent

  @objc
  func setTrackingConsent(
    _ granted: Bool,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    AppCatCore.shared.setTrackingConsent(granted: granted) { result in
      switch result {
      case .success:
        resolve(nil)
      case .failure(let error):
        reject(Self.ERR_SET_TRACKING, error.localizedDescription, Self.asNSError(error))
      }
    }
  }
}
