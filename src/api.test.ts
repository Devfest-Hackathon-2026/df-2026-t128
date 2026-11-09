import test from 'node:test';
import assert from 'node:assert/strict';
import { request, createSessionReleaser } from './api';

test('API and cleanup send only same-origin cookies; external URLs are rejected', async () => {
  const original = globalThis.fetch;
  const methods: string[] = [];
  globalThis.fetch = async (_url, init) => {
    assert.equal(init?.credentials, 'same-origin');
    assert.equal(init?.redirect, 'error');
    assert.equal(new Headers(init?.headers).has('authorization'), false);
    methods.push(init!.method!);
    return init?.method === 'DELETE' ? new Response(null,{status:204}) : Response.json({ok:true});
  };
  try {
    await assert.rejects(request('https://example.org/api/config'));
    await request('/api/config'); await request('/api/sessions',{});
    assert.ok(await createSessionReleaser()('abc')); assert.deepEqual(methods,['GET','POST','DELETE']);
  } finally {globalThis.fetch=original;}
});
