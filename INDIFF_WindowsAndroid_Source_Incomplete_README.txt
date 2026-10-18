INDIFF Windows / Android source work-in-progress — 2026-10-17

Android test APK was built and verified separately. This source snapshot contains source, configuration and dependency locks; historical verification reports are kept separately and excluded from the GitHub source import. The snapshot excludes APK/EXE, signing keys, SDK tools and caches.

Implemented: original-interface shell, native Android SAF/private persistence, secure Windows Electron host source, original workflow JSON import/edit/export with unknown field preservation and all original node execution disabled.

Android: assembleDebug, apksigner, zipalign, ZIP CRC and exact bundled web asset checks passed. Package app.indiff.port, Android 8.0+ (minSdk26), target35. Actual device launch, file picker/provider behavior and lifecycle interaction are untested. Offline lint was blocked by an uncached lint dependency.

Windows: not built or run; no Electron dependencies installed. A real platforms/windows/package-lock.json is included. Original INDIFF full functionality is not complete. AI/API/CLI, terminal, original server, device sync/pairing and networking remain disconnected; YAML and full original UI/session state compatibility are not implemented.

Independent source only. Original branding/assets/vendor redistribution rights are not granted. See README.md, docs/PLATFORM_HOSTS.md, docs/BUILD_REQUIREMENTS.md and docs/MIGRATION_STATUS.md. The referenced historical qa/android-build-report.json is not included in this repository.
