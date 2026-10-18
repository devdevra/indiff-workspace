/** Build static assets, an exact-source viewer and dependency-free ZIP download. */
import {mkdir,readFile,writeFile,copyFile,readdir,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),dist=path.join(root,'dist');
const ignored=new Set(['.git','node_modules','dist','build','.gradle','.openai','__pycache__']);
async function sources(dir=''){const out=[];for(const item of await readdir(path.join(root,dir),{withFileTypes:true})){if(item.name.startsWith('.')||ignored.has(item.name)||path.posix.join(dir,item.name)==='platforms/windows/web'||path.posix.join(dir,item.name)==='platforms/windows/web-manifest.json'||path.posix.join(dir,item.name)==='qa/bundle-verification.json')continue;const relative=path.posix.join(dir,item.name);if(item.isDirectory())out.push(...await sources(relative));else if(item.isFile()&&!/\.(zip|apk|exe|keystore|jks|pyc)$/i.test(relative))out.push(relative);}return out.sort();}
const sourceFiles=await sources();
await mkdir(dist,{recursive:true});await mkdir(path.join(dist,'lib'),{recursive:true});await rm(path.join(dist,'source-text'),{recursive:true,force:true});await mkdir(path.join(dist,'source-text'),{recursive:true});
for(const name of ['index.html','styles.css','app.js',...(await readdir(path.join(root,'lib'))).filter(n=>n.endsWith('.js')).map(n=>'lib/'+n)])await copyFile(path.join(root,name),path.join(dist,name));
const manifest=[],entries=[];
for(const [index,name]of sourceFiles.entries()){const bytes=await readFile(path.join(root,name));const url=`./source-text/${index}.txt`;await writeFile(path.join(dist,'source-text',`${index}.txt`),bytes);manifest.push({path:name,url,bytes:bytes.length});entries.push({name:`indiff-platform-port-source/${name}`,data:bytes})}
await writeFile(path.join(dist,'source-manifest.json'),JSON.stringify(manifest,null,2));
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}return(crc^0xffffffff)>>>0}
// Standard ZIP, stored entries, UTF-8 names. No shell tools or libraries required.
const local=[],central=[];let offset=0;
for(const entry of entries){const name=Buffer.from(entry.name),data=entry.data,crc=crc32(data);const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(33,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(data.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(name.length,26);local.push(header,name,data);const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt16LE(33,14);c.writeUInt32LE(crc,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(offset,42);central.push(c,name);offset+=header.length+name.length+data.length}
const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);await writeFile(path.join(dist,'INDIFF_WindowsAndroid_Source_Incomplete.zip'),Buffer.concat([...local,directory,end]));
console.log(`Static build ready: ${manifest.length} source files, source ZIP ${Buffer.concat([...local,directory,end]).length.toLocaleString()} bytes.`);
