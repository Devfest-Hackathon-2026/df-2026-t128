// Only a service-wide count is stored. No conversation or browser identifiers.
import { DatabaseSync } from 'node:sqlite';
import { isAbsolute } from 'node:path';
import { GoogleAuth } from 'google-auth-library';
import { GenerationLimitError } from './generation-limits.js';
import { positiveInteger } from './config.js';

export function sqliteQuota(file: string, limit: number) {
  if (!isAbsolute(file)) throw new Error('AI_QUOTA_FILE must be an absolute persistent file path');
  const db = new DatabaseSync(file);
  db.exec('PRAGMA busy_timeout=3000; CREATE TABLE IF NOT EXISTS usage (id INTEGER PRIMARY KEY CHECK(id=1), used INTEGER NOT NULL CHECK(used>=0)); INSERT OR IGNORE INTO usage VALUES(1,0)');
  const reserve = db.prepare('UPDATE usage SET used=used+1 WHERE id=1 AND used<?');
  return { reserve: () => { if (!reserve.run(limit).changes) throw new GenerationLimitError('total'); }, close: () => db.close() };
}

export function firestoreQuota(project: string, limit: number, headers: () => Promise<Headers>, transport = fetch) {
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project)) throw new Error('Invalid quota project');
  const url = 'https://firestore.googleapis.com/v1/projects/' + project + '/databases/(default)/documents/kindsignalQuota/service';
  return async () => {
    const auth = new Headers(await headers());
    auth.set('Content-Type', 'application/json');
    const init = { headers: auth, redirect: 'error' as const, signal: AbortSignal.timeout(5000) };
    const read = await transport(url, init);
    if (!read.ok) throw new Error('Quota counter unavailable');
    const doc = await read.json() as { fields?: { used?: { integerValue?: string } }; updateTime?: string };
    const raw = doc.fields?.used?.integerValue;
    if (typeof raw !== 'string' || !/^\d+$/.test(raw) || typeof doc.updateTime !== 'string' || !doc.updateTime) throw new Error('Invalid quota counter');
    const used = Number(raw);
    if (used >= limit) throw new GenerationLimitError('total');
    const query = new URLSearchParams({ 'currentDocument.updateTime': doc.updateTime, 'updateMask.fieldPaths': 'used' });
    const write = await transport(url + '?' + query, { ...init, method: 'PATCH', body: JSON.stringify({fields:{used:{integerValue:String(used+1)}}}) });
    // An uncertain or competing write never authorizes model execution.
    if (!write.ok) throw new Error('Quota reservation not confirmed');
  };
}

export function serviceQuota(env: NodeJS.ProcessEnv) {
  if (!env.AI_MAX_SERVICE_ATTEMPTS) throw new Error('Set AI_MAX_SERVICE_ATTEMPTS before enabling paid calls');
  const limit = positiveInteger(env.AI_MAX_SERVICE_ATTEMPTS, 0, 'AI_MAX_SERVICE_ATTEMPTS', 1000000);
  if (env.AI_QUOTA_STORE === 'firestore') {
    const auth = new GoogleAuth({scopes:['https://www.googleapis.com/auth/datastore']});
    return firestoreQuota(env.GOOGLE_CLOUD_PROJECT ?? '', limit, async () => new Headers(Object.fromEntries((await auth.getRequestHeaders()).entries())));
  }
  if (env.K_SERVICE || env.NODE_ENV === 'production' || env.AI_QUOTA_STORE !== 'sqlite') throw new Error('Production requires AI_QUOTA_STORE=firestore');
  return sqliteQuota(env.AI_QUOTA_FILE ?? '', limit).reserve;
}
