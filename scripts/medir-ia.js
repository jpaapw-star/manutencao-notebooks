// Mede cada modelo de IA nas fotos reais de etiqueta (tests/etiquetas): tempo e o que leu.
// Uso no CI: GEMINI_API_KEY=... node scripts/medir-ia.js
const fs = require('fs');
const path = require('path');
const chave = (process.env.GEMINI_API_KEY || '').trim();
if (!chave) { console.log('Sem GEMINI_API_KEY: pulando.'); process.exit(0); }
// Pega o pedido exato que o app monta (mesmo texto e esquema), sem chamar a IA.
let pedido = null;
const UrlFetchApp = { fetch: (url, o) => { if (!pedido) pedido = JSON.parse(o.payload); return { getResponseCode: () => 599 }; } };
const m = { exports: {} };
new Function('module', 'UrlFetchApp', 'SEGREDOS', fs.readFileSync(path.join(__dirname, '..', 'src', 'Codigo.gs'), 'utf8') +
  '\nmodule.exports.apiLerComIA = apiLerComIA; module.exports.perguntaDescricao = perguntaDescricao; module.exports.descricaoDaResposta = descricaoDaResposta; module.exports.IA_MODELOS = IA_MODELOS; module.exports.IA_ETIQUETA = IA_ETIQUETA; module.exports.IA_URL = IA_URL;')(m, UrlFetchApp, { iaChave: 'x' });
const modelos = (process.env.MODELOS || '').split(',').filter(Boolean);
const lista = modelos.length ? modelos : ['gemini-3.1-flash-lite-preview', 'gemini-flash-lite-latest', 'gemini-3-flash-preview', 'gemini-flash-latest'];
(async () => {
  // Descrição pelo modelo (busca do Google), do jeito do app.
  for (const [marca, mod] of [['DELL', 'AC16-C7240H-D30'], ['POSITIVO', 'C4128B'], ['ACER', 'A515-45']]) {
    for (const ia of m.exports.IA_MODELOS) for (const busca of [true, false]) {
      const t0 = Date.now(); let txt = '';
      try {
        const r = await fetch(m.exports.IA_URL + ia + ':generateContent?key=' + encodeURIComponent(chave), { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: m.exports.perguntaDescricao(marca, mod) }] }], tools: busca ? [{ google_search: {} }] : undefined, generationConfig: { temperature: 0 } }) });
        const j = await r.json();
        txt = r.status === 200 ? '=> ' + m.exports.descricaoDaResposta(j.candidates[0].content.parts.map(x => x.text || '').join(' ')) : 'HTTP ' + r.status + ' ' + String((j.error || {}).message || '').slice(0, 160);
      } catch (e) { txt = 'falhou: ' + e.message; }
      console.log(`descrição ${marca} ${mod} | ${ia}${busca ? ' +busca' : ' sem busca'} | ${((Date.now() - t0) / 1000).toFixed(1)} s | ${txt.slice(0, 200)}`);
    }
  }
  if (process.env.SO_DESCRICAO) return;
  const fotos = fs.readdirSync(path.join(__dirname, '..', 'tests', 'etiquetas')).filter(f => /\.jpe?g$/i.test(f));
  for (const f of fotos) {
    const b64 = fs.readFileSync(path.join(__dirname, '..', 'tests', 'etiquetas', f)).toString('base64');
    pedido = null; m.exports.apiLerComIA(b64, {});
    for (const mod of lista) {
      for (const pensar of ['minimal', '']) {
        const p = JSON.parse(JSON.stringify(pedido));
        if (pensar) p.generationConfig.thinkingConfig = { thinkingLevel: pensar }; else delete p.generationConfig.thinkingConfig;
        const t0 = Date.now();
        let txt = '';
        try {
          const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 60000);
          const r = await fetch(m.exports.IA_URL + mod + ':generateContent?key=' + encodeURIComponent(chave), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p), signal: ctl.signal });
          clearTimeout(tm);
          const j = await r.json();
          txt = r.status === 200 ? j.candidates[0].content.parts.map(x => x.text || '').join('') : 'HTTP ' + r.status + ' ' + String((j.error || {}).message || '').slice(0, 80);
        } catch (e) { txt = 'falhou: ' + e.message; }
        console.log(`${f} | ${mod} | pensar=${pensar || 'padrão'} | ${((Date.now() - t0) / 1000).toFixed(1)} s | ${txt.replace(/\s+/g, ' ').slice(0, 200)}`);
      }
    }
  }
})();
