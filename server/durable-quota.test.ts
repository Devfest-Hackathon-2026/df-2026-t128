import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sqliteQuota, firestoreQuota, serviceQuota } from './durable-quota.js';
import { withGenerationLimits } from './generation-limits.js';
import { demoProvider } from './provider.js';
import { scenarios } from '../shared/scenarios.js';
import type {Session} from '../shared/types.js';
const scene=scenarios[0];
const session:Session={id:'local',scenarioId:scene.id,actionId:scene.actions[0].id,status:'completed',mode:'gemini',turnCount:1,maxTurns:5,messages:[{role:'user',text:'こんにちは'}]};

test('a failed reply and a reflection share one durable budget across connections and restart',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kindsignal-budget-')), file=join(dir,'quota.sqlite');
  let calls=0;
  const provider={...demoProvider, mode:'gemini' as const, reply:async()=>{calls++;throw Error('response lost');}, reflect:async()=>{calls++;return demoProvider.reflect(scene,session);}};
  const wrap=(reserve:()=>void)=>withGenerationLimits(provider,undefined,undefined,reserve);
  try {
    const a=sqliteQuota(file,2), b=sqliteQuota(file,2);
    try {await assert.rejects(wrap(a.reserve).reply(scene,session,'hello'),/response lost/);
      const results=await Promise.allSettled([a,b].map(q=>wrap(q.reserve).reflect(scene,session)));
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    } finally {a.close();b.close();}
    const restarted=sqliteQuota(file,2);
    try {await assert.rejects(wrap(restarted.reserve).reflect(scene,session),/limit/);assert.equal(calls,2);} finally {restarted.close();}
  } finally {rmSync(dir,{recursive:true});}
});

test('production never falls back to an ephemeral local counter',()=>{
  assert.throws(()=>serviceQuota({K_SERVICE:'run',AI_MAX_SERVICE_ATTEMPTS:'5', AI_QUOTA_STORE:'sqlite', AI_QUOTA_FILE:'/tmp/unsafe'}),/firestore/);
  assert.throws(()=>serviceQuota({}),/AI_MAX_SERVICE_ATTEMPTS/);
});

test('competing Firestore reservations with the same observed version authorize only one call',async()=>{
  let written=false, reads=0;
  const transport:typeof fetch=async(url,options)=>{
    if(options?.method!=='PATCH'){reads++;return Response.json({fields:{used:{integerValue:'1'}},updateTime:'v1'});}
    assert.equal(new URL(String(url)).searchParams.get('currentDocument.updateTime'),'v1');
    assert.equal(JSON.parse(String(options.body)).fields.used.integerValue,'2');
    if(written)return new Response(null,{status:409});
    written=true;return Response.json({});
  };
  const reserve=firestoreQuota('kindsignal-test',2,async()=>new Headers(),transport);
  const results=await Promise.allSettled([reserve(),reserve()]);
  assert.equal(reads,2);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  for(const read of [new Response(null,{status:404}),Response.json({fields:{},updateTime:'v1'}),Response.json({fields:{used:{integerValue:'2'}},updateTime:'v1'})]){
    await assert.rejects(firestoreQuota('kindsignal-test',2,async()=>new Headers(),async(_url,opts)=>{assert.notEqual(opts?.method,'PATCH');return read;}));
  }
});

test('exhausting anonymous reply retries preserves ending, one reflection and cached reads', async()=>{
  const {createApp}=await import('./app.js');
  let replies=0, reflections=0;
  const app=createApp({...demoProvider, mode:'gemini',
    reply:async()=>{if(++replies>1)throw Error('unavailable');return 'わかりました。';},
    reflect:async(s,c)=>{reflections++;return demoProvider.reflect(s,c);}
  }, {secureCookie:false});
  const http=app.listen(0,'127.0.0.1');
  try {
    const {once}=await import('node:events');
    if(!http.listening)await once(http,'listening');
    const addr=http.address();assert.ok(addr && typeof addr==='object');
    const base='http://127.0.0.1:'+addr.port+'/api/sessions';let cookie='';
    const post=(p:string,body:unknown)=>fetch(base+p,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});
    const start=await post('',{scenarioId:'shop',actionId:'shop-approach',adultConfirmed:true});assert.equal(start.status,201);
    cookie=start.headers.get('set-cookie')!.split(';')[0];const path='/'+(await start.json()).session.id;
    for(let n=0;n<9;n++)assert.equal((await post(path+'/messages',{text:'何かお探しですか。'})).status,n===0?200:502);
    assert.equal((await post(path+'/messages',{text:'こんにちは'})).status,429);
    assert.equal(replies,9);assert.equal((await post(path+'/end',{reason:'finish'})).status,200);
    for(let n=0;n<2;n++)assert.equal((await post(path+'/reflection',{})).status,200);
    assert.equal(reflections,1);assert.equal((await fetch(base+path,{method:'DELETE',headers:{Cookie:cookie}})).status,204);
  } finally {app.locals.dispose();http.closeAllConnections();http.close();}
});
