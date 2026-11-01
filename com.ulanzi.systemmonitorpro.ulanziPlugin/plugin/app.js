// Requires official SDK in plugin/ulanzi-api and packaging of src/config dependencies.
import UlanziApi from './ulanzi-api/index.js';
import{Store}from'../../src/core.js';
import{readLhm,readRam,readWindowsCounters,NetworkCounter,pingOnce,PingWindow,readPresentMonCsv}from'../../src/providers.js';
import{MonitorActions,PLUGIN_UUID}from'../../src/ulanzi.js';
import{readFile}from'node:fs/promises';
const cfg=JSON.parse(await readFile(new URL('../../config/defaults.json',import.meta.url),'utf8'));
const api=new UlanziApi(),store=new Store(cfg.display.staleAfterMs),actions=new MonitorActions(api,store,cfg.thresholds),network=new NetworkCounter(),ping=new PingWindow(cfg.ping.windowSize),address=process.argv[2],port=process.argv[3],timers=[];
let retry=0,reconnectTimer;
function log(e){api.logMessage(String(e?.message||e).slice(0,180),'error');}
async function collect(fn){try{const x=await fn();if(x?.length){store.put(x);actions.renderAll();}}catch(e){log(e);}}
function schedule(fn,ms){void collect(fn);timers.push(setInterval(()=>void collect(fn),ms));}
schedule(async()=>[...readRam(),...await readLhm(process.env.LHM_JSON_URL||'http://127.0.0.1:8085/data.json')],cfg.sampleIntervalsMs.hardware);
schedule(()=>readPresentMonCsv(process.env.PRESENTMON_CSV||''),cfg.sampleIntervalsMs.fps);
schedule(async()=>{const n=await readWindowsCounters();return n?network.update(n):[];},cfg.sampleIntervalsMs.network);
schedule(async()=>ping.update(await pingOnce(process.env.PING_TARGET||cfg.ping.targets[0],cfg.ping.timeoutMs)),cfg.sampleIntervalsMs.ping);
api.onAdd(x=>actions.upsert(x));api.onParamFromApp(x=>actions.upsert(x));api.onParamFromPlugin(x=>actions.upsert(x));
api.onSetActive(x=>actions.setActive(x));api.onClear(x=>actions.clear(x));
api.onRun(x=>{try{actions.render(x.context,true);}catch(e){log(e);api.showAlert(x.context);}});
api.onConnected(()=>{retry=0;for(const ctx of actions.instances.keys())actions.render(ctx,true);});
api.onClose(()=>{if(reconnectTimer||retry>=10)return;reconnectTimer=setTimeout(()=>{reconnectTimer=null;api.connect(PLUGIN_UUID,port,address);},Math.min(30000,1000*2**retry++));});
api.onError(()=>{});
function stop(){for(const t of timers)clearInterval(t);if(reconnectTimer)clearTimeout(reconnectTimer);process.exit(0);}
process.once('SIGTERM',stop);process.once('SIGINT',stop);api.connect(PLUGIN_UUID);
