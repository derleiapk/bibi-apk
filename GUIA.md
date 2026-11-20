# Bibi APK — guia (tudo grátis, só pelo celular)

## Como a IA da criança funciona no APK (híbrido)
1. O app manda a fala para o **seu servidor** (Cloudflare Worker, grátis).
2. O servidor tenta **Groq** → se falhar ou acabar a cota, **Gemini** → se falhar, **Workers AI** da Cloudflare.
3. Se tudo falhar, ou se não houver internet, a criança responde com as **regras locais** do jogo.
As chaves ficam só no servidor. Quem baixar o APK não vê as chaves e não gasta nada seu: nenhum dos três serviços cobra no plano grátis. Quando a cota acaba, eles só param de responder até o dia seguinte.

## Passo 1 — Chaves grátis
- Groq: console.groq.com → entrar → **API Keys** → Create → copie (gsk_...).
- Gemini: aistudio.google.com → **Get API key** → Create → copie (AIza...).
  (No plano grátis do Gemini, o Google pode usar as conversas para treinar a IA. Se não quiser isso, deixe só o Groq e a Cloudflare.)

## Passo 2 — Servidor (Cloudflare Worker)
1. dash.cloudflare.com → crie uma conta grátis.
2. **Compute (Workers)** → **Create** → **Start with Hello World** → nome: `bibi-ia` → Deploy.
3. **Edit code** → apague tudo → cole o conteúdo de `worker.js` → **Deploy**.
4. No worker: **Settings → Variables and Secrets → Add**:
   - `GROQ_KEY` (Secret) = chave do Groq
   - `GEMINI_KEY` (Secret) = chave do Gemini
   - `APP_KEY` (Secret) = uma senha que você inventa, ex.: `bibi-2026-lua`
5. **Settings → Bindings → Add → Workers AI** → nome da variável: `AI`.
6. (Opcional, limite por celular) **Storage → KV → Create** `bibi-limites`; depois, no worker, **Bindings → Add → KV namespace** → nome `LIMITS`. Padrão: 150 falas por celular por dia (mude com a variável `DAILY_LIMIT`).
7. Copie o endereço do worker (ex.: `https://bibi-ia.SEUNOME.workers.dev`). Abra no navegador: tem que aparecer `"ok":true` e `"groq":true`.

## Passo 3 — GitHub
1. Crie um repositório novo (ex.: `bibi-apk`).
2. **Add file → Upload files**: envie `index.html`, `icon.png`, `worker.js` e `GUIA.md` → Commit.
3. **Add file → Create new file** → no nome escreva exatamente `.github/workflows/build.yml` → cole o conteúdo de `build.yml` → Commit.
4. **Settings → Secrets and variables → Actions → aba Variables → New repository variable**:
   - `AI_URL` = endereço do worker (passo 2.7)
   - `APP_KEY` = a mesma senha do passo 2.4
5. **Actions → Gerar APK do Bibi → Run workflow**. Em ~5–8 min, abra a execução → **Artifacts → Bibi-apk** → baixe o zip → dentro está `Bibi.apk`.

## Passo 4 — Levar a Mia para o APK
1. No Bibi do Claude (link da Mia): **Opções → 📤 Exportar criança**. O código é copiado.
2. No APK: **📥 Trazer criança de outro aparelho** → cole o código → **Trazer**.
O APK salva no próprio celular. Para levar de volta, use Exportar/Trazer do mesmo jeito.

## Atualizar o jogo depois
Envie o `index.html` novo no GitHub (Upload files, substituindo). O Actions gera um APK novo sozinho.

## Observações
- É um APK de teste (debug): para instalar, o Android pede para permitir "instalar apps desconhecidos". Para a Play Store seria preciso assinar o app (dá para fazer depois).
- Os nomes dos modelos de IA mudam com o tempo. Se um sair do ar, o servidor passa para o próximo. Dá para trocar sem mexer no código, pelas variáveis `GROQ_MODELS`, `GEMINI_MODELS` e `CF_MODELS`.
