import { GoogleAuth } from 'google-auth-library';
import { positiveInteger } from './config.js';

type Dependencies = {
  fetch?: typeof fetch;
  accessToken?: () => Promise<string | null>;
};

export function createGenerator(env: NodeJS.ProcessEnv, dependencies: Dependencies = {}) {
  const backend = env.GEMINI_BACKEND ?? 'developer';
  const model = env.GEMINI_MODEL?.trim();
  if (!model || !/^[a-zA-Z0-9._-]+$/.test(model)) throw new Error('A valid GEMINI_MODEL is required.');
  const timeoutMs = positiveInteger(env.AI_TIMEOUT_MS, 20000, 'AI_TIMEOUT_MS', 60000);
  let url: string;
  let headers: () => Promise<Record<string, string>>;
  if (backend === 'vertex') {
    const project = env.GOOGLE_CLOUD_PROJECT?.trim();
    const location = env.GOOGLE_CLOUD_LOCATION?.trim();
    if (!project || !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project) ||
        !location || !/^(global|[a-z]+-[a-z]+\d+)$/.test(location)) {
      throw new Error('Vertex requires valid GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION.');
    }
    const hostname = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;
    url = `https://${hostname}/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`;
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    headers = async () => {
      if (dependencies.accessToken) {
        const value = await dependencies.accessToken();
        if (!value) throw new Error('ADC token unavailable');
        return { Authorization: `Bearer ${value}` };
      }
      // Preserve ADC quota-project headers for local user credentials as well as
      // refreshable bearer authorization from the Cloud Run service identity.
      const result = await auth.getRequestHeaders(url);
      if (!result.get('authorization')) throw new Error('ADC token unavailable');
      return Object.fromEntries(result.entries());
    };
  } else if (backend === 'developer') {
    const key = env.GEMINI_API_KEY?.trim();
    if (!key) throw new Error('Developer API requires GEMINI_API_KEY.');
    url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    headers = async () => ({ 'x-goog-api-key': key });
  } else {
    throw new Error('GEMINI_BACKEND must be developer or vertex.');
  }
  const fetcher = dependencies.fetch ?? fetch;
  return async (system: string, contents: unknown[], jsonSchema?: object): Promise<string> => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('AI deadline exceeded')); }, timeoutMs);
    });
    try {
      // Covers ADC discovery/token refresh as well as the HTTP request and body read.
      // No automatic retries: generation can incur a charge even if its response is lost.
      return await Promise.race([deadline, (async () => {
        const authHeaders = await headers();
        if (controller.signal.aborted) throw new Error('AI deadline exceeded');
        const response = await fetcher(url, {
          method: 'POST', redirect: 'error', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] }, contents,
            generationConfig: { maxOutputTokens: 2048, ...(jsonSchema ? { responseMimeType: 'application/json', responseJsonSchema: jsonSchema } : {}) },
          }),
        });
        if (!response.ok) throw new Error('AI request failed');
        const data = await response.json() as { candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
        const candidate = data.candidates?.[0];
        if (candidate?.finishReason !== 'STOP') throw new Error('AI did not complete its response');
        const text = candidate.content?.parts?.filter(p => !p.thought).map(p => p.text ?? '').join('').trim();
        if (!text || text.length > 6000) throw new Error('Invalid AI response');
        return text;
      })()]);
    } finally { clearTimeout(timer!); }
  };
}
