# GitHub source migration status

Snapshot date: 2026-10-18 (UTC). Target: private repository devdevra/indiff-workspace.

## What was transferred

The existing independent INDIFF Windows/Android port (package version 0.3.0): web app source, native host source/configuration, dependency locks, tests, tools and documentation. The transfer allowlist contained 60 UTF-8 source/document files, totaling 627,481 bytes before the documentation changes. Source bytes were checked against the prepared SHA-256 and Git blob identities before upload. This status page is the only added file; application behavior is unchanged.

Excluded: dist/artifacts, QA outputs, APK/EXE and downloaded runtimes, node_modules, SDK/build caches, credentials/signing keys, and original extracted application or third-party vendor bundles. Older documents reference qa/ reports from the separate historical workspace; those report files are deliberately absent from this source-only repository. The original app's branding, assets and vendor redistribution rights are not granted by the independent MIT license.

## Verification boundary

This migration checked the source allowlist, UTF-8 decoding, file hashes and bounded static secret patterns. It did not execute the app, install dependencies, rerun tests, rebuild APK/EXE, deploy, enable paid CI or configure persistent credentials. Historical pass statements in existing documentation are records of earlier work, not new results from this migration. Remote branch/file verification is performed after publishing the import commit.

## Build and QA status carried forward

- Android: historical debug APK build and signature/ZIP/bundled-asset checks passed. Actual device launch, SAF provider/lifecycle/touch QA, offline lint completion and release delivery remain pending. No APK or debug signing key is in this repository.
- Windows: secure Electron host source/configuration and a real package-lock.json are present. Dependency installation, app execution, finished portable EXE/NSIS output and Windows runtime QA remain unverified. The earlier preflight stopped on registry access and conservative packaging-memory concerns; the existing budget and process-memory limits still apply. Do not treat the downloaded official Electron runtime as a finished INDIFF app.
- TapFlow QA is planned. That route requires an Apple Silicon Mac and does not run a Windows EXE; it is not evidence of Windows runtime validation.
- Codex cloud environment: not yet configured or tested at the time of this source upload. No setup snapshot, dependency installation or cloud-environment test is claimed here.

## Development entry points

- Root web/source checks: Node.js >=20, with no root dependencies to install. There is no root package-lock.json; do not run npm ci at the root. Commands provided by package.json: npm run check, npm test, npm run check:platform. npm start serves the web UI at http://127.0.0.1:4173 on loopback only.
- Windows dependency installation/build: separate platforms/windows package, Node.js >=22.12.0, pinned lockfile and scoped download/storage/memory approval. Only in an approved prepared build environment: npm --prefix platforms/windows ci. Packaging and actual Windows validation remain separate steps.
- Android builds need the separately documented SDK/JDK/Gradle toolchain; those binaries are not included. See BUILD_REQUIREMENTS.md and ../platforms/android/README.md.

Next: configure the intended Codex environment, then run the source checks there and record exact results. Request additional approval if installation, cost, storage, memory, credentials or access would exceed the existing scope.
