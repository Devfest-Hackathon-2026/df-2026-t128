import { withVoiceDeadline } from './voice-deadline';

let context: AudioContext | undefined;
export function voiceContext() { return context ??= new AudioContext(); }
// Called inside a user gesture, before session creation or synthesis.
export function unlockVoice() { try { void voiceContext().resume().catch(()=>{}); } catch { /* manual playback is still available */ } }

export function createVoicePlayer(deps: {
  context?: () => AudioContext; fetch?: typeof fetch; requestTimeoutMs?: number; totalTimeoutMs?: number;
} = {}) {
return async function playLine(opening:string|undefined, sessionId:string, index:number, parent:AbortSignal, started:()=>void, manual=false) {
 return withVoiceDeadline(parent, deps.totalTimeoutMs ?? 60_000, async signal => {
  const ctx=(deps.context ?? voiceContext)();
  const fetcher=deps.fetch ?? fetch;
  if(manual) await ctx.resume();
  signal.throwIfAborted();
  if(ctx.state !== 'running') throw new DOMException('Tap to play','NotAllowedError');
  const sources=new Set<AudioBufferSourceNode>();
  let next=0, first=true;
  const stop=()=>{ for(const s of sources) {try{s.stop()}catch{} s.disconnect();} sources.clear(); };
  signal.addEventListener('abort', stop,{once:true});
  const queue=(buffer:AudioBuffer)=>{
    signal.throwIfAborted();
    const s=ctx.createBufferSource(); s.buffer=buffer; s.connect(ctx.destination); sources.add(s);
    s.onended=()=>{sources.delete(s);s.disconnect();};
    const at=Math.max(ctx.currentTime+.012,next); s.start(at);next=at+buffer.duration;
    if(first){first=false;started();}
  };
  try {
    await withVoiceDeadline(signal, deps.requestTimeoutMs ?? 25_000, async networkSignal => {
    const r=opening ? await fetcher(opening,{signal:networkSignal,redirect:'error'}) : await fetcher('/api/sessions/'+sessionId+'/speech',{
      method:'POST',signal:networkSignal,credentials:'same-origin',redirect:'error',
      headers:{'Content-Type':'application/json',Accept:'audio/x-kindsignal-pcm'},body:JSON.stringify({messageIndex:index})
    });
    networkSignal.throwIfAborted();
    if(!r.ok) throw Error('Voice unavailable');
    if(opening) queue(await ctx.decodeAudioData(await r.arrayBuffer()));
    else if(r.headers.get('content-type')?.includes('audio/x-kindsignal-pcm') && r.body) {
      const reader=r.body.getReader();let spare:number|undefined;
      const cancelRead=()=>{void reader.cancel().catch(()=>{});};
      networkSignal.addEventListener('abort',cancelRead,{once:true});
      try{for(;;){const {done,value}=await reader.read();if(done)break;
        networkSignal.throwIfAborted();
        const bytes=spare===undefined?value:new Uint8Array([spare,...value]); const n=bytes.byteLength>>1;
        spare=bytes.length%2?bytes[bytes.length-1]:undefined;if(!n)continue;
        const pcm=new DataView(bytes.buffer,bytes.byteOffset,2*n), buffer=ctx.createBuffer(1,n,24000), floats=buffer.getChannelData(0);
        for(let i=0;i<n;i++)floats[i]=pcm.getInt16(i*2,true)/32768;
        queue(buffer);
      }}finally{networkSignal.removeEventListener('abort',cancelRead);reader.releaseLock();}
      networkSignal.throwIfAborted();
      if(first || spare!==undefined)throw Error('Incomplete audio');
    } else {
      const {audioContent}=await r.json();queue(await ctx.decodeAudioData(Uint8Array.from(atob(audioContent),c=>c.charCodeAt(0)).buffer));
    }
    networkSignal.throwIfAborted();
    });
    while(sources.size){signal.throwIfAborted();await new Promise(r=>setTimeout(r,50));}
    signal.throwIfAborted();
  } finally {signal.removeEventListener('abort',stop);stop();}
 });
};
}

export const playLine = createVoicePlayer();
