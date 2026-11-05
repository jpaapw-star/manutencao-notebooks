// Manda as anotações de notas/*.md para o app (doPost). Uso: node scripts/enviar-notas.js <url-do-app> <chave>
const fs = require('fs');
const path = require('path');
const [url, chave] = process.argv.slice(2);
if (!url || !chave) { console.error('uso: enviar-notas.js <url> <chave>'); process.exit(1); }
const pasta = path.join(__dirname, '..', 'notas');
const notas = fs.existsSync(pasta)
  ? fs.readdirSync(pasta).filter((f) => f.toLowerCase().endsWith('.md') && f.toLowerCase() !== 'leia-me.md').map((f) => fs.readFileSync(path.join(pasta, f), 'utf8'))
  : [];
if (!notas.length) { console.log('Nenhuma anotação.'); process.exit(0); }
(async () => {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ chave, notas }), redirect: 'follow' });
  const t = await r.text();
  let j;
  try { j = JSON.parse(t); } catch (e) { console.error('Resposta inesperada do app:', t.slice(0, 300)); process.exit(1); }
  if (!j.ok) { console.error('O app recusou:', j.erro); process.exit(1); }
  for (const x of j.resultado) console.log(x.ok ? `ok ${x.serial}${x.criado ? ' (novo)' : ''}${x.novas ? ' +' + x.novas : ''}` : `erro: ${x.erro}`);
  if (j.resultado.some((x) => !x.ok)) process.exit(1);
})();
