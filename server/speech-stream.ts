// Vertex SSE sends 24 kHz mono signed little-endian PCM in inlineData parts.
export async function readPcmStream(body:ReadableStream<Uint8Array>, emit:(bytes:Buffer)=>void) {
  const reader=body.getReader(), decoder=new TextDecoder(), chunks:Buffer[]=[];
  let pending='', wire=0, size=0, finished=false;
  function line(s:string) {
    if(!s.startsWith('data:')) return;
    const data=s.slice(5).trim(); if(!data || data==='[DONE]') return;
    const item=JSON.parse(data);
    if(item.error) throw Error('Speech stream failed');
    const candidate=item.candidates?.[0];
    for(const part of candidate?.content?.parts ?? []) {
      const a=part.inlineData; if(!a) continue;
      if(!/^audio\/(L16|pcm)\b/i.test(a.mimeType) || (/rate=/i.test(a.mimeType) && !/rate=24000\b/i.test(a.mimeType))) throw Error('Unexpected PCM format');
      const bytes=Buffer.from(a.data,'base64');
      size+=bytes.length;
      if(size>1_199_952 || !bytes.length || bytes.length%2) throw Error('Invalid PCM size');
      chunks.push(bytes); emit(bytes);
    }
    if(candidate?.finishReason) { if(candidate.finishReason!=='STOP') throw Error('Incomplete audio'); finished=true; }
  }
  try { for(;;) {
    const {value,done}=await reader.read(); if(done) break;
    wire+=value.length; if(wire>2_000_000) throw Error('Speech stream too large');
    pending+=decoder.decode(value,{stream:true}); const lines=pending.split('\n'); pending=lines.pop()!;
    for(const s of lines) line(s);
  }
  line(pending+decoder.decode());
  if(!finished || !size) throw Error('Incomplete audio');
  return Buffer.concat(chunks);
  } catch(e){ await reader.cancel().catch(()=>{}); throw e; } finally { reader.releaseLock(); }
}
