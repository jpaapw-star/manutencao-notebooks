const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Carrega src/Codigo.gs como módulo (o arquivo exporta as funções puras quando há "module").
const codigo = fs.readFileSync(path.join(__dirname, '..', 'src', 'Codigo.gs'), 'utf8');
const m = { exports: {} };
new Function('module', codigo)(m);
const { normalizarSerial, seriaisFinalizados, paraFinalizar } = m.exports;

test('serial: maiúsculo, sem espaço/traço, letra O igual a zero', () => {
  assert.strictEqual(normalizarSerial(' peofxeyd '), normalizarSerial('PE0FXEYD'));
  assert.strictEqual(normalizarSerial('W3NOB-6020 469114'), 'W3N0B6020469114');
  assert.strictEqual(normalizarSerial(null), '');
});

const qc = [
  ['TESTADO POR', 'COLABORADOR', 'SERIAL', 'APROVADO?'],
  ['N/A', 'ANA', 'PEOFXEYD', 'Sim'],
  ['N/A', 'ANA', 'TAN0B6041231436', 'Não'],
  ['N/A', 'ANA', '', 'Sim'],
  ['N/A', 'ANA', 'x1', 'Sim']
];

test('só aprovados contam quando pedido', () => {
  const f = seriaisFinalizados(qc, true);
  assert.deepStrictEqual(Object.keys(f), ['PE0FXEYD']);
  const todos = seriaisFinalizados(qc, false);
  assert.deepStrictEqual(Object.keys(todos).sort(), ['PE0FXEYD', 'TAN0B6041231436']);
});

test('sem coluna SERIAL dá erro claro', () => {
  assert.throws(() => seriaisFinalizados([['A', 'B'], ['1', '2']], true), /SERIAL/);
});

test('finaliza só o que está em aberto e bate o serial', () => {
  const itens = [
    { SERIAL: 'PE0FXEYD', 'SITUAÇÃO': 'EM REPARO' },
    { SERIAL: 'pe0f-xeyd', 'SITUAÇÃO': 'FINALIZADO' },
    { SERIAL: 'PE0FXEYD', 'SITUAÇÃO': 'SUCATA' },
    { SERIAL: 'OUTRO123', 'SITUAÇÃO': 'EM ANÁLISE' },
    { SERIAL: '', 'SITUAÇÃO': 'EM ANÁLISE' }
  ];
  assert.deepStrictEqual(paraFinalizar(itens, seriaisFinalizados(qc, true)), [0]);
});

test('a tela tem script válido', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8');
  const js = html.match(/<script>([\s\S]*)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(js));
});

const { preverPecas, pecasDaColuna, combinacoes, lerNota, resumoObs, celulaNotas, notaCompleta, notasAntigas } = m.exports;

test('previsão: peças a partir da descrição do teste', () => {
  assert.deepStrictEqual(preverPecas('TELA NÃO DA IMAGEM, MICROFONE E WEBCAM NÃO FUNCIONAM', []).pecas.sort(), ['MICROFONE', 'TELA', 'WEBCAM']);
  assert.strictEqual(preverPecas('ENTRADA P2 NÃO FUNCIONA', []).texto, 'ENTRADA P2 (CONFIRMADA)');
  assert.strictEqual(preverPecas('webcam ruim', []).texto, 'WEBCAM (CONFIRMADA)');
  assert.strictEqual(preverPecas('TELA PRETA', []).texto, 'TELA (SUSPEITA)');
  assert.strictEqual(preverPecas('NAO LIGA', []).texto, 'PLACA-MÃE (SUSPEITA)');
  assert.deepStrictEqual(preverPecas('MUITAS TECLAS NÃO FUNCIONAM', []).pecas, ['TECLADO']);
});

test('previsão: observações confirmam, trocam ou desmentem', () => {
  const obs = 'Liga, mostra o logo e fica com tela preta, F2 não abre a BIOS. Chip da BIOS retirado e com fios soldados para leitura no T48; leitura ainda falhando por mau contato em 5 pinos. Sem o chip a placa não liga nem acende a luz de carga (esperado, o EC fica no mesmo chip).';
  assert.strictEqual(preverPecas('TELA PRETA', [obs]).texto, 'CHIP DA BIOS (PROVÁVEL) | DESCARTADO: TELA');
  assert.strictEqual(preverPecas('TELA PRETA', [obs, 'Peças com defeito: CHIP DA BIOS W25R256JW (SUSPEITA)']).texto, 'CHIP DA BIOS (SUSPEITA) | DESCARTADO: TELA');
  assert.strictEqual(preverPecas('TELA NÃO DA IMAGEM, MICROFONE E WEBCAM NÃO FUNCIONAM',
    ['Troquei a webcam, ok', 'Testei o microfone e está bom', 'tela confirmada com defeito']).texto,
    'TELA (CONFIRMADA) | TROCADO: WEBCAM | DESCARTADO: MICROFONE');
  assert.strictEqual(preverPecas('TECLADO COM DEFEITO', ['troquei o teclado e não resolveu']).texto, 'DESCARTADO: TECLADO');
  assert.strictEqual(preverPecas('webcam ruim', ['webcam ok', 'webcam com defeito de novo']).texto, 'WEBCAM (CONFIRMADA)');
  assert.deepStrictEqual(pecasDaColuna('CHIP DA BIOS (SUSPEITA), TELA (PROVÁVEL) | TROCADO: WEBCAM'), ['CHIP DA BIOS', 'TELA']);
});

test('observações: célula curta, nota completa, texto antigo aproveitado', () => {
  const longo = 'Liga, mostra o logo e fica com tela preta, F2 não abre a BIOS. Chip retirado.';
  assert.strictEqual(resumoObs(longo), 'Liga, mostra o logo e fica com tela preta, F2 não abre a BIOS…');
  assert.strictEqual(resumoObs('troquei a tela'), 'troquei a tela');
  const obs = [{ data: '04/11/2026', tecnico: 'JOÃO PEDRO', texto: longo }, { data: '05/11/2026', tecnico: 'MARCOS', texto: 'Regravei a BIOS, não resolveu.' }];
  assert.strictEqual(celulaNotas(obs), '05/11 · MARCOS · Regravei a BIOS, não resolveu\n04/11 · JOÃO PEDRO · Liga, mostra o logo e fica com tela preta, F2 não abre a BIOS…');
  assert.match(notaCompleta(obs), /^04\/11\/2026 · JOÃO PEDRO\nLiga.*Chip retirado\.\n\n05\/11\/2026 · MARCOS\n/s);
  assert.deepStrictEqual(notasAntigas('04/11/2026 (ANA): testei\n05/11/2026: troquei', '', 'JOÃO'),
    [{ data: '04/11/2026', tecnico: 'ANA', texto: 'testei' }, { data: '05/11/2026', tecnico: 'JOÃO', texto: 'troquei' }]);
  assert.deepStrictEqual(notasAntigas('texto solto', '05/11/2026', 'JOÃO'), [{ data: '05/11/2026', tecnico: 'JOÃO', texto: 'texto solto' }]);
});

test('notebooks do mesmo modelo que se completam', () => {
  const c = combinacoes([
    { MODELO: 'E1504F', SERIAL: 'A1', 'PEÇAS': 'WEBCAM (PROVÁVEL)', 'SITUAÇÃO': 'EM ANÁLISE' },
    { MODELO: 'e1504-f', SERIAL: 'B2', 'PEÇAS': 'TELA (SUSPEITA) | TROCADO: USB', 'SITUAÇÃO': 'EM ANÁLISE' },
    { MODELO: 'X515J', SERIAL: 'C3', 'PEÇAS': 'TELA', 'SITUAÇÃO': 'EM ANÁLISE' },
    { MODELO: 'E1504F', SERIAL: 'D4', 'PEÇAS': 'PLACA-MÃE (CONFIRMADA)', 'SITUAÇÃO': 'SUCATA' }
  ]);
  assert.match(c[0], /B2 \(par: dá TELA, recebe WEBCAM\)/);
  assert.match(c[0], /D4 \(sucata: recebe WEBCAM\)/);
  assert.match(c[1], /A1 \(par: dá WEBCAM, recebe TELA\)/);
  assert.strictEqual(c[2], '');
  assert.strictEqual(c[3], '');
});

test('nota do outro projeto', () => {
  const n = lerNota('serial: pe0fxeyd\nmodelo: IDEAPAD\npecas_com_defeito: tela, webcam\nsituacao: EM REPARO\n\n## 2026-11-05\n- troquei a tela\n- dúvida: bios trava? → atualizar bios\n');
  assert.strictEqual(n.serial, 'pe0fxeyd');
  assert.strictEqual(n.pecas, 'tela, webcam');
  assert.strictEqual(n.entradas.length, 2);
  assert.strictEqual(n.entradas[0].data, '05/11/2026');
});

test('leitura da etiqueta: EAN com dígito, serial e marca pelo serial', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8');
  const js = html.match(/<script>([\s\S]*)<\/script>/)[1];
  const pedaco = js.slice(js.indexOf('function ehEan'), js.indexOf('function fotoParaCanvas'));
  const f = new Function(pedaco + '; return { ehEan, pareceSerial, marcaPeloSerial };')();
  assert.ok(f.ehEan('7898573299654'));
  assert.ok(!f.ehEan('7898573299655'));
  assert.ok(f.pareceSerial('TAN0B606399744G'));
  assert.strictEqual(f.marcaPeloSerial('NXJH1AL003537005389Z00'), 'ACER');
  assert.strictEqual(f.marcaPeloSerial('W2NOB605722209C'), 'ASUS');
  assert.strictEqual(f.marcaPeloSerial('PE0FLHWQ'), 'LENOVO');
  assert.strictEqual(f.marcaPeloSerial('2SG7CJ4'), 'DELL');
});

const { ehGarantia, planosDeMontagem, linhasCompativeis } = m.exports;

test('garantia: coluna GARANTIA ou situação de garantia', () => {
  assert.ok(ehGarantia({ GARANTIA: 'GARANTIA', 'SITUAÇÃO': 'EM ANÁLISE' }));
  assert.ok(ehGarantia({ GARANTIA: 'CONFERIR GARANTIA', 'SITUAÇÃO': 'ENVIADO PARA GARANTIA' }));
  assert.ok(ehGarantia({ GARANTIA: '', 'SITUAÇÃO': 'AGUARDANDO NF' }));
  assert.ok(!ehGarantia({ GARANTIA: 'SEM GARANTIA', 'SITUAÇÃO': 'EM REPARO' }));
  assert.ok(!ehGarantia({ GARANTIA: 'CONFERIR GARANTIA', 'SITUAÇÃO': 'EM ANÁLISE' }));
});

test('montagem: vários doadores fazem um notebook, cada peça usada uma vez', () => {
  const itens = [
    { MODELO: 'E1504F', SERIAL: 'ALVO', 'PEÇAS': 'TELA (CONFIRMADA), WEBCAM (PROVÁVEL), TECLADO (SUSPEITA)', 'SITUAÇÃO': 'EM ANÁLISE', _linha: 2 },
    { MODELO: 'E1504F', SERIAL: 'D1', 'PEÇAS': 'WEBCAM, TECLADO, PLACA-MÃE', 'SITUAÇÃO': 'SUCATA', _linha: 3 },
    { MODELO: 'E1504F', SERIAL: 'D2', 'PEÇAS': 'TELA, PLACA-MÃE', 'SITUAÇÃO': 'SUCATA', _linha: 4 },
    { MODELO: 'X515', SERIAL: 'OUTRO', 'PEÇAS': 'TELA', 'SITUAÇÃO': 'EM ANÁLISE', _linha: 5 },
    { MODELO: 'X515', SERIAL: 'FIM', 'PEÇAS': '', 'SITUAÇÃO': 'FINALIZADO', _linha: 6 }
  ];
  const p = planosDeMontagem(itens);
  assert.strictEqual(p.length, 1);
  assert.strictEqual(p[0].serial, 'ALVO');
  const de = {};
  p[0].recebe.forEach(r => { de[r.peca] = r.de; });
  assert.deepStrictEqual(de, { TELA: 'D1', WEBCAM: 'D2', TECLADO: 'D2' });
  const l = linhasCompativeis(p, itens);
  assert.strictEqual(l.length, 3);
  assert.deepStrictEqual(l.map(x => x.valores[1]), ['MONTAR', 'DOADOR (SUCATA)', 'DOADOR (SUCATA)']);
  assert.ok(l.every(x => x.grupo === 0));
  // Dois que se ajudam também viram grupo; quem já doou não é montado.
  const par = planosDeMontagem([
    { MODELO: 'A', SERIAL: 'P1', 'PEÇAS': 'TELA', 'SITUAÇÃO': 'EM ANÁLISE', _linha: 2 },
    { MODELO: 'A', SERIAL: 'P2', 'PEÇAS': 'WEBCAM', 'SITUAÇÃO': 'EM ANÁLISE', _linha: 3 }
  ]);
  assert.strictEqual(par.length, 1);
});
