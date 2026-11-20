// =====================================================================
// Bibi – cérebro da criança (Cloudflare Worker, plano grátis)
// Tenta, em ordem: Groq -> Gemini -> Cloudflare Workers AI.
// Se todos falharem, o app usa as respostas locais do próprio jogo.
// As chaves ficam aqui no servidor (Settings > Variables and Secrets),
// nunca dentro do APK.
//
// Secrets (opcionais, quanto mais, melhor):
//   GROQ_KEY      -> console.groq.com  (API Keys)
//   GEMINI_KEY    -> aistudio.google.com (Get API key)
//   APP_KEY       -> uma senha qualquer, igual à variável APP_KEY do GitHub
// Binding opcional:
//   AI            -> Workers AI (Settings > Bindings > Add > Workers AI, nome "AI")
//   LIMITS        -> KV namespace (para limitar mensagens por celular/dia)
// Variáveis opcionais:
//   DAILY_LIMIT   -> mensagens por celular por dia (padrão 150)
//   GROQ_MODELS, GEMINI_MODELS, CF_MODELS -> listas separadas por vírgula
// =====================================================================

const DEF = {
  GROQ_MODELS: 'openai/gpt-oss-120b,openai/gpt-oss-20b',
  GEMINI_MODELS: 'gemini-flash-lite-latest,gemini-flash-latest',
  CF_MODELS: '@cf/meta/llama-3.1-8b-instruct-fast,@cf/meta/llama-3.1-8b-instruct',
};

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type, x-bibi-key, x-bibi-device',
};
const out = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...CORS } });

function parseJSON(txt) {
  if (!txt) return null;
  txt = String(txt).replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  try { return JSON.parse(txt); } catch (e) {}
  const m = txt.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (e) {} }
  return null;
}

async function openaiStyle(url, key, model, messages, extra) {
  const body = { model, messages, temperature: 0.8, max_tokens: 400, ...extra };
  let r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
    body: JSON.stringify(body),
  });
  if (r.status === 400 && extra && Object.keys(extra).length) {
    // modelo não aceitou algum parâmetro extra: tenta sem eles
    r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
      body: JSON.stringify({ model, messages, temperature: 0.8, max_tokens: 400 }),
    });
  }
  if (!r.ok) throw new Error(model + ' ' + r.status);
  const j = await r.json();
  return j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
}

async function tryProviders(env, messages) {
  const list = (v, d) => (v || d).split(',').map(s => s.trim()).filter(Boolean);
  const errors = [];
  if (env.GROQ_KEY) {
    for (const m of list(env.GROQ_MODELS, DEF.GROQ_MODELS)) {
      try {
        const extra = { response_format: { type: 'json_object' } };
        if (m.includes('gpt-oss')) extra.reasoning_effort = 'low';
        const d = parseJSON(await openaiStyle('https://api.groq.com/openai/v1/chat/completions', env.GROQ_KEY, m, messages, extra));
        if (d) return { data: d, via: 'groq:' + m };
      } catch (e) { errors.push(String(e.message || e)); }
    }
  }
  if (env.GEMINI_KEY) {
    for (const m of list(env.GEMINI_MODELS, DEF.GEMINI_MODELS)) {
      try {
        const d = parseJSON(await openaiStyle('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', env.GEMINI_KEY, m, messages,
          { response_format: { type: 'json_object' }, reasoning_effort: 'low' }));
        if (d) return { data: d, via: 'gemini:' + m };
      } catch (e) { errors.push(String(e.message || e)); }
    }
  }
  if (env.AI) {
    for (const m of list(env.CF_MODELS, DEF.CF_MODELS)) {
      try {
        const r = await env.AI.run(m, { messages, max_tokens: 400, temperature: 0.8 });
        const d = parseJSON(r && (r.response || r.result));
        if (d) return { data: d, via: 'cf:' + m };
      } catch (e) { errors.push(String(e.message || e)); }
    }
  }
  return { data: null, errors };
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (req.method === 'GET') return out({ ok: true, nome: 'Bibi IA', groq: !!env.GROQ_KEY, gemini: !!env.GEMINI_KEY, workersAI: !!env.AI });
    if (req.method !== 'POST') return out({ error: 'method' }, 405);

    if (env.APP_KEY && req.headers.get('x-bibi-key') !== env.APP_KEY) return out({ error: 'key' }, 401);

    // limite diário por celular (só se houver KV "LIMITS")
    const dev = (req.headers.get('x-bibi-device') || 'anon').slice(0, 40);
    let kvKey = null, used = 0;
    if (env.LIMITS) {
      const day = new Date().toISOString().slice(0, 10);
      kvKey = `d:${day}:${dev}`;
      used = parseInt(await env.LIMITS.get(kvKey) || '0', 10);
      if (used >= parseInt(env.DAILY_LIMIT || '150', 10)) return out({ error: 'limit' }, 429);
    }

    let body;
    try { body = await req.json(); } catch (e) { return out({ error: 'json' }, 400); }
    let messages = Array.isArray(body.messages) ? body.messages : [];
    messages = messages
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-20)
      .map(m => ({ role: m.role, content: m.content.slice(0, 8000) }));
    if (!messages.length) return out({ error: 'empty' }, 400);
    // reforço: sempre responder em JSON
    messages = [{ role: 'system', content: 'Responda somente com um objeto JSON válido, sem texto fora dele.' }, ...messages];

    const res = await tryProviders(env, messages);
    if (!res.data) return out({ error: 'all_failed', detail: res.errors.slice(-4) }, 502);
    if (kvKey) await env.LIMITS.put(kvKey, String(used + 1), { expirationTtl: 60 * 60 * 30 });
    return out({ data: res.data, via: res.via });
  },
};
