import test from 'node:test';
import assert from 'node:assert/strict';
import {readPcmStream} from './speech-stream.js';
test('emits a complete SSE audio part before the final event, across network boundaries', async()=>{
  let writer!:ReadableStreamDefaultController<Uint8Array>;
  const stream=new ReadableStream<Uint8Array>({start(c){writer=c;}});
  const frame='data: '+JSON.stringify({candidates:[{content:{parts:[{inlineData:{mimeType:'audio/L16;rate=24000',data:'AQI='}}]}}]})+'\r\n\r\n';
  let emitted!:()=>void;const first=new Promise<void>(r=>emitted=r);
  const result=readPcmStream(stream,bytes=>{assert.deepEqual([...bytes],[1,2]);emitted();});
  writer.enqueue(Buffer.from(frame.slice(0,25)));writer.enqueue(Buffer.from(frame.slice(25)));
  await first;writer.enqueue(Buffer.from('data: {"candidates":[{"finishReason":"STOP"}]}\n'));writer.close();
  assert.deepEqual([...await result],[1,2]);
});
