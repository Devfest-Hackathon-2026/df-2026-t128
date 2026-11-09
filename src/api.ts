export async function request<T>(path: string, body?: unknown): Promise<T> {
  // Requests are only sent to this application's API, never arbitrary URLs/redirects.
  if (!/^\/api\/[a-zA-Z0-9/_-]+$/.test(path)) throw new Error('無効なAPIパスです。');
  const headers: Record<string, string> = body === undefined ? {} : { 'Content-Type': 'application/json' };
  const response = await fetch(path, {
    signal: AbortSignal.timeout(25_000), redirect: 'error', credentials: 'same-origin',
    method: body === undefined ? 'GET' : 'POST', headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch((error: unknown) => {
    if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new Error('応答に時間がかかっています。入力は残っていますので、少し待ってから再度お試しください。');
    }
    throw new Error('サーバーに接続できませんでした。接続を確認して、もう一度お試しください。');
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error || '接続できませんでした。少し待ってからもう一度お試しください。');
  if (!result) throw new Error('応答を読み取れませんでした。もう一度お試しください。');
  return result as T;
}


export function createSessionReleaser(): (id: string) => Promise<boolean> {
  return async id => {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) return false;
    try {
      return (await fetch('/api/sessions/' + id, { method: 'DELETE', credentials: 'same-origin',
        redirect: 'error', keepalive: true, signal: AbortSignal.timeout(5000) })).status === 204;
    } catch { return false; }
  };
}
