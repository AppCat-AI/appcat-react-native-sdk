# AppCat React Native Bridge — ProGuard / R8 rules
#
# Thin bridge only — core library handles its own obfuscation.

# Keep the module class name and its @ReactMethod annotated methods
-keep class com.appcat.reactnative.AppCatReactNativeModule {
    @com.facebook.react.bridge.ReactMethod <methods>;
}

# Keep the package class so React Native can instantiate it
-keep class com.appcat.reactnative.AppCatReactNativePackage { *; }
