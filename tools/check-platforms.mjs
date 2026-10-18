/** Read-only toolchain probe and source guard checks. Never installs or downloads anything. */
import {readFile,stat,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const check=command=>{const result=spawnSync('sh',['-c',`command -v ${command}`],{encoding:'utf8'});return {available:result.status===0,path:result.status===0?result.stdout.trim():null};};
const tools=Object.fromEntries(['node','npm','java','javac','gradle','adb','wine','makensis','cargo','flutter'].map(name=>[name,check(name)]));
const manifest=await readFile(path.join(root,'platforms/android/app/src/main/AndroidManifest.xml'),'utf8');
if(/<uses-permission\b/.test(manifest))throw Error('Android port must not request unreviewed permissions.');
const android=await readFile(path.join(root,'platforms/android/app/src/main/java/app/indiff/port/MainActivity.java'),'utf8');
for(const forbidden of ['addJavascriptInterface(','Runtime.getRuntime(','ProcessBuilder(','handler.proceed()','setAllowFileAccess(true)'])if(android.includes(forbidden))throw Error('Unsafe Android host API: '+forbidden);
const exists=async name=>{try{await stat(path.join(root,name));return true;}catch{return false;}};
let nativeQA=null;try{nativeQA=JSON.parse(await readFile(path.join(root,'qa/android-apk-verification.json'),'utf8'));}catch{}
const apkPath='artifacts/INDIFF_Android_Debug_Test_0.3.0.apk';
const apkExists=await exists(apkPath);
const apkHash=apkExists?createHash('sha256').update(await readFile(path.join(root,apkPath))).digest('hex'):null;
const apkVerified=Boolean(nativeQA&&apkHash===nativeQA.sha256&&nativeQA.apksigner==='passed'&&nativeQA.zipalign==='passed');
const report={checkedAt:new Date().toISOString(),platform:process.platform,architecture:process.arch,node:process.version,tools,android:{sdkEnvironment:process.env.ANDROID_SDK_ROOT||process.env.ANDROID_HOME||null,gradleWrapper:await exists('platforms/android/gradlew'),apkBuilt:apkExists,apkMatchesVerification:apkVerified,apkSha256:apkHash,javaCompileVerified:apkVerified,deviceRuntimeVerified:false,lintVerified:false,dependencyLock:await exists('platforms/android/app/gradle.lockfile'),dependencyVerification:await exists('platforms/android/gradle/verification-metadata.xml')},windows:{electronInstalled:await exists('platforms/windows/node_modules/electron'),dependencyLock:await exists('platforms/windows/package-lock.json'),installerBuilt:false,electronRuntimeVerified:false},sourceGuards:'passed',scope:'Read-only PATH probe/static guards and previously verified APK hash check. Native runtime/lint/Windows build not verified.'};
await mkdir(path.join(root,'qa'),{recursive:true});await writeFile(path.join(root,'qa/platform-toolchain.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
