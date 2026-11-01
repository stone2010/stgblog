# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

-dontusemixedcaseclassnames
-dontskipnonpubliclibraryclasses
-dontpreverify
-verbose
-dontoptimize
-dontshrink
-keep class com.stgblog.app.** { *; }
-keep class android.webkit.** { *; }
-keepclassmembers class android.webkit.WebViewClient {
    public *;
}
-keepclassmembers class android.webkit.WebChromeClient {
    public *;
}