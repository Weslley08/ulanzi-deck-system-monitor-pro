import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';
import { PLUGIN_FOLDER, zipPath } from './lib/project.mjs';
import { readZip } from './lib/zip.mjs';
import { scanFile, reportFindings } from './lib/secrets.mjs';
const zipBytes=readFileSync(zipPath);
if(zipBytes.length>50*1024*1024)throw Error('plugin exceeds 50 MB');
const zip=readZip(zipBytes);
const key=p=>`${PLUGIN_FOLDER}/${p}`;
const get=p=>zip.get(key(p));
const must=p=>{if(!get(p))throw Error('package missing '+p);};
const forbidden=/(^|\/)(\.env[^/]*|\.git|CLAUDE\.md|package-lock\.json|\.npmrc|\.github|test|tests|docs)(\/|$)/;
for(const [name] of zip){if(!name.startsWith(PLUGIN_FOLDER+'/')||name.includes('..'))throw Error('unsafe package path '+name);if(forbidden.test(name.slice(PLUGIN_FOLDER.length+1)))throw Error('forbidden package path '+name);}
for(const p of ['manifest.json','package.json','THIRD_PARTY_NOTICES.md','plugin/app.js','plugin/ulanzi-api/LICENSE','libs/LICENSE','en.json'])must(p);
const manifest=JSON.parse(get('manifest.json').toString('utf8'));
if(manifest.UUID.split('.').length!==4)throw Error('manifest UUID not 4 segments');
if(manifest.Version!=='0.1.0')throw Error('manifest/package version mismatch');
const png=p=>{const data=get(p);return data?.subarray(1,4).toString()==='PNG'?[data.readUInt32BE(16),data.readUInt32BE(20)]:null;};
for(const p of [manifest.Icon,manifest.CategoryIcon,manifest.CodePath])must(p);
if((png(manifest.Icon)||[]).join('x')!=='196x196')throw Error('plugin icon not 196x196 PNG');
if(!manifest.Actions?.length)throw Error('actions missing');
for(const a of manifest.Actions){if(!a.UUID.startsWith(manifest.UUID+'.')||a.UUID.split('.').length<=4)throw Error('bad action UUID '+a.UUID);must(a.Icon);must(a.PropertyInspectorPath);for(const s of a.States||[])must(s.Image);}
for(const banner of manifest.Banner||[]){must(banner);const size=png(banner);if(!size||Math.abs(size[0]/size[1]-1.5)>.01)throw Error('bad banner dimensions '+banner);}
const deps=JSON.parse(get('package.json').toString('utf8')).dependencies||{};for(const name of Object.keys(deps))must('node_modules/'+name+'/package.json');
const found=[...zip].flatMap(([name,data])=>scanFile(name,data));if(found.length){reportFindings(found);throw Error('secrets scan failed');}
const dir=mkdtempSync(join(tmpdir(),'system-monitor-zip-'));let host,child;
try{
for(const [name,data]of zip){const path=resolve(dir,name);if(!path.startsWith(resolve(dir)+requireSeparator()))throw Error('zip path escape');mkdirSync(dirname(path),{recursive:true});writeFileSync(path,data);}
host=new WebSocketServer({host:'127.0.0.1',port:0});await once(host,'listening');
const port=host.address().port;
const connected=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('plugin did not connect to host')),10000);host.once('connection',socket=>{socket.once('message',data=>{try{const m=JSON.parse(String(data));if(m.cmd!=='connected')throw Error('unexpected first message '+m.cmd);clearTimeout(timer);resolve();}catch(e){reject(e);}})});});
child=spawn(process.execPath,[join(dir,PLUGIN_FOLDER,manifest.CodePath),'127.0.0.1',String(port),'en'],{cwd:join(dir,PLUGIN_FOLDER),stdio:'ignore',env:{...process.env,LHM_JSON_URL:'',PRESENTMON_CSV:'',PING_TARGET:'127.0.0.1'}});
child.once('error',e=>{});
await connected;
console.log('Package verified: ZIP contents, dependencies, licensing, manifest, secrets and host connection');
}finally{child?.kill();host?.close();rmSync(dir,{recursive:true,force:true});}
function requireSeparator(){return process.platform==='win32'?'\\':'/';}
