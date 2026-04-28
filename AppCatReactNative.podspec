Pod::Spec.new do |s|
  s.name         = "AppCatReactNative"
  s.version      = "0.1.2"
  s.summary      = "AppCat React Native SDK — deferred deep link resolution and attribution"
  s.homepage     = "https://github.com/AppCat-AI/appcat-react-native-sdk"
  s.license      = { :type => "MIT" }
  s.author       = "AppCat"
  s.source       = { :git => "https://github.com/AppCat-AI/appcat-react-native-sdk.git", :tag => s.version }

  s.platform     = :ios, "13.0"
  s.swift_version = "5.10"

  # Paths relative to this podspec (package root); native sources live under ios/
  s.source_files = "ios/*.{h,m,mm,swift}"

  # Closed-source core framework (pre-built)
  s.vendored_frameworks = "ios/AppCatCoreKit.xcframework"

  s.dependency "React-Core"

  # Optional frameworks for device signal collection (used by AppCatCore)
  s.weak_frameworks = [
    "AdSupport",             # IDFA
    "AppTrackingTransparency", # ATT status
    "AdServices",            # Apple Search Ads attribution
    "CoreTelephony",         # Carrier info
  ]
end
