/** Copy only independently written web assets. Does not install SDKs, run Gradle or publish. */
import {mkdir,readdir,copyFile,rm,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const destination=path.join(root,'platforms/android/app/build/generated/indiffAssets/web');
const files=['index.html','app.js','styles.css',...(await readdir(path.join(root,'lib'))).filter(n=>/^[a-z-]+\.js$/.test(n)).map(n=>'lib/'+n)];
await rm(destination,{recursive:true,force:true});await mkdir(path.join(destination,'lib'),{recursive:true});
const manifest=[];for(const name of files){await copyFile(path.join(root,name),path.join(destination,name));const bytes=await readFile(path.join(destination,name));manifest.push({path:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
await writeFile(path.join(root,'qa/android-assets.json'),JSON.stringify({format:'indiff.android-assets',files:manifest},null,2)+'\n');
console.log(`Staged ${files.length} Android web assets; no APK has been built.`);
