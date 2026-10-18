# Android host and verified debug APK

This project wraps the original-interface correction in a native Android host. The original INDIFF server/client is never loaded, executed or included. It is not the complete original application.

## Implemented

- Android Activity + bundled offline HTML/CSS/ES modules, loaded at the reserved HTTPS `appassets.androidplatform.net` origin through AndroidX WebViewAssetLoader
- Origin-matched WebMessageListener, main-frame and exact entry URL checks; no addJavascriptInterface
- SAF ACTION_OPEN_DOCUMENT / ACTION_CREATE_DOCUMENT with user-visible OS selection and cancellation
- UTF-8 text up to 1MiB, JSON workspace backups up to 7MiB; no absolute file paths exposed to JavaScript
- Private AtomicFile workspace-v1.json with recovery/rollback and serialized IO, full document/team memo/DAG/tab/split snapshots
- Session-only URI handles; no persistent URI grants, no external-storage/camera/microphone/location/INTERNET permission
- External requests, mixed content, frames, SSL bypass and permission prompts denied
- `host.connection` explicitly disconnected; no endpoint, pairing, credentials, synchronization, model API or CLI

Picker imports are copies. The UI exports to an OS-selected destination. Host `file.save` exists for a session URI handle, but the current UI intentionally does not retain imported file handles or overwrite imported files. SAF external providers cannot guarantee atomic replacement; only app-private snapshots have that guarantee.

## Pinned build inputs

- Android Gradle Plugin 8.9.2
- Gradle 8.11.1
- Android SDK Platform 35 / Build Tools selected by AGP (35.0.0)
- JDK 17 compiler/runtime (Java source/target 8; Android API linkage checked)
- AndroidX WebKit 1.12.1, historical stable compatible baseline, not claimed latest
- minSdk 26 / targetSdk 35

Official references:
- https://developer.android.com/build/releases/agp-8-9-0-release-notes
- https://developer.android.com/jetpack/androidx/releases/webkit#1.12.1
- https://developer.android.com/develop/ui/views/layout/webapps/load-local-content
- https://developer.android.com/reference/androidx/webkit/WebViewCompat.WebMessageListener
- https://developer.android.com/training/data-storage/shared/documents-files
- https://gradle.org/releases/
- https://developer.android.com/studio#command-tools

## Build steps with approved, verified tools

From repository root: `npm run stage:android`.
With verified Gradle 8.11.1, JDK 17 and SDK Platform 35 / Build Tools 35.0.0 configured, run from this directory: `gradle --no-daemon --max-workers=1 :app:assembleDebug`.
Output: `app/build/outputs/apk/debug/app-debug.apk`. A verified copy is `artifacts/INDIFF_Android_Debug_Test_0.3.0.apk` in the local build project; the source ZIP excludes binaries and all signing keys.

Actual resolution produced `app/gradle.lockfile` and `gradle/verification-metadata.xml`. Verification metadata records first-resolution checksums from the official Google Maven/Maven Central dependency repositories; it is not independent review or signing of every transitive artifact. A Gradle wrapper is not included; use the pinned installed Gradle. No emulator, Android Studio, adb or platform-tools was installed.

Build tools were separately approved on 2026-10-17, including linked Android SDK terms and local debug key creation. Only the local debug key was generated, outside the project and all attachments/backups. Never use it for release or distribute it. No device installation or store upload was authorized.

## Verified here and pending

- Node suite: 106 tests, Java syntax parse and source guards passed.
- `assembleDebug`: successful, including Android/AndroidX symbol compilation and debug signing.
- `apksigner verify`, `zipalign -c`, ZIP CRC and eight bundled web asset SHA256 comparisons: passed.
- Package `app.indiff.port`, minSdk 26, targetSdk 35, versionCode 1, versionName `0.3.0-port-source`; no native ABI libraries or requested Android permissions.
- Optional `lintDebug --offline`: blocked by uncached `com.android.tools.lint:lint-gradle:31.9.2`; no lint pass claimed.
- Actual device/emulator launch, SAF provider behavior, rotation/process death, background saving and real touch/keyboard behavior are NOT verified.

Measured tooling/project usage and process-tree memory are recorded in `qa/android-build-report.json`. Earlier attempts stopped at a conservative memory threshold and were resumed using a smaller JVM. The final successful assemble run peaked at 519,958,528 bytes for the monitored namespace/process tree, below the 650,000,000-byte cap. Heap is not an RSS cap. Keep actual process-tree monitoring and coordinate heavy jobs on constrained machines.
