# Platform port implementation and verification boundary

Date: 2026-10-17. Existing original-ui deployment is preserved. All new work is isolated in this source directory. Official Android build tools were installed under the separately approved 2,000,000,000-byte budget. A local debug signing key was generated and kept outside all deliverables. No Electron packages, original app execution, model/backend connection or public server publication occurred.

## Native contract

`window.indiffNative.invoke(method,payload)` on Electron, or an origin-scoped `IndiffBridge.postMessage` on Android. The common adapter normalizes `{ok,value}` / `{ok:false,error:{code,message}}`; cancellation resolves as `{canceled:true}` and is not a completed save.

Methods: host.info, host.connection, workspace.load/save, file.pick/saveAs/save. No general filesystem paths, shell/terminal, process API, model API, HTTP request or permission management method exists.

Workspace snapshot: `{format:'indiff.platform-workspace',version:1,workspace,ui}`. Existing strict domain and UI validators run before native commit/after native read. Workspace retains documents/roles/tasks/local rules/runs. UI retains original-interface tab/split state, paths, board positions/camera and chat-shaped local memos. It does not pretend these memos are original AI sessions or remote team messages.

Native writes are serialized and coalesce queued updates. Save is shown pending until native acknowledgement. A pending-write marker prevents an older app-private snapshot from silently replacing a newer browser recovery cache after failure/restart. Corrupt native load blocks autosave and preserves cache until explicit recovery. Browser-cache and native-file writes are not a cross-store transaction; the marker is conservative recovery, not a distributed transaction.

## Actual original workflow JSON compatibility

`lib/original-contract.js` independently implements the statically observed project-file contract:
- project/workflows/*.workflow.json: original name/cards/links/layout/goal/input/vars and unknown fields
- .indiff.json: registered project roots, preserved as data only; no folder is registered/opened automatically
- .indiff-workflows.json: current/views plus active/fires runtime/UI state, preserved only; no trigger is activated

Workflow JSON import opens an original card inspector in a normal document tab. Card title/does/prompt/format/mode and canvas-position metadata can be edited on the imported copy and exported again as original JSON. Unknown root/card/edge fields and original link representation survive semantic JSON roundtrip. Duplicate object keys are rejected because they cannot be preserved through JSON.parse. Unsupported node types are retained and flagged. ALL original nodes, including recognized Claude/session/shell/http/read/write/trigger kinds, remain non-executable. No original workflow is translated into the unrelated local-rule demo graph.

YAML is explicitly unsupported without a reviewed parser dependency. JSON whitespace, comments (not valid JSON), duplicate-key originals, unusual non-string legacy fields, and original server normalization quirks are not claimed byte-for-byte compatible. Original tabs/splits/team-session state require additional schema work; current shell/UI snapshot is independently implemented and is NOT a drop-in replacement for every original state file. Original workspace folder watching, external editing and multiple-workflow live registry are not implemented.

## Windows/mobile connection boundary

Both hosts report host.connection `{state:'disconnected',configured:false}`. No server binds a LAN/public port. Android currently works offline with copies of selected files; Windows pairing, endpoint discovery, explicit device trust, transport encryption, conflict resolution, merge/history and selective file sync remain unimplemented. Before that work, obtain scoped endpoint/security permissions and test a concrete host protocol; do not silently enable networking or inject credentials.

## Packaging gaps

Android: official Gradle 8.11.1, Temurin JDK 17, SDK Platform 35 and Build Tools 35.0.0 compiled the app successfully. A debug APK passed apksigner, zipalign, ZIP CRC and eight exact bundled-asset checks. Actual dependency locks and SHA256 verification metadata were generated. The wrapper is not included. Optional offline lint could not resolve uncached lint-gradle 31.9.2, so lint is NOT a pass. Device installation, launch, SAF provider, lifecycle and mobile interaction checks remain pending.

Windows: pinned Electron/electron-builder configs and isolated secure host exist. No node_modules or installed native runtime is included. A real platforms/windows/package-lock.json was generated and is included in this source snapshot; the separately downloaded official runtime ZIP was not a built app. Electron startup, Windows EXE/NSIS build, signing/install/update and actual Windows file/lock behavior are pending.

Original app license/build provenance remains separate: extracted package declares MIT but lacked upstream root LICENSE/lock/build sources; bundled third-party materials have their own notices. Independent host/LICENSE cannot authorize redistributing original assets or the brand. No original vendor runtime is included.

## Test interpretation

Node tests cover domain/UI stubs, native transport/queue, original JSON roundtrip and secure Windows host logic. Java parsing checks syntax only; the separate Android assembleDebug build also verified Android/AndroidX symbol linkage. Browser tests are present but current cloud sandbox blocks Chromium process sockets; the escalated runner also failed to initialize. They have NOT passed in this task. Native device/OS tests have not run. See qa/ for precise results.
