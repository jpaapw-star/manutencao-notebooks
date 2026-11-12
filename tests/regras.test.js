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
    { MODELO: 'E1504F', SERIAL: 'A1', DEFEITO: 'WEBCAM (PROVÁVEL)', 'SITUAÇÃO': 'EM ANÁLISE' },
    { MODELO: 'e1504-f', SERIAL: 'B2', DEFEITO: 'TELA (SUSPEITA) | TROCADO: USB', 'SITUAÇÃO': 'EM ANÁLISE' },
    { MODELO: 'X515J', SERIAL: 'C3', DEFEITO: 'TELA', 'SITUAÇÃO': 'EM ANÁLISE' },
    { MODELO: 'E1504F', SERIAL: 'D4', DEFEITO: 'PLACA-MÃE (CONFIRMADA)', 'SITUAÇÃO': 'SUCATA' }
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
    { MODELO: 'E1504F', SERIAL: 'ALVO', DEFEITO: 'TELA (CONFIRMADA), WEBCAM (PROVÁVEL), TECLADO (SUSPEITA)', 'SITUAÇÃO': 'EM ANÁLISE', _linha: 2 },
    { MODELO: 'E1504F', SERIAL: 'D1', DEFEITO: 'WEBCAM, TECLADO, PLACA-MÃE', 'SITUAÇÃO': 'SUCATA', _linha: 3 },
    { MODELO: 'E1504F', SERIAL: 'D2', DEFEITO: 'TELA, PLACA-MÃE', 'SITUAÇÃO': 'SUCATA', _linha: 4 },
    { MODELO: 'X515', SERIAL: 'OUTRO', DEFEITO: 'TELA', 'SITUAÇÃO': 'EM ANÁLISE', _linha: 5 },
    { MODELO: 'X515', SERIAL: 'FIM', DEFEITO: '', 'SITUAÇÃO': 'FINALIZADO', _linha: 6 }
  ];
  const p = planosDeMontagem(itens);
  assert.strictEqual(p.length, 1);
  assert.strictEqual(p[0].serial, 'ALVO');
  const de = {};
  p[0].recebe.forEach(r => { de[r.peca] = r.de; });
  // Peça só suspeita não é trocada: fica para testar, com o doador que tem uma boa.
  assert.deepStrictEqual(de, { TELA: 'D1', WEBCAM: 'D2' });
  assert.deepStrictEqual(p[0].testar, [{ peca: 'TECLADO', de: 'D2' }]);
  assert.deepStrictEqual(p[0].falta, []);
  const l = linhasCompativeis(p, itens);
  assert.strictEqual(l.length, 3);
  assert.match(l[0].valores[7], /Antes, testar: TECLADO \(com a do D2\)/);
  assert.deepStrictEqual(l.map(x => x.valores[1]), ['MONTAR', 'DOADOR (SUCATA)', 'DOADOR (SUCATA)']);
  assert.ok(l.every(x => x.grupo === 0));
  // Dois que se ajudam também viram grupo; quem já doou não é montado.
  const par = planosDeMontagem([
    { MODELO: 'A', SERIAL: 'P1', DEFEITO: 'TELA', 'SITUAÇÃO': 'EM ANÁLISE', _linha: 2 },
    { MODELO: 'A', SERIAL: 'P2', DEFEITO: 'WEBCAM', 'SITUAÇÃO': 'EM ANÁLISE', _linha: 3 }
  ]);
  assert.strictEqual(par.length, 1);
});

test('cada aparelho na sua aba: sucata, garantia ou APARELHOS', () => {
  const { abaDoItem } = m.exports;
  assert.strictEqual(abaDoItem({ 'SITUAÇÃO': 'SUCATA', GARANTIA: 'GARANTIA' }), 'SUCATA');
  assert.strictEqual(abaDoItem({ 'SITUAÇÃO': 'ENVIADO PARA GARANTIA', GARANTIA: '' }), 'GARANTIA');
  assert.strictEqual(abaDoItem({ 'SITUAÇÃO': 'EM REPARO', GARANTIA: 'SEM GARANTIA' }), 'APARELHOS');
});

test('previsão: "regravei..., não resolveu" descarta; coluna sem defeito não vira peça', () => {
  assert.strictEqual(preverPecas('TELA PRETA', ['Chip da BIOS com defeito', 'Regravei o chip da BIOS, não resolveu']).texto, 'TELA (SUSPEITA) | DESCARTADO: CHIP DA BIOS');
  assert.deepStrictEqual(pecasDaColuna('TROCADO: CHIP DA BIOS | DESCARTADO: TELA'), []);
  const { coresDosGrupos } = m.exports;
  const c = coresDosGrupos([{ serial: 'A', recebe: [{ de: 'B' }, { de: 'C' }] }, { serial: 'D', recebe: [{ de: 'E' }] }]);
  assert.strictEqual(c.A, c.B); assert.strictEqual(c.A, c.C); assert.notStrictEqual(c.A, c.D); assert.strictEqual(c.D, c.E);
});

test('peças compradas: tipo, modelos compatíveis e aparelhos que precisam', () => {
  const { tipoDaPeca, modelosCombinam, estoqueDe, aparelhosParaPecas } = m.exports;
  assert.strictEqual(tipoDaPeca('Tela 15.6 LED slim 30 pinos'), 'TELA');
  assert.strictEqual(tipoDaPeca('Teclado ABNT2'), 'TECLADO');
  assert.ok(modelosCombinam('VIVOBOOK GO 15 E1504FA', 'E1504F, X1504ZA'));
  assert.ok(!modelosCombinam('VIVOBOOK GO 15 E1504FA', 'X515JA'));
  const est = estoqueDe([
    ['DATA COMPRA', 'PEÇA', 'CÓDIGO DA PEÇA', 'SERVE NOS MODELOS', 'VALOR', 'LINK', 'SITUAÇÃO', 'USADA EM (SERIAL)', 'MODELOS COMPATÍVEIS (PESQUISA)', 'APARELHOS QUE PRECISAM'],
    ['05/11/2026', 'Tela 15.6', 'NV156FHM', '', 300, '', 'EM ESTOQUE', '', 'E1504FA, X1504ZA', ''],
    ['05/11/2026', 'Teclado', 'K1', 'E1504F', 80, '', 'USADA', 'ABC', '', '']
  ]);
  assert.strictEqual(est.length, 2);
  assert.ok(est[1].usada);
  const itens = [
    { SERIAL: 'A1', MODELO: 'E1504FA', DEFEITO: 'TELA (PROVÁVEL)', 'SITUAÇÃO': 'EM REPARO' },
    { SERIAL: 'A2', MODELO: 'E1504FA', DEFEITO: 'TECLADO', 'SITUAÇÃO': 'EM REPARO' }
  ];
  assert.deepStrictEqual(aparelhosParaPecas(est, itens), ['A1 (E1504FA)', '']);
  const p = planosDeMontagem(itens, est);
  assert.strictEqual(p.length, 1);
  assert.strictEqual(p[0].serial, 'A1');
  assert.strictEqual(p[0].recebe[0].de, 'PEÇA COMPRADA NV156FHM');
  assert.ok(p[0].recebe[0].comprada);
});

test('compatibilidade: peça universal e modelos que compartilham peça', () => {
  const { pecaServe, compatDe } = m.exports;
  const compat = compatDe(['Memória', 'SSD'], [['PEÇA', 'MODELOS'], ['Tela', 'E1504FA, X1504ZA'], ['Teclado', 'X515']]);
  assert.deepStrictEqual(compat.universais, ['MEMÓRIA', 'SSD']);
  assert.strictEqual(compat.grupos.length, 1);
  assert.ok(pecaServe('SSD', 'E1504FA', 'IDEAPAD 15IRH8', compat));
  assert.ok(pecaServe('TELA', 'VIVOBOOK E1504FA', 'VIVOBOOK X1504ZA', compat));
  assert.ok(!pecaServe('TECLADO', 'E1504FA', 'X1504ZA', compat));
  const itens = [
    { MODELO: 'VIVOBOOK E1504FA', SERIAL: 'A', DEFEITO: 'TELA, SSD', 'SITUAÇÃO': 'EM REPARO', TIPO: 'NOTEBOOK', _linha: 2 },
    { MODELO: 'VIVOBOOK X1504ZA', SERIAL: 'B', DEFEITO: 'PLACA-MÃE', 'SITUAÇÃO': 'SUCATA', TIPO: 'NOTEBOOK', _linha: 3 },
    { MODELO: 'IDEAPAD 15IRH8', SERIAL: 'C', DEFEITO: 'TELA', 'SITUAÇÃO': 'SUCATA', TIPO: 'NOTEBOOK', _linha: 4 }
  ];
  const p = planosDeMontagem(itens, [], compat);
  assert.strictEqual(p.length, 1);
  const de = {}; p[0].recebe.forEach(r => { de[r.peca] = r.de; });
  assert.deepStrictEqual(de, { TELA: 'B', SSD: 'B' });
  assert.strictEqual(p[0].recebe[0].outroModelo, 'VIVOBOOK X1504ZA');
  // sem a tabela, tela de outro modelo não serve
  const parte = planosDeMontagem(itens, [], compatDe(['SSD'], []));
  assert.strictEqual(parte.length, 1);
  assert.deepStrictEqual(parte[0].recebe.map(r => r.peca), ['SSD']);
  assert.deepStrictEqual(parte[0].falta, ['TELA']);
  assert.strictEqual(linhasCompativeis(parte, itens)[0].valores[1], 'MONTAR (FALTA PEÇA)');
  assert.match(linhasCompativeis(parte, itens)[0].valores[7], /Falta comprar: TELA/);
});

test('compatibilidade: placa não se recebe, mesmo EAN, modelo parecido e grau da peça', () => {
  const { pecasComGrau, modeloParecido } = m.exports;
  assert.deepStrictEqual(pecasComGrau('TELA (CONFIRMADA), PLACA-MÃE (PROVÁVEL · CIRCUITO DE CARGA), SSD (SUSPEITA · IA), WEBCAM | DESCARTADO: FLAT'),
    [{ peca: 'TELA', grau: 'CONFIRMADA' }, { peca: 'PLACA-MÃE', grau: 'PROVÁVEL' }, { peca: 'SSD', grau: 'SUSPEITA' }, { peca: 'WEBCAM', grau: 'CONFIRMADA' }]);
  assert.ok(modeloParecido('C4128E', 'C4128A-14', 'POSITIVO', 'POSITIVO'));
  assert.ok(modeloParecido('ASPIRE A515-45', 'A515-45-R043', 'ACER', 'ACER'));
  assert.ok(!modeloParecido('C4128E', 'C4128A-14', 'POSITIVO', 'DELL'));
  assert.ok(!modeloParecido('AG15-51P-39MU', 'AG15-71P-5939', 'ACER', 'ACER'));
  assert.ok(!modeloParecido('VJFE54F11X', 'VJFE52F11X', 'VAIO', 'VAIO'));
  assert.ok(!modeloParecido('15IRH10', '15ARP10', 'LENOVO', 'LENOVO'));
  // Quem precisa de placa não é montado, mas doa a tela; modelo parecido entra marcado para conferir.
  const itens = [
    { MARCA: 'POSITIVO', MODELO: 'C4128E', SERIAL: 'A', DEFEITO: 'TELA (CONFIRMADA), PLACA-MÃE (SUSPEITA)', 'SITUAÇÃO': 'EM ANÁLISE', _linha: 2 },
    { MARCA: 'POSITIVO', MODELO: 'C4128A-14', SERIAL: 'B', DEFEITO: 'PLACA-MÃE (CONFIRMADA)', 'SITUAÇÃO': 'EM ANÁLISE', _linha: 3 },
    { MARCA: 'POSITIVO', MODELO: 'C4128A - 14', SERIAL: 'C', DEFEITO: 'ÁUDIO (CONFIRMADA)', 'SITUAÇÃO': 'EM ANÁLISE', _linha: 4 }
  ];
  const p = planosDeMontagem(itens);
  assert.deepStrictEqual(p.map(x => x.serial), ['A', 'C']);
  assert.deepStrictEqual(p[1].recebe.map(r => [r.peca, r.de, r.conferir]), [['ÁUDIO', 'B', false]]);
  assert.deepStrictEqual(p[0].recebe.map(r => [r.peca, r.de, r.conferir]), [['TELA', 'B', true]]);
  assert.deepStrictEqual(p[0].testar, [{ peca: 'PLACA-MÃE', de: '' }]);
  assert.match(linhasCompativeis(p, itens)[1].valores[7], /modelo parecido: conferir o encaixe/);
  // Mesmo EAN vale como mesmo modelo, mesmo com o modelo escrito diferente.
  const ean = planosDeMontagem([
    { MODELO: 'VISION C15M', EAN: '7908068807629', SERIAL: 'X', DEFEITO: 'TELA', 'SITUAÇÃO': 'EM ANÁLISE', _linha: 2 },
    { MODELO: 'C4128B-15', EAN: '7908068807629', SERIAL: 'Y', DEFEITO: 'PLACA-MÃE', 'SITUAÇÃO': 'SUCATA', _linha: 3 }
  ]);
  assert.strictEqual(ean.length, 1);
  assert.strictEqual(ean[0].recebe[0].conferir, false);
});

test('código da peça: tira o part number da resposta da IA', () => {
  const { codigoPeca } = m.exports;
  assert.strictEqual(codigoPeca('NV156FHM-N48'), 'NV156FHM-N48');
  assert.strictEqual(codigoPeca('O código provável é L15M3PB0.'), 'L15M3PB0');
  assert.strictEqual(codigoPeca('0B200-03940000'), '0B200-03940000');
  assert.strictEqual(codigoPeca('TELA LED'), '');
  assert.strictEqual(codigoPeca(''), '');
});

test('vocabulário: palavras novas e as que o João ensina na LISTAS', () => {
  const { preverPecas, palavrasExtras } = m.exports;
  assert.match(preverPecas('Imagem com listras verticais', []).texto, /TELA/);
  assert.match(preverPecas('só liga na tomada', []).texto, /BATERIA/);
  assert.strictEqual(preverPecas('lente quebrada', []).texto, '');
  const ex = palavrasExtras(['TELA: LENTE, vidro', 'CÂMERA = lentinha (IA)', 'lixo sem dois pontos']);
  assert.deepStrictEqual(ex.TELA, ['LENTE', 'vidro']);
  assert.deepStrictEqual(ex.WEBCAM, ['lentinha']);
  assert.match(preverPecas('lente quebrada', [], ex).texto, /TELA \(CONFIRMADA\)/);
});

test('previsão da IA vale no lugar das regras quando existe', () => {
  const { previsaoFinal, previsaoDaIA, perguntaPrevisao, pecasDaColuna } = m.exports;
  const regras = { texto: 'TELA (PROVÁVEL)', pecas: ['TELA'] };
  assert.strictEqual(previsaoFinal(regras, ''), regras);
  assert.strictEqual(previsaoFinal(regras, undefined), regras);
  const f = previsaoFinal(regras, 'PLACA-MÃE (PROVÁVEL) | DESCARTADO: TELA');
  assert.deepStrictEqual(f.pecas, ['PLACA-MÃE']);
  const conf = { texto: 'TECLADO (CONFIRMADA), TOUCHPAD (CONFIRMADA), TELA (SUSPEITA) | DESCARTADO: SSD', pecas: ['TECLADO', 'TOUCHPAD', 'TELA'] };
  assert.strictEqual(previsaoFinal(conf, 'TOUCHPAD (PROVÁVEL)').texto, 'TECLADO (CONFIRMADA), TOUCHPAD (PROVÁVEL)');
  assert.strictEqual(previsaoFinal(conf, 'DESCARTADO: TOUCHPAD').texto, 'TECLADO (CONFIRMADA) | DESCARTADO: TOUCHPAD');
  const nomes = ['TELA', 'PLACA-MÃE', 'SSD', 'BATERIA', 'WI-FI'];
  const r = previsaoDaIA('1. PLACA-MÃE = SUSPEITA = analisar a placa\n- **TELA** = Confirmada = "tela trincada"\nSSD: DESCARTADO: persistiu\nBATERIA = PROVÁVEL\nWI-FI = TROCADA = troquei\nFOGUETE = CONFIRMADA = x\nTELA = SUSPEITA', nomes);
  assert.strictEqual(r.texto, 'TELA (CONFIRMADA), BATERIA (PROVÁVEL), PLACA-MÃE (SUSPEITA) | TROCADO: WI-FI | DESCARTADO: SSD');
  assert.deepStrictEqual(r.pecas, ['TELA', 'BATERIA', 'PLACA-MÃE']);
  assert.deepStrictEqual(pecasDaColuna(r.texto), ['TELA', 'BATERIA', 'PLACA-MÃE']);
  assert.deepStrictEqual(r.palavras, [{ peca: 'PLACA-MÃE', palavra: 'ANALISAR A PLACA' }, { peca: 'TELA', palavra: 'TELA TRINCADA' }]);
  assert.strictEqual(previsaoDaIA('NADA', nomes).texto, '');
  const pl = previsaoDaIA('BATERIA = PROVÁVEL = sem o carregador\nPLACA-MÃE = PROVÁVEL = sem o carregador = CIRCUITO DE CARGA\nSSD = DESCARTADA = persistiu', nomes);
  assert.strictEqual(pl.texto, 'BATERIA (PROVÁVEL), PLACA-MÃE (PROVÁVEL · CIRCUITO DE CARGA) | DESCARTADO: SSD');
  assert.deepStrictEqual(pecasDaColuna(pl.texto), ['BATERIA', 'PLACA-MÃE']);
  // Peça citada só como parte do teste não entra, mesmo que a IA diga; descartada pode.
  const t3 = ['Com outro carregador a luz acende, mas sem imagem na tela e no HDMI', 'Sem memória, bateria e SSD: luz fixa e sem imagem'];
  assert.strictEqual(previsaoDaIA('BATERIA = PROVÁVEL = sem bateria\nPLACA-MÃE = PROVÁVEL = sem imagem\nSSD = DESCARTADA = sem SSD', nomes, t3).texto, 'PLACA-MÃE (PROVÁVEL) | DESCARTADO: SSD');
  assert.strictEqual(previsaoDaIA('BATERIA = CONFIRMADA = continua com defeito', nomes, ['Não mexi na bateria, ela continua com defeito']).texto, 'BATERIA (CONFIRMADA)');
  const p = perguntaPrevisao({ TIPO: 'NOTEBOOK', MARCA: 'ACER', MODELO: 'A515-45' }, ['Defeito: NÃO LIGA', '', 'Sem imagem'], nomes, ['Trocado o SSD']);
  assert.match(p, /Aparelho: NOTEBOOK ACER A515-45/);
  assert.match(p, /1\. Defeito: NÃO LIGA\n2\. Sem imagem/);
  assert.match(p, /já consertou[^\n]*\n- Trocado o SSD/);
});

test('próximo teste, lição do conserto e experiência do modelo', () => {
  const { previsaoDaIA, testeSugerido, doadorDeTeste, pecasCitadas, licaoDoConserto, consertosDoModelo, perguntaPrevisao } = m.exports;
  const nomes = ['TELA', 'PLACA-MÃE', 'SSD', 'BATERIA', 'FLAT'];
  const r = previsaoDaIA('BATERIA = PROVÁVEL = só liga no carregador\nPLACA-MÃE = PROVÁVEL = só liga no carregador = CIRCUITO DE CARGA\n**TESTE** = testar com a bateria boa de outro NP750XGJ.', nomes);
  assert.strictEqual(r.texto, 'BATERIA (PROVÁVEL), PLACA-MÃE (PROVÁVEL · CIRCUITO DE CARGA)');
  assert.strictEqual(r.teste, 'Testar com a bateria boa de outro NP750XGJ.');
  assert.strictEqual(previsaoDaIA('TELA = CONFIRMADA = trincada\nTESTE = NADA', nomes).teste, '');
  assert.strictEqual(previsaoDaIA('TELA = CONFIRMADA = trincada\nTESTE = Substituir a tela por uma boa.', nomes).teste, '');
  // A IA leu e não viu peça com defeito ("-"): das regras só fica o que foi confirmado, trocado ou descartado.
  const { previsaoFinal } = m.exports;
  assert.strictEqual(previsaoFinal({ texto: 'SSD (PROVÁVEL)', pecas: ['SSD'] }, '-').texto, '');
  assert.strictEqual(previsaoFinal({ texto: 'TELA (CONFIRMADA), SSD (PROVÁVEL) | DESCARTADO: FLAT', pecas: ['TELA', 'SSD'] }, '-').texto, 'TELA (CONFIRMADA) | DESCARTADO: FLAT');
  assert.strictEqual(previsaoFinal({ texto: 'TROCADO: ÁUDIO', pecas: [] }, '-').texto, 'TROCADO: ÁUDIO');
  assert.strictEqual(previsaoDaIA('TESTE = medir a entrada', nomes).teste, '');
  // Sem IA: teste padrão da primeira peça que ainda não está confirmada.
  assert.match(testeSugerido('TELA (CONFIRMADA), BATERIA (PROVÁVEL)'), /bateria boa/);
  assert.strictEqual(testeSugerido('TELA (CONFIRMADA)'), '');
  assert.strictEqual(testeSugerido('DESCARTADO: SSD'), '');
  const itens = [
    { MODELO: 'NP750XGJ-KG3BR', SERIAL: 'A', DEFEITO: 'BATERIA (PROVÁVEL)', 'SITUAÇÃO': 'EM ANÁLISE' },
    { MODELO: 'NP750XGJ-KG3BR', SERIAL: 'B', DEFEITO: 'BATERIA (CONFIRMADA)', 'SITUAÇÃO': 'EM ANÁLISE' },
    { MODELO: 'NP750XGJ - KG3BR', SERIAL: 'C', DEFEITO: 'TELA (CONFIRMADA)', 'SITUAÇÃO': 'EM ANÁLISE' },
    { MODELO: 'X515', SERIAL: 'D', DEFEITO: '', 'SITUAÇÃO': 'EM ANÁLISE' }
  ];
  assert.strictEqual(doadorDeTeste(itens[0], itens, itens[0].DEFEITO), 'BATERIA boa para o teste: C');
  assert.strictEqual(doadorDeTeste(itens[1], itens, itens[1].DEFEITO), '');
  assert.strictEqual(doadorDeTeste(itens[3], itens, 'TELA (SUSPEITA)'), '');
  assert.deepStrictEqual(pecasCitadas('Troca de SSD e placa de rede'), ['WI-FI', 'SSD']);
  const errou = licaoDoConserto({ modelo: 'A515-45', sintomas: ['Possível defeito no SSD.'], previsto: 'SSD (PROVÁVEL)', feito: 'TROCA DE TELA' });
  assert.ok(errou.errou);
  assert.strictEqual(errou.texto, 'A515-45 | viram: Possível defeito no SSD. | o app previa: SSD (ERROU) | resolveu: TROCA DE TELA');
  assert.ok(!licaoDoConserto({ sintomas: ['linhas na tela'], previsto: 'TELA (PROVÁVEL)', feito: 'Troquei a tela' }).errou);
  assert.ok(!licaoDoConserto({ sintomas: [], previsto: 'SSD (PROVÁVEL)', feito: 'REPARO NA INTERFACE DE INICIALIZAÇÃO' }).errou);
  const prod = [['DELL', 'DC15-I51334U-A50', 'TROCA DE BATERIA'], ['DELL', 'DC15-I51334U-A50', 'REPARO NA INTEFACE DE AUDIO'], ['DELL', 'dc15-i51334u-a50', 'Troca de bateria '],
    ['ACER', 'A51545R043', 'TROCA DE AUTOFALANTES'], ['POSITIVO', 'DUO C4128E', 'REPARO NA INTERFACE DE VÍDEO'], ['SONY', 'DUALSENSE', '']];
  assert.strictEqual(consertosDoModelo(prod, { MODELO: 'DC15-I51334U-A50' }), 'TROCA DE BATERIA ×2, REPARO NA INTERFACE DE ÁUDIO');
  assert.strictEqual(consertosDoModelo(prod, { MODELO: 'A515-45-R043' }), 'TROCA DE AUTOFALANTES');
  assert.strictEqual(consertosDoModelo(prod, { MODELO: 'C4128E' }), 'REPARO NA INTERFACE DE VÍDEO');
  assert.strictEqual(consertosDoModelo(prod, { MODELO: 'X515' }), '');
  const p = perguntaPrevisao({ MODELO: 'DC15' }, ['não liga'], nomes, [errou.texto], 'TROCA DE BATERIA ×2');
  assert.match(p, /já fez neste mesmo modelo: TROCA DE BATERIA ×2\./);
  assert.match(p, /\(ERROU\)/);
  assert.match(p, /TESTE = /);
});

test('medidas: polegadas, pinos, DDR e tipo de SSD', () => {
  const { medidas, textoMedidas, medidasBatem } = m.exports;
  assert.deepStrictEqual(medidas('Tela 15.6 LED slim 30 pinos'), { POLEGADAS: '15.6', PINOS: '30' });
  assert.deepStrictEqual(medidas('Tela 14" 40P fosca'), { POLEGADAS: '14', PINOS: '40' });
  assert.deepStrictEqual(medidas('Tela 15,6 polegadas'), { POLEGADAS: '15.6' });
  assert.deepStrictEqual(medidas('Memória 8GB DDR4 2666'), { DDR: 'DDR4' });
  assert.deepStrictEqual(medidas('SSD 256 M.2 NVMe'), { SSD: 'NVME' });
  assert.deepStrictEqual(medidas('SSD 480 SATA'), { SSD: 'SATA 2.5' });
  assert.deepStrictEqual(medidas('Vivobook E1504FA'), {});
  assert.strictEqual(textoMedidas({ POLEGADAS: '15.6', PINOS: '30' }), '15.6" · 30 pinos');
  assert.ok(!medidasBatem('TELA', { POLEGADAS: '14' }, { POLEGADAS: '15.6' }));
  assert.ok(medidasBatem('TELA', {}, { POLEGADAS: '15.6' }));
  assert.ok(medidasBatem('TECLADO', { POLEGADAS: '14' }, { POLEGADAS: '15.6' }));
});

test('peça comprada com medida diferente não é sugerida', () => {
  const { estoqueDe, aparelhosParaPecas } = m.exports;
  const cab = ['DATA COMPRA', 'PEÇA', 'CÓDIGO DA PEÇA', 'SERVE NOS MODELOS', 'VALOR', 'LINK', 'SITUAÇÃO', 'USADA EM (SERIAL)', 'MODELOS COMPATÍVEIS (PESQUISA)', 'APARELHOS QUE PRECISAM', 'MEDIDA / CONECTOR'];
  const est = estoqueDe([cab, ['', 'Tela LED', 'X1', 'E1504FA', '', '', 'EM ESTOQUE', '', '', '', '15.6" · 30 pinos']]);
  const itens = [
    { SERIAL: 'A1', MODELO: 'E1504FA', 'SITUAÇÃO': 'EM REPARO', DEFEITO: 'TELA (CONFIRMADA)', 'DESCRIÇÃO': 'tela 15.6' },
    { SERIAL: 'B2', MODELO: 'E1504FA', 'SITUAÇÃO': 'EM REPARO', DEFEITO: 'TELA (CONFIRMADA)', 'O QUE FOI FEITO / NOTAS': 'conector 40 pinos' }
  ];
  assert.deepStrictEqual(aparelhosParaPecas(est, itens, null), ['A1 (E1504FA)']);
});

test('conferência da pesquisa dos modelos', () => {
  const { precisaPesquisar, conferirPesquisa, respostaModelos } = m.exports;
  const hoje = new Date(2026, 10, 5);
  assert.ok(precisaPesquisar('', '', 'X1', hoje));
  assert.ok(!precisaPesquisar('E1504FA', 'Pesquisado com o código X1 em 01/11/2026.', 'X1', hoje));
  assert.ok(precisaPesquisar('E1504FA', 'Pesquisado com o código X1 em 01/11/2026.', 'X2', hoje));
  assert.ok(!precisaPesquisar('NÃO ACHEI', 'Pesquisado com o código X1 em 01/11/2026.', 'X1', hoje));
  assert.ok(precisaPesquisar('NÃO ACHEI', 'Pesquisado com o código X1 em 10/10/2026.', 'X1', hoje));
  assert.strictEqual(conferirPesquisa('', 'E1504FA').valor, 'NÃO ACHEI');
  assert.strictEqual(conferirPesquisa('X1504ZA', 'E1504FA').valor, 'CONFERIR: X1504ZA');
  assert.strictEqual(conferirPesquisa('E1504FA, X1504ZA', 'E1504F').valor, 'E1504FA, X1504ZA');
  assert.deepStrictEqual(respostaModelos('MODELOS: E1504FA, X1504ZA\nMEDIDA: 15,6 polegadas, 30 pinos'), { modelos: 'E1504FA, X1504ZA', medida: '15.6" · 30 pinos' });
  assert.deepStrictEqual(respostaModelos('E1504FA, X1504ZA'), { modelos: 'E1504FA, X1504ZA', medida: '' });
});

test('planilha de manutenções: aba do mês e descrição no jeito dela', () => {
  const { abaDoMes, ultimaAbaDeMes, descricaoReparo, linhaManutencao } = m.exports;
  assert.strictEqual(abaDoMes(new Date(2026, 11, 1)), 'DEZEMBRO 2026');
  assert.strictEqual(abaDoMes(new Date(2026, 2, 1)), 'MARÇO 2026');
  assert.strictEqual(ultimaAbaDeMes(['NOVEMBRO 2026', 'OUTUBRO 2026', 'PRODUÇÃO 2026', 'DEZEMBRO', 'MARÇO 2026', 'outubro']), 'NOVEMBRO 2026');
  assert.strictEqual(descricaoReparo('TROCADO: WEBCAM', [], ''), 'TROCA DE WEBCAM');
  assert.strictEqual(descricaoReparo('TELA (PROVÁVEL), WI-FI (SUSPEITA), ÁUDIO (CONFIRMADA)', [], ''), 'REPARO NA INTERFACE DE VÍDEO, REDE E ÁUDIO');
  assert.strictEqual(descricaoReparo('ÁUDIO (CONFIRMADA) | TROCADO: SSD, WI-FI', [], ''), 'TROCA DE SSD E PLACA DE REDE E REPARO NA INTERFACE DE ÁUDIO');
  assert.strictEqual(descricaoReparo('CHIP DA BIOS (SUSPEITA)', ['formatei o windows'], ''), 'REPARO NA INTERFACE DE INICIALIZAÇÃO E FORMATAÇÃO DO SISTEMA');
  assert.strictEqual(descricaoReparo('DESCARTADO: TELA', ['Reconectei a subplaca dos botões'], ''), 'RECONECTEI A SUBPLACA DOS BOTÕES');
  const cab = ['TÉCNICO', 'MARCA', 'MODELO', 'SERIAL', 'DATA', 'DESCRIÇAO', 'ESTADO ', 'ENTREGUE', 'TIPO'];
  const d = new Date(2026, 10, 5);
  assert.deepStrictEqual(linhaManutencao(cab, { 'TÉCNICO': 'João Pedro', MARCA: 'Asus', MODELO: 'E1504FA', SERIAL: 'w6n0b' }, 'TROCA DE TELA', d),
    ['JOÃO PEDRO', 'ASUS', 'E1504FA', 'W6N0B', d, 'TROCA DE TELA', '', '', '']);
  assert.strictEqual(linhaManutencao(['TECNICO', 'MARCA', 'MODELO', 'SÉRIE', 'DATA', 'DEFEITO'], { SERIAL: 'X1' }, 'Y', d)[3], 'X1');
});

test('resumo do que foi feito no jeito da planilha de produção', () => {
  const { resumoProducao } = m.exports;
  assert.strictEqual(resumoProducao('NOTEBOOK APRESENTAVA AÚDIO FORA DO PADRÃO, FORAM FEITAS ATUALIZAÇÕES DE DRIVERS DA FABRICANTE E REINICIALIZAÇÃO DO SISTEMA, REALIZAÇÕES DE TESTES FORAM FEITAS E O PRODUTO VOLTOU PARA A QUALIDADE ORIGINAL'), 'REPARO NA INTERFACE DE ÁUDIO');
  assert.strictEqual(resumoProducao('troquei a tela, testei o audio e o wifi ok'), 'TROCA DE TELA');
  assert.strictEqual(resumoProducao('TROCA DE TELA E ARO'), 'TROCA DE TELA E ARO');
  assert.strictEqual(resumoProducao('wifi não conectava, troquei a placa de rede e formatei'), 'TROCA DE PLACA DE REDE E FORMATAÇÃO DO SISTEMA');
  assert.strictEqual(resumoProducao('ssd corrompido, troquei por um novo e instalei o windows'), 'TROCA DE SSD E FORMATAÇÃO DO SISTEMA');
  assert.strictEqual(resumoProducao('não carregava, refiz a solda do conector de carga'), 'REPARO NO CIRCUITO DE CARGA');
  assert.strictEqual(resumoProducao('fiz uma oração'), '');
});

test('serial da IA: P/N da Dell não vira serial', () => {
  const { serialDaIA } = m.exports;
  assert.strictEqual(serialDaIA('4D25F', 'DELL'), '');
  assert.strictEqual(serialDaIA('61rqjh4', 'ALIENWARE'), '61RQJH4');
  assert.strictEqual(serialDaIA('NXKMDAL0014159468C9501', 'ACER'), 'NXKMDAL0014159468C9501');
});

test('EAN da IA: número de pedido não vira EAN', () => {
  const { eanDaIA } = m.exports;
  assert.strictEqual(eanDaIA('401868317'), '');
  assert.strictEqual(eanDaIA('7899864955259'), '7899864955259');
});

test('descrição pelo modelo: resposta limpa, NADA vira vazio', () => {
  const { descricaoDaResposta } = m.exports;
  assert.strictEqual(descricaoDaResposta('**Alienware 16 Aurora, Intel Core 7 240H, 16GB, SSD 1TB, RTX 5060, 16"**.'), 'ALIENWARE 16 AURORA, INTEL CORE 7 240H, 16GB, SSD 1TB, RTX 5060, 16"');
  assert.strictEqual(descricaoDaResposta('NADA'), '');
});

test('previsão: "não liga mesmo ao carregador" não acusa o carregador', () => {
  assert.strictEqual(preverPecas('NÃO LIGA MESMO AO CARREGADOR', []).texto, 'PLACA-MÃE (SUSPEITA)');
  assert.strictEqual(preverPecas('não ligava mesmo conectado ao carregador', []).texto, 'PLACA-MÃE (SUSPEITA)');
  assert.strictEqual(preverPecas('CARREGADOR NÃO FUNCIONA', []).texto, 'CARREGADOR (CONFIRMADA)');
});

test('reparado antigo: só sai da planilha de defeitos se o serial estiver numa aba de mês', () => {
  const { seriaisDosMeses_ } = m.exports;
  const aba = (nome, linhas) => ({
    getName: () => nome, getLastRow: () => linhas.length, getLastColumn: () => linhas[0].length,
    getRange: (r, c, n, k) => ({ getValues: () => linhas.slice(r - 1, r - 1 + n).map(l => l.slice(c - 1, c - 1 + (k || 1))) })
  });
  const ss = { getSheets: () => [
    aba('OUTUBRO 2026', [['TÉCNICO', 'SERIAL'], ['ANA', 'pe0fxeyd']]),
    aba('RESUMO', [['SERIAL'], ['NAOCONTA1']])
  ] };
  const ja = seriaisDosMeses_(ss);
  assert.deepStrictEqual(Object.keys(ja), ['PE0FXEYD']);
});

test('nomes de quem adiciona: lista primeiro, sem repetir', () => {
  const { juntarNomes } = m.exports;
  assert.deepStrictEqual(juntarNomes(['JOÃO PEDRO'], ['ana leal', 'JOAO PEDRO', '', 'GABRIEL  ANTÔNIO', 'Ana Leal', '—']),
    ['JOÃO PEDRO', 'ANA LEAL', 'GABRIEL ANTÔNIO']);
});

test('nome novo na LISTAS vai depois da última célula preenchida (vazia no meio não sobrescreve)', () => {
  const { ultimaPreenchida } = m.exports;
  // TÉCNICO: ANA, (vazio), BRUNO, (vazio) → índice 3; o nome novo vai na linha 3 + 2 = 5
  assert.strictEqual(ultimaPreenchida([['TÉCNICO'], ['ANA'], [''], ['BRUNO'], ['']]), 3);
  assert.strictEqual(ultimaPreenchida([['TÉCNICO']]), 0);
});

test('previsão: peça citada só no teste não vira defeito (casos reais de novembro/2026)', () => {
  const p = (...obs) => preverPecas('', obs).texto;
  assert.strictEqual(p('Defeito: NÃO LIGA, LUZ LATERAL PISCA 5 VEZES E LUZ DE CARGA APAGADA', 'Com outro carregador a luz de ligado acende, mas sem imagem na tela e no HDMI',
    'Sem memória, bateria e SSD: luz fixa e sem imagem na tela e no HDMI'), 'PLACA-MÃE (PROVÁVEL)');
  assert.strictEqual(p('O NOTEBOOK NÃO LIGAVA MESMO CONECTADO AO CARREGADOR, ENTÃO RETIREI O SSD (MEMÓRIA RAM É SOLDADA NA PLACA), MESMO ASSIM NÃO HOUVE RETORNO'), 'PLACA-MÃE (SUSPEITA)');
  assert.strictEqual(p('Notebook não permanece ligado sem o carregador conectado', 'Não mexi na bateria, ela continua com defeito'), 'BATERIA (PROVÁVEL), PLACA-MÃE (SUSPEITA)');
  assert.strictEqual(p('os defeitos de touch pad e teclado fn não estão funcionando'), 'TECLADO (CONFIRMADA), TOUCHPAD (CONFIRMADA)');
  assert.strictEqual(p('Notebook apresenta defeito na placa de rede', 'Troquei a tela do notebook por uma com pixel morto para fazer manutenção.'), 'WI-FI (CONFIRMADA), TELA (CONFIRMADA)');
  assert.strictEqual(p('a tela está trincada e o botão power foi retirado para outro computador'), 'TELA (CONFIRMADA), BOTÃO POWER (CONFIRMADA)');
});

test('escrita da planilha de produção e aparelho sem serial', () => {
  const { corrigirEscrita, resumoProducao, modeloLimpo, serialInterno, serialParaProducao, completarDeIguais, linhaManutencao } = m.exports;
  assert.strictEqual(resumoProducao('TROCA DE SDD E REPARO NA INTEFACE DE INICIALIZAÇÂO'), 'TROCA DE SSD E REPARO NA INTERFACE DE INICIALIZAÇÃO');
  assert.strictEqual(corrigirEscrita('REPARO NO BOTAO DE MIC '), 'REPARO NO BOTÃO DE MIC');
  assert.strictEqual(corrigirEscrita('REPARO NA INTERFACE DE ÁUDIO'), 'REPARO NA INTERFACE DE ÁUDIO');
  assert.strictEqual(modeloLimpo(' c4128a - 14 '), 'C4128A-14');
  assert.strictEqual(serialParaProducao(serialInterno('1111-064512')), 'N\\A');
  assert.strictEqual(serialParaProducao('4ak30sd05'), '4AK30SD05');
  assert.deepStrictEqual(linhaManutencao(['Y7', 'MARCA', 'SERIAL'], { 'TÉCNICO': 'Ana Leal', MARCA: 'acer', SERIAL: 'x1' }, '', null), ['ANA LEAL', 'ACER', 'X1']);
  assert.strictEqual(m.exports.colunaTecnico(['MARCA', 'MODELO']), -1);
  assert.strictEqual(linhaManutencao(['TÉCNICO', 'SERIAL'], { 'TÉCNICO': 'João Pedro', SERIAL: 'S/N 1111-064512' }, '', null)[1], 'N\\A');
  assert.deepStrictEqual(completarDeIguais([
    { EAN: 7908068807629, MODELO: 'C4128A-14', 'DESCRIÇÃO': '', MARCA: 'POSITIVO', TIPO: 'NOTEBOOK' },
    { EAN: '7908068807629', MODELO: 'C4128A - 14', 'DESCRIÇÃO': 'PROC INTEL CELERON', MARCA: 'POSITIVO', TIPO: 'NOTEBOOK' },
    { EAN: '', MODELO: 'A515-45', 'DESCRIÇÃO': '', MARCA: 'ACER', TIPO: 'NOTEBOOK' }
  ], { 'A515-45': 'ACER ASPIRE 5 A515-45, 15,6"' }), [{ i: 0, campo: 'DESCRIÇÃO', valor: 'PROC INTEL CELERON' }, { i: 2, campo: 'DESCRIÇÃO', valor: 'ACER ASPIRE 5 A515-45, 15,6"' }]);
});
