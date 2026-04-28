/**
 * Obj-C++ bridge — registers the native module with React Native.
 * Delegates all calls to AppCatReactNative.swift.
 */

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(AppCatReactNative, NSObject)

RCT_EXTERN_METHOD(configure:(NSString *)appId
                  apiKey:(NSString *)apiKey
                  options:(NSDictionary *)options
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(resolve:(NSString *)ddlToken
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(identify:(NSDictionary *)data
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(sendEvent:(NSString *)eventName
                  params:(NSDictionary *)params
                  options:(NSDictionary *)options)

RCT_EXTERN_METHOD(getAttribution:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getDeviceContext:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getAppCatId:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(isDisabled:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(setLogLevel:(nonnull NSNumber *)level)

RCT_EXTERN_METHOD(setTrackingConsent:(BOOL)granted
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

@end
