# Additional build requirements and approvals

Android tooling was installed only after explicit approval for a separate maximum 2,000,000,000-byte tools/build budget, linked SDK terms and local debug signing. Windows tooling remains uninstalled and requires separate scope approval.

## Android build completed

Pinned and installed: Gradle 8.11.1, Temurin JDK 17.0.20.1+1, SDK Platform 35 revision 2, Build Tools 35.0.0; Android Gradle Plugin 8.9.2 and AndroidX WebKit 1.12.1 resolved from official repositories. The app uses Java 8 source/target under JDK 17 to avoid a memory-heavy JDK image transform. No emulator, Android Studio, command-line SDK manager, platform-tools or adb was installed.

Official archive downloads totaled 456,405,260 bytes. Checksums were verified before extraction; the four successful temporary installer archives were removed after receipt recording. Tools, caches, build intermediates and APK copies are all counted within the approved tool budget. See `qa/android-build-report.json` for exact final measured usage, hashes and verification boundaries.

The debug APK build and signature/ZIP checks passed. Android device installation/launch, SAF/lifecycle/touch QA and store release remain pending. Offline lint was not completed because lint-gradle 31.9.2 was not cached. No release signing or new persistent access was configured; the local debug key is excluded from every source/archive/backup.

Official sources:
- Android SDK linked terms: https://developer.android.com/studio#command-tools
- SDK official package metadata: https://dl.google.com/android/repository/repository2-1.xml
- AGP/Gradle/JDK compatibility: https://developer.android.com/build/releases/agp-8-9-0-release-notes
- Gradle distribution checksums: https://gradle.org/release-checksums/
- Temurin JDK: https://adoptium.net/temurin/releases/
- AndroidX dependency: https://developer.android.com/jetpack/androidx/releases/webkit#1.12.1

The linked SDK agreement was approved before acceptance; only the Android SDK license used by the selected platform/build tools was recorded. No blanket `sdkmanager --licenses` was run. Optional platform-tools remain absent, and the build may warn about them. Dependency locks and verification metadata were written by real resolution; first-resolution hashes are not independent upstream provenance review.

## Windows

Pinned: Electron 44.9.0 and electron-builder 26.17.0. An unsigned portable build has an official Linux route without Wine; a normal NSIS installer still needs Wine for its uninstaller stage. Windows runtime QA requires a separate Windows environment. The official Windows Electron ZIP was downloaded once and SHA256 verified, and a real283-entry npm lockfile was generated. No Windows tool node_modules, complete unpacked app or portable EXE was produced. Pre-install package-size HEAD checking hit a proxy403 on registry.npmjs.org; it was not retried. See qa/windows-build-preflight.json.

Planning estimate: 0.7–1.5GiB for Electron/npm/build caches and unsigned output on a prepared Windows machine, potentially more with Wine/cross-build tools. Exact versions/download/archive/unpacked sizes must be verified before installation. Installer signing and auto-update publishing are outside this implementation.

Official sources:
- https://github.com/electron/electron/releases/tag/v44.9.0
- https://github.com/electron-userland/electron-builder/releases/tag/electron-builder%4026.17.0
- https://www.electron.build/v26/docs/api/app-builder-lib.interface.windowsconfiguration/
- https://www.electron.build/v26/docs/features/multi-platform-build/
- https://www.electronjs.org/docs/latest/tutorial/security

Approval/terms: ordinary trusted-vendor installs still require scoped approval; no persistent signing credentials, publishing tokens or new access grants have been created. Source is ready for review, not an installer release.

## Original app dependencies

This host does not package the original extracted server, vendor library or node_modules. Original macOS .node binaries are not Windows/Android binaries. Source availability, upstream lock/build inputs, first-party license evidence and individual bundled-vendor obligations require separate resolution before redistributing the original application. The independent MIT LICENSE cannot grant those rights.

### Windows preflight outcome (2026-10-17)

A separate1,700,000,000-byte tooling budget was approved, preserving the650,000,000-byte process-tree RSS limit. The source adds a direct-zlib portable configuration. Tooling preflight stopped safely before npm tool installation or PE modification. Observed preflight tree RSS peaked at157,179,904bytes.

The official247,184,896-byte EXE would require247,183,360bytes of copied sections in the fixed PE parser. Two backing stores alone total494,368,256bytes, above the480MB conservative stop threshold; three overlapping stores could total741,551,616bytes plus overhead. This is static allocation analysis, not an actual packaging RSS measurement or proof of minimum required memory. No streaming option preserving the same integrity behavior exists in the fixed official tool path. No security check was disabled, custom PE-section rewrite applied, or RAM budget increased. The403 and memory-safety questions remain blockers before retry.
