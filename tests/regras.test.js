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
    { SERIAL: 'A1', MODELO: 'E1504FA', 'PEÇAS': 'TELA (PROVÁVEL)', 'SITUAÇÃO': 'EM REPARO' },
    { SERIAL: 'A2', MODELO: 'E1504FA', 'PEÇAS': 'TECLADO', 'SITUAÇÃO': 'EM REPARO' }
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
    { MODELO: 'VIVOBOOK E1504FA', SERIAL: 'A', 'PEÇAS': 'TELA, SSD', 'SITUAÇÃO': 'EM REPARO', TIPO: 'NOTEBOOK', _linha: 2 },
    { MODELO: 'VIVOBOOK X1504ZA', SERIAL: 'B', 'PEÇAS': 'PLACA-MÃE', 'SITUAÇÃO': 'SUCATA', TIPO: 'NOTEBOOK', _linha: 3 },
    { MODELO: 'IDEAPAD 15IRH8', SERIAL: 'C', 'PEÇAS': 'TELA', 'SITUAÇÃO': 'SUCATA', TIPO: 'NOTEBOOK', _linha: 4 }
  ];
  const p = planosDeMontagem(itens, [], compat);
  assert.strictEqual(p.length, 1);
  const de = {}; p[0].recebe.forEach(r => { de[r.peca] = r.de; });
  assert.deepStrictEqual(de, { TELA: 'B', SSD: 'B' });
  assert.strictEqual(p[0].recebe[0].outroModelo, 'VIVOBOOK X1504ZA');
  // sem a tabela, tela de outro modelo não serve
  assert.strictEqual(planosDeMontagem(itens, [], compatDe(['SSD'], [])).length, 0);
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

test('previsão da IA só entra quando as regras não acham nada', () => {
  const { previsaoFinal, respostaPrevisao } = m.exports;
  assert.deepStrictEqual(previsaoFinal({ texto: 'TELA (PROVÁVEL)', pecas: ['TELA'] }, ['TECLADO']).pecas, ['TELA']);
  const f = previsaoFinal({ texto: 'DESCARTADO: TELA', pecas: [] }, ['TELA', 'FLAT']);
  assert.strictEqual(f.texto, 'FLAT (SUSPEITA · IA) | DESCARTADO: TELA');
  const r = respostaPrevisao('TELA = listras na imagem\n- PLACA-MÃE: "não dá sinal"\nFOGUETE = x', ['TELA', 'PLACA-MÃE']);
  assert.deepStrictEqual(r.pecas, ['TELA', 'PLACA-MÃE']);
  assert.deepStrictEqual(r.palavras.map(x => x.palavra), ['LISTRAS NA IMAGEM', 'NÃO DÁ SINAL']);
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
    { SERIAL: 'A1', MODELO: 'E1504FA', 'SITUAÇÃO': 'EM REPARO', 'PEÇAS': 'TELA (CONFIRMADA)', DEFEITO: 'tela 15.6 quebrada' },
    { SERIAL: 'B2', MODELO: 'E1504FA', 'SITUAÇÃO': 'EM REPARO', 'PEÇAS': 'TELA (CONFIRMADA)', DEFEITO: 'tela quebrada, conector 40 pinos' }
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
