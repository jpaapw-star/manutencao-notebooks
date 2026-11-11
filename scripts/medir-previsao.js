// Mede a previsão do defeito pela IA em anotações reais dos técnicos: o que as regras dizem, o que a IA diz e o tempo.
// Uso no CI: GEMINI_API_KEY=... node scripts/medir-previsao.js
const fs = require('fs');
const path = require('path');
const chave = (process.env.GEMINI_API_KEY || '').trim();
if (!chave) { console.log('Sem GEMINI_API_KEY: pulando.'); process.exit(0); }
const m = { exports: {} };
new Function('module', fs.readFileSync(path.join(__dirname, '..', 'src', 'Codigo.gs'), 'utf8') +
  '\nmodule.exports.IA_MODELOS = IA_MODELOS; module.exports.IA_URL = IA_URL; module.exports.PREVER = PREVER;')(m);
const { preverPecas, perguntaPrevisao, previsaoDaIA, IA_MODELOS, IA_URL, PREVER } = m.exports;
const nomes = PREVER.map(p => p[0]);
const casos = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tests', 'previsao-casos.json'), 'utf8'));
const modelos = (process.env.MODELOS || '').split(',').filter(Boolean);
(async () => {
  let certos = {}, total = 0;
  for (const c of casos.filter(c => !process.env.SO || c.textos.join(' ').match(new RegExp(process.env.SO, 'i')))) {
    total++;
    console.log(`\n## ${c.it.MARCA} ${c.it.MODELO}: ${c.textos.join(' / ').slice(0, 110)}`);
    console.log(`esperado: ${c.esperado}`);
    console.log(`regras:   ${preverPecas('', c.textos).texto || '(nada)'}`);
    for (const iaP of (modelos.length ? modelos : ['gemini-3.1-flash-lite-preview@high', 'gemini-3.1-flash-lite-preview'])) {
      const [ia, pensar] = iaP.split('@');
      const t0 = Date.now(); let txt = '';
      try {
        const r = await fetch(IA_URL + ia + ':generateContent?key=' + encodeURIComponent(chave), { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(30000),
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: perguntaPrevisao(c.it, c.textos, nomes, []) }] }], generationConfig: pensar ? { temperature: 0, thinkingConfig: { thinkingLevel: pensar } } : { temperature: 0 } }) });
        const j = await r.json();
        if (r.status === 200) {
          txt = previsaoDaIA(j.candidates[0].content.parts.map(x => x.text || '').join(' '), nomes, c.textos).texto || '(nada)';
          if (txt === c.esperado) certos[iaP] = (certos[iaP] || 0) + 1;
        } else txt = 'HTTP ' + r.status + ' ' + String((j.error || {}).message || '').slice(0, 120);
      } catch (e) { txt = 'falhou: ' + e.message; }
      console.log(`${iaP} (${((Date.now() - t0) / 1000).toFixed(1)} s): ${txt}`);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  console.log('\nIguais ao esperado, de ' + total + ': ' + JSON.stringify(certos));
})();
