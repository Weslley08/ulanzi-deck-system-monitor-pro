import test from 'node:test';import assert from 'node:assert/strict';import{Store,sample,classify,display}from'../src/core.js';import{NetworkCounter,PingWindow,flattenSensors}from'../src/providers.js';
test('missing/stale not zero',()=>{const s=new Store(1000);assert.equal(display(s.get('cpu.usage')),'N/D');s.put([sample('cpu.usage',40,'test',100)]);assert.equal(s.get('cpu.usage',2000).quality,'stale');});
test('thresholds',()=>assert.equal(classify(sample('cpu.temperature',91),{'cpu.temperature':{warning:80,critical:90}}),'critical'));
test('throughput Mbps',()=>{const n=new NetworkCounter();n.update({rx:0,tx:0,at:1000});const v=n.update({rx:1000000,tx:500000,at:2000});assert.equal(v[0].value,8);assert.equal(v[1].value,4);});
test('ping/loss/jitter',()=>{const p=new PingWindow(3);p.update(20);p.update(null);const s=p.update(40);assert.ok(Math.abs(s[2].value-100/3)<1e-9);assert.equal(s[1].value,20);});
test('recursive sensors',()=>assert.equal(flattenSensors({Children:[{Text:'CPU Package',Value:'60 °C'}]}).length,1));
