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

const { pecasDoDefeito, combinacoes, lerNota, juntarNotas } = m.exports;

test('peças a partir da descrição do teste', () => {
  assert.deepStrictEqual(pecasDoDefeito('TELA NÃO DA IMAGEM, MICROFONE E WEBCAM NÃO FUNCIONAM'), ['TELA', 'WEBCAM', 'MICROFONE']);
  assert.deepStrictEqual(pecasDoDefeito('ENTRADA P2 NÃO FUNCIONA'), ['ENTRADA P2']);
  assert.deepStrictEqual(pecasDoDefeito('webcam ruim'), ['WEBCAM']);
  assert.deepStrictEqual(pecasDoDefeito('TELA QUEBRADA E NÃO LIGA'), ['TELA', 'PLACA-MÃE']);
  assert.deepStrictEqual(pecasDoDefeito('MUITAS TECLAS NÃO FUNCIONAM'), ['TECLADO']);
});

test('notebooks do mesmo modelo que se completam', () => {
  const c = combinacoes([
    { MODELO: 'E1504F', SERIAL: 'A1', 'PEÇAS COM DEFEITO': 'WEBCAM', 'SITUAÇÃO': 'EM ANÁLISE' },
    { MODELO: 'e1504-f', SERIAL: 'B2', 'PEÇAS COM DEFEITO': 'TELA', 'SITUAÇÃO': 'EM ANÁLISE' },
    { MODELO: 'X515J', SERIAL: 'C3', 'PEÇAS COM DEFEITO': 'TELA', 'SITUAÇÃO': 'EM ANÁLISE' },
    { MODELO: 'E1504F', SERIAL: 'D4', 'PEÇAS COM DEFEITO': 'PLACA-MÃE', 'SITUAÇÃO': 'SUCATA' }
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
  const j1 = juntarNotas('', n.entradas);
  assert.strictEqual(j1.novas, 2);
  const j2 = juntarNotas(j1.texto, n.entradas);
  assert.strictEqual(j2.novas, 0);
  assert.strictEqual(j2.texto, j1.texto);
});
