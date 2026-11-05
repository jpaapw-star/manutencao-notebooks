/**
 * Manutenção de notebooks: app da Web que lê e grava a planilha de manutenção.
 * O app roda com a conta do dono da planilha: os técnicos usam só o app e
 * podem apenas ver a planilha.
 */

// ===== PLANILHAS (todos os IDs ficam aqui) =====
var PLANILHAS = {
  // Planilha de manutenção (só o dono edita).
  MANUTENCAO: '1IgXP2qDv2vfByOGC5O3MKykYHVf8oe_hWVt70zm16sc',
  // Controle de qualidade: notebooks finalizados. Só é LIDA, nunca alterada.
  QUALIDADE: '1JHONHaipHAKmtkcQ_7mm8VXA-h-LBQuu-I8uzPhjgDQ'
};
var QUALIDADE_ABA = 'TabelaQualidade';
// true: só conta como finalizado quando "APROVADO?" = Sim. false: basta o serial aparecer.
var FINALIZA_SO_APROVADO = true;
// Conferência automática com o controle de qualidade, a cada N horas.
var SINCRONIZAR_HORAS = 2;

var ABA = 'APARELHOS';
var ABA_NOMES_ANTIGOS = ['EQUIPAMENTOS'];
var FINALIZADO = 'FINALIZADO';
var ENCERRADAS = ['FINALIZADO', 'SUCATA'];
var COLUNAS = ['DATA ENTRADA', 'TIPO', 'MARCA', 'MODELO', 'DESCRIÇÃO', 'EAN', 'SERIAL', 'NF', 'GARANTIA', 'DEFEITO',
  'TÉCNICO', 'SITUAÇÃO', 'LOCAL', 'PEÇAS', 'VALOR PEÇAS', 'LINK PEÇA', 'PROTOCOLO', 'DATA ENVIO', 'DATA RETORNO',
  'O QUE FOI FEITO / NOTAS', 'ÚLTIMA ATUALIZAÇÃO', 'PEÇAS COM DEFEITO', 'COMBINA COM'];
// Colunas que o app preenche sozinho (acrescentadas no fim se faltarem).
var COLUNAS_AUTO = ['PEÇAS COM DEFEITO', 'COMBINA COM'];
var DATAS = ['DATA ENTRADA', 'DATA ENVIO', 'DATA RETORNO', 'ÚLTIMA ATUALIZAÇÃO'];
var VISTAS = { GARANTIA: ['ENVIADO PARA GARANTIA', 'AGUARDANDO NF'], 'PEÇAS': ['AGUARDANDO PEÇA', 'PEÇA PEDIDA'],
  SUCATA: ['SUCATA'], FINALIZADOS: ['FINALIZADO'] };
var HISTORICO = 'HISTÓRICO';

// ===== Funções puras (testadas em Node) =====

/** Serial comparável: maiúsculo, só letras e números, letra O vira zero. */
function normalizarSerial(s) {
  return String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0');
}

function sim_(v) {
  return /^(S|SIM|YES|Y|OK|APROVADO|TRUE)$/i.test(String(v == null ? '' : v).trim());
}

/** Seriais finalizados a partir das linhas do controle de qualidade (com cabeçalho). */
function seriaisFinalizados(linhas, soAprovado) {
  var out = {};
  if (!linhas || !linhas.length) return out;
  var cab = linhas[0].map(function (h) { return String(h).trim().toUpperCase(); });
  var cs = cab.indexOf('SERIAL');
  var ca = -1;
  for (var i = 0; i < cab.length; i++) if (cab[i].indexOf('APROVADO') === 0) { ca = i; break; }
  if (cs < 0) throw new Error('Coluna SERIAL não encontrada no controle de qualidade.');
  for (var r = 1; r < linhas.length; r++) {
    var n = normalizarSerial(linhas[r][cs]);
    if (n.length < 5) continue;
    if (soAprovado && ca >= 0 && !sim_(linhas[r][ca])) continue;
    out[n] = true;
  }
  return out;
}

/** Linhas (índice 0 = primeira linha de dados) que devem virar FINALIZADO. */
function paraFinalizar(itens, finalizados) {
  var out = [];
  itens.forEach(function (it, i) {
    var sit = String(it['SITUAÇÃO'] || '').trim().toUpperCase();
    if (ENCERRADAS.indexOf(sit) >= 0) return;
    var n = normalizarSerial(it.SERIAL);
    if (n && finalizados[n]) out.push(i);
  });
  return out;
}


// ===== Peças com defeito e notebooks que se completam =====

// Peça → palavras que aparecem na descrição do teste (sem acento, maiúsculo).
var PECAS = [
  ['TELA', ['TELA', 'DISPLAY', 'LCD', 'PIXEL', 'LINHA NA', 'MANCHA', 'BACKLIGHT', 'SEM IMAGEM', 'SEM VIDEO', 'NAO DA VIDEO', 'NAO DA IMAGEM', 'IMAGEM']],
  ['WEBCAM', ['WEBCAM', 'CAMERA']],
  ['TECLADO', ['TECLADO', 'TECLA']],
  ['TOUCHPAD', ['TOUCHPAD', 'TOUCH PAD', 'MOUSEPAD']],
  ['BATERIA', ['BATERIA']],
  ['CARREGADOR', ['CARREGADOR', 'FONTE', 'NAO CARREGA', 'CONECTOR DE CARGA', 'DC JACK']],
  ['ÁUDIO', ['AUDIO', 'SOM', 'ALTO FALANTE', 'AUTO FALANTE', 'AUTO-FALANTE', 'ALTO-FALANTE', 'CHIANDO']],
  ['MICROFONE', ['MICROFONE', ' MIC ']],
  ['ENTRADA P2', [' P2 ', ' FONE ', 'FONE DE OUVIDO', 'FONES']],
  ['WI-FI', ['WIFI', 'WI-FI', 'WI FI', 'INTERNET', 'PLACA DE REDE', 'REDE']],
  ['USB', ['USB']],
  ['SSD', ['SSD', 'HD ', 'ARMAZENAMENTO']],
  ['MEMÓRIA', ['MEMORIA', 'RAM']],
  ['CARCAÇA', ['CARCACA', 'TAMPA', 'DOBRADICA', 'QUEBRAD']],
  ['PLACA-MÃE', ['PLACA MAE', 'PLACA-MAE', 'NAO LIGA', 'CURTO', 'CORROID']]
];

function semAcento_(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

/** Peças com defeito a partir da descrição do teste. "TELA QUEBRADA" conta como tela, não carcaça. */
function pecasDoDefeito(texto) {
  var t = ' ' + semAcento_(texto).replace(/[^A-Z0-9-]+/g, ' ') + ' ';
  var out = [];
  PECAS.forEach(function (p) {
    var achou = p[1].some(function (w) { return t.indexOf(w) >= 0; });
    if (!achou) return;
    if (p[0] === 'CARCAÇA' && /TELA QUEBRAD/.test(t) && !/CARCACA|TAMPA|DOBRADICA/.test(t)) return;
    if (p[0] === 'TELA' && t.indexOf('IMAGEM') >= 0 && /WEBCAM|CAMERA/.test(t) && !/TELA|DISPLAY|LCD|PIXEL|VIDEO/.test(t)) return;
    out.push(p[0]);
  });
  return out;
}

function lista_(v) {
  return String(v == null ? '' : v).split(/[,;\/]+/).map(function (x) { return x.trim().toUpperCase(); }).filter(String);
}

function modeloChave_(m) { return String(m == null ? '' : m).toUpperCase().replace(/[^A-Z0-9]/g, ''); }

/**
 * Para cada aparelho em aberto: outros do MESMO modelo que se completam.
 * Combina quando um tem boa a peça que falta no outro. "Par perfeito" quando os dois se ajudam.
 * Retorna um texto por índice, ex.: "PE0FXEYD (par: dá TELA, recebe WEBCAM)".
 */
function combinacoes(itens) {
  var out = itens.map(function () { return ''; });
  var abertos = [];
  itens.forEach(function (it, i) {
    var sit = String(it['SITUAÇÃO'] || '').trim().toUpperCase();
    if (sit === 'FINALIZADO') return;
    var m = modeloChave_(it.MODELO);
    var pecas = lista_(it['PEÇAS COM DEFEITO']);
    if (!m || !pecas.length) return;
    abertos.push({ i: i, m: m, pecas: pecas, serial: String(it.SERIAL || '').trim() || ('linha ' + (it._linha || i + 2)), sucata: sit === 'SUCATA' });
  });
  abertos.forEach(function (a) {
    var achados = [];
    abertos.forEach(function (b) {
      if (a === b || a.m !== b.m || a.sucata) return;
      var recebe = a.pecas.filter(function (p) { return b.pecas.indexOf(p) < 0; });
      var da = b.pecas.filter(function (p) { return a.pecas.indexOf(p) < 0; });
      if (!recebe.length) return;
      if (b.sucata) { achados.push({ n: 1, t: b.serial + ' (sucata: recebe ' + recebe.join(', ') + ')' }); return; }
      if (da.length) achados.push({ n: 0, t: b.serial + ' (par: dá ' + da.join(', ') + ', recebe ' + recebe.join(', ') + ')' });
    });
    achados.sort(function (x, y) { return x.n - y.n; });
    out[a.i] = achados.map(function (x) { return x.t; }).join('\n');
  });
  return out;
}

// ===== Planilha =====

function planilha_() { return SpreadsheetApp.openById(PLANILHAS.MANUTENCAO); }

function cabecalho_(aba) {
  var n = Math.max(aba.getLastColumn(), 1);
  return aba.getRange(1, 1, 1, n).getValues()[0].map(function (h) { return String(h).trim(); });
}

function abaPrincipal_(ss) {
  var aba = ss.getSheetByName(ABA);
  if (aba) return aba;
  for (var i = 0; i < ABA_NOMES_ANTIGOS.length; i++) {
    var velha = ss.getSheetByName(ABA_NOMES_ANTIGOS[i]);
    if (velha) { velha.setName(ABA); return velha; }
  }
  aba = ss.insertSheet(ABA, 1);
  aba.getRange(1, 1, 1, COLUNAS.length).setValues([COLUNAS]);
  aba.setFrozenRows(1);
  return aba;
}

function letra_(n) { var s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

/** Deixa a planilha no formato combinado. Roda a cada abertura (rápido quando já está pronta). */
function prepararPlanilha_() {
  var cache = CacheService.getScriptCache();
  if (cache.get('pronta') === '2') return;
  var ss = planilha_();
  var aba = abaPrincipal_(ss);
  var meus = ss.getSheetByName('MEUS');
  if (meus) ss.deleteSheet(meus);
  var cab = cabecalho_(aba);
  COLUNAS_AUTO.forEach(function (c) {
    if (cab.indexOf(c) < 0) { aba.getRange(1, cab.length + 1).setValue(c); cab.push(c); }
  });
  var ult = letra_(cab.length);
  var cSit = letra_(cab.indexOf('SITUAÇÃO') + 1);
  // Lista de situações com FINALIZADO.
  var listas = ss.getSheetByName('LISTAS');
  if (listas) {
    var lc = cabecalho_(listas);
    var col = lc.indexOf('SITUAÇÃO') + 1;
    if (col > 0) {
      var vals = listas.getRange(2, col, Math.max(listas.getLastRow() - 1, 1), 1).getValues().map(function (l) { return String(l[0]).trim(); });
      if (vals.indexOf(FINALIZADO) < 0) {
        var vazia = vals.indexOf('');
        listas.getRange((vazia < 0 ? vals.length : vazia) + 2, col).setValue(FINALIZADO);
      }
    }
  }
  // Abas que se montam sozinhas.
  Object.keys(VISTAS).forEach(function (nome) {
    var v = ss.getSheetByName(nome);
    if (!v) v = ss.insertSheet(nome);
    v.getRange(1, 1, 1, cab.length).setValues([cab]);
    v.setFrozenRows(1);
    var cond = VISTAS[nome].map(function (s) { return '(' + ABA + '!' + cSit + '2:' + cSit + '="' + s + '")'; }).join('+');
    v.getRange(2, 1).setFormula('=IFERROR(FILTER(' + ABA + '!A2:' + ult + ',' + cond + '),"")');
  });
  // Resumo com FINALIZADO.
  var res = ss.getSheetByName('RESUMO');
  if (res) {
    var a = res.getRange(1, 1, Math.max(res.getLastRow(), 1), 1).getValues().map(function (l) { return String(l[0]).trim(); });
    if (a.indexOf(FINALIZADO) < 0) {
      var t = a.indexOf('TOTAL');
      if (t > 0) {
        res.insertRowBefore(t + 1);
        res.getRange(t + 1, 1, 1, 2).setValues([[FINALIZADO, '=COUNTIF(' + ABA + '!' + cSit + '2:' + cSit + ',A' + (t + 1) + ')']]);
        res.getRange(t + 2, 2).setFormula('=SUM(B2:B' + (t + 1) + ')');
      }
    }
  }
  if (!ss.getSheetByName(HISTORICO)) {
    var h = ss.insertSheet(HISTORICO);
    h.getRange(1, 1, 1, 6).setValues([['DATA', 'TÉCNICO', 'SERIAL', 'O QUE MUDOU', 'ANTES', 'DEPOIS']]);
    h.setFrozenRows(1);
  }
  garantirGatilho_();
  cache.put('pronta', '2', 21600);
}

function garantirGatilho_() {
  var tem = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'sincronizarQualidade'; });
  if (!tem) ScriptApp.newTrigger('sincronizarQualidade').timeBased().everyHours(SINCRONIZAR_HORAS).create();
}

function lerItens_(aba) {
  var cab = cabecalho_(aba);
  var n = aba.getLastRow() - 1;
  if (n < 1) return { cab: cab, itens: [] };
  var vals = aba.getRange(2, 1, n, cab.length).getValues();
  var itens = vals.map(function (l, i) {
    var o = { _linha: i + 2 };
    cab.forEach(function (h, j) {
      var v = l[j];
      o[h] = v instanceof Date ? Utilities.formatDate(v, 'America/Sao_Paulo', 'dd/MM/yyyy') : v;
    });
    return o;
  }).filter(function (o) { return String(o.SERIAL || o.MODELO || o['DESCRIÇÃO'] || '').trim() !== ''; });
  return { cab: cab, itens: itens };
}

function historico_(ss, tecnico, serial, oque, antes, depois) {
  var h = ss.getSheetByName(HISTORICO);
  if (h) h.appendRow([new Date(), tecnico || '', serial || '', oque, antes == null ? '' : String(antes), depois == null ? '' : String(depois)]);
}

function listas_(ss) {
  var out = {};
  var l = ss.getSheetByName('LISTAS');
  if (!l || l.getLastRow() < 2) return out;
  var v = l.getRange(1, 1, l.getLastRow(), l.getLastColumn()).getValues();
  v[0].forEach(function (h, j) {
    var k = String(h).trim();
    if (!k) return;
    out[k] = v.slice(1).map(function (x) { return String(x[j]).trim(); }).filter(String);
  });
  return out;
}

/** Recalcula PEÇAS COM DEFEITO (só quando vazia ou veio do app) e COMBINA COM de toda a aba. */
function recalcular_(aba) {
  var d = lerItens_(aba);
  if (!d.itens.length) return;
  var cP = d.cab.indexOf('PEÇAS COM DEFEITO'), cC = d.cab.indexOf('COMBINA COM');
  if (cP < 0 || cC < 0) return;
  d.itens.forEach(function (it) {
    if (!String(it['PEÇAS COM DEFEITO'] || '').trim()) {
      var p = pecasDoDefeito(it.DEFEITO);
      if (p.length) { it['PEÇAS COM DEFEITO'] = p.join(', '); aba.getRange(it._linha, cP + 1).setValue(it['PEÇAS COM DEFEITO']); }
    }
  });
  var comb = combinacoes(d.itens);
  d.itens.forEach(function (it, i) {
    if (String(it['COMBINA COM'] || '') !== comb[i]) aba.getRange(it._linha, cC + 1).setValue(comb[i]);
  });
}

// ===== App da Web =====

function doGet() {
  prepararPlanilha_();
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('Manutenção')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Tudo que a tela precisa: listas e aparelhos em aberto (e os encerrados nos últimos 30 dias). */
function apiInicio() {
  var ss = planilha_();
  var d = lerItens_(abaPrincipal_(ss));
  var limite = new Date(Date.now() - 30 * 86400000);
  var itens = d.itens.filter(function (it) {
    var sit = String(it['SITUAÇÃO'] || '').toUpperCase();
    if (ENCERRADAS.indexOf(sit) < 0) return true;
    var p = String(it['ÚLTIMA ATUALIZAÇÃO'] || '').split('/');
    return p.length === 3 && new Date(+p[2], +p[1] - 1, +p[0]) >= limite;
  });
  return { listas: listas_(ss), itens: itens, colunas: d.cab, planilha: ss.getUrl() };
}

/** Busca um aparelho pelo serial (em toda a planilha). */
function apiBuscar(serial) {
  var n = normalizarSerial(serial);
  if (!n) return null;
  var d = lerItens_(abaPrincipal_(planilha_()));
  var achados = d.itens.filter(function (it) { return normalizarSerial(it.SERIAL) === n; });
  return achados.length ? achados[achados.length - 1] : null;
}

/** Cria (sem _linha) ou atualiza (com _linha) um aparelho. Grava só os campos que mudaram. */
function apiSalvar(item, tecnico) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ss = planilha_();
    var aba = abaPrincipal_(ss);
    var cab = cabecalho_(aba);
    var agora = new Date();
    var paraCelula = function (h, v) {
      if (DATAS.indexOf(h) >= 0 && typeof v === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(v)) {
        var p = v.split('/'); return new Date(+p[2], +p[1] - 1, +p[0]);
      }
      if (h === 'VALOR PEÇAS' && typeof v === 'string' && v.trim()) {
        var num = Number(v.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
        return isNaN(num) ? v : num;
      }
      return typeof v === 'string' ? v.trim() : v;
    };
    if (!item._linha) {
      var serial = String(item.SERIAL || '').trim();
      if (serial) {
        var ja = apiBuscar(serial);
        if (ja && ENCERRADAS.indexOf(String(ja['SITUAÇÃO']).toUpperCase()) < 0) {
          return { ok: false, existe: ja, erro: 'Esse serial já está em aberto na planilha.' };
        }
      }
      if (!item['DATA ENTRADA']) item['DATA ENTRADA'] = Utilities.formatDate(agora, 'America/Sao_Paulo', 'dd/MM/yyyy');
      if (!item['SITUAÇÃO']) item['SITUAÇÃO'] = 'EM ANÁLISE';
      if (!item['TÉCNICO']) item['TÉCNICO'] = tecnico || '';
      var linha = cab.map(function (h) { return h === 'ÚLTIMA ATUALIZAÇÃO' ? agora : paraCelula(h, item[h] == null ? '' : item[h]); });
      var r = aba.getLastRow() + 1;
      aba.getRange(r, 1, 1, cab.length).setValues([linha]);
      historico_(ss, tecnico, serial, 'CADASTRO', '', item['SITUAÇÃO']);
      recalcular_(aba);
      return { ok: true, linha: r };
    }
    var r2 = Number(item._linha);
    var atual = aba.getRange(r2, 1, 1, cab.length).getValues()[0];
    var cSerial = cab.indexOf('SERIAL');
    if (item._serial != null && normalizarSerial(atual[cSerial]) !== normalizarSerial(item._serial)) {
      return { ok: false, erro: 'A planilha mudou. Abra o aparelho de novo.' };
    }
    var mudou = false, mudouCol = {};
    cab.forEach(function (h, j) {
      if (h === 'ÚLTIMA ATUALIZAÇÃO' || !(h in item)) return;
      var novo = paraCelula(h, item[h] == null ? '' : item[h]);
      var velho = atual[j];
      var vs = velho instanceof Date ? Utilities.formatDate(velho, 'America/Sao_Paulo', 'dd/MM/yyyy') : String(velho);
      var ns = novo instanceof Date ? Utilities.formatDate(novo, 'America/Sao_Paulo', 'dd/MM/yyyy') : String(novo);
      if (vs === ns) return;
      atual[j] = novo;
      mudou = true;
      mudouCol[h] = true;
      historico_(ss, tecnico, atual[cSerial], h, vs, ns);
    });
    // Defeito mudou e a pessoa não mexeu nas peças: refaz as peças a partir do defeito novo.
    var cD = cab.indexOf('DEFEITO'), cP = cab.indexOf('PEÇAS COM DEFEITO');
    if (cD >= 0 && cP >= 0 && mudouCol.DEFEITO && !mudouCol['PEÇAS COM DEFEITO']) {
      var novas = pecasDoDefeito(atual[cD]).join(', ');
      if (novas !== String(atual[cP])) { historico_(ss, tecnico, atual[cSerial], 'PEÇAS COM DEFEITO', atual[cP], novas); atual[cP] = novas; mudou = true; }
    }
    if (!mudou) return { ok: true, linha: r2, nada: true };
    var cu = cab.indexOf('ÚLTIMA ATUALIZAÇÃO');
    if (cu >= 0) atual[cu] = agora;
    aba.getRange(r2, 1, 1, cab.length).setValues([atual]);
    recalcular_(aba);
    return { ok: true, linha: r2 };
  } finally {
    lock.releaseLock();
  }
}

// ===== Anotações do outro projeto (chegam pelo GitHub) =====

/**
 * Lê um arquivo notas/<SERIAL>.md: cabeçalho "chave: valor" e blocos "## AAAA-MM-DD" com linhas "- ...".
 * Retorna { serial, modelo, defeito, pecas, situacao, entradas: [{data, texto}] }.
 */
function lerNota(texto) {
  var o = { entradas: [] };
  var data = '';
  String(texto || '').split(/\r?\n/).forEach(function (l) {
    var t = l.trim();
    if (!t) return;
    var d = t.match(/^##\s*(\d{4})-(\d{2})-(\d{2})/);
    if (d) { data = d[3] + '/' + d[2] + '/' + d[1]; return; }
    if (!data) {
      var kv = t.match(/^([a-zçãé_ ]+):\s*(.*)$/i);
      if (kv) {
        var k = semAcento_(kv[1]).replace(/\s+/g, '_');
        var mapa = { SERIAL: 'serial', MODELO: 'modelo', DEFEITO: 'defeito', PECAS_COM_DEFEITO: 'pecas', SITUACAO: 'situacao' };
        if (mapa[k]) o[mapa[k]] = kv[2].trim();
      }
      return;
    }
    var item = t.replace(/^[-*]\s*/, '');
    if (item) o.entradas.push({ data: data, texto: item });
  });
  return o;
}

/** Junta as entradas novas às notas existentes, sem repetir. */
function juntarNotas(existente, entradas) {
  var atual = String(existente || '');
  var novas = [];
  entradas.forEach(function (e) {
    var linha = e.data + ' (JOÃO PEDRO): ' + e.texto;
    if (atual.indexOf(e.texto) < 0 && novas.indexOf(linha) < 0) novas.push(linha);
  });
  return { texto: novas.length ? (atual ? atual + '\n' : '') + novas.join('\n') : atual, novas: novas.length };
}

/** Recebe as notas do GitHub (POST com a chave). Cada nota vira/atualiza a linha do notebook. */
function doPost(e) {
  var corpo = {};
  try { corpo = JSON.parse(e.postData.contents); } catch (x) { return json_({ ok: false, erro: 'JSON inválido' }); }
  var chave = (typeof SEGREDOS !== 'undefined' && SEGREDOS.notasChave) || '';
  if (!chave || corpo.chave !== chave) return json_({ ok: false, erro: 'chave' });
  prepararPlanilha_();
  var res = (corpo.notas || []).map(function (texto) {
    try { return aplicarNota_(lerNota(texto)); } catch (x) { return { ok: false, erro: String(x.message || x) }; }
  });
  return json_({ ok: true, resultado: res });
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function aplicarNota_(n) {
  if (!n.serial) return { ok: false, erro: 'nota sem serial' };
  var ja = apiBuscar(n.serial);
  var tec = 'JOÃO PEDRO';
  if (!ja) {
    var novo = { SERIAL: n.serial.toUpperCase(), MODELO: n.modelo || '', DEFEITO: n.defeito || '', 'TÉCNICO': tec,
      'SITUAÇÃO': (n.situacao || 'EM REPARO').toUpperCase(), 'PEÇAS COM DEFEITO': (n.pecas || '').toUpperCase(),
      'O QUE FOI FEITO / NOTAS': juntarNotas('', n.entradas).texto };
    var r = apiSalvar(novo, tec + ' (notas)');
    return { ok: r.ok, serial: n.serial, criado: true };
  }
  var mud = { _linha: ja._linha, _serial: ja.SERIAL };
  var j = juntarNotas(ja['O QUE FOI FEITO / NOTAS'], n.entradas);
  if (j.novas) mud['O QUE FOI FEITO / NOTAS'] = j.texto;
  if (n.situacao && ENCERRADAS.indexOf(String(ja['SITUAÇÃO']).toUpperCase()) < 0) mud['SITUAÇÃO'] = n.situacao.toUpperCase();
  if (n.pecas) mud['PEÇAS COM DEFEITO'] = n.pecas.toUpperCase();
  if (n.defeito && !String(ja.DEFEITO || '').trim()) mud.DEFEITO = n.defeito;
  if (n.modelo && !String(ja.MODELO || '').trim()) mud.MODELO = n.modelo;
  var r2 = apiSalvar(mud, tec + ' (notas)');
  return { ok: r2.ok, serial: n.serial, novas: j.novas };
}

// ===== Conferência com o controle de qualidade =====

/** Gatilho a cada SINCRONIZAR_HORAS: o que já passou no controle de qualidade vira FINALIZADO. */
function sincronizarQualidade() {
  prepararPlanilha_();
  var q = SpreadsheetApp.openById(PLANILHAS.QUALIDADE).getSheetByName(QUALIDADE_ABA);
  if (!q) throw new Error('Aba ' + QUALIDADE_ABA + ' não encontrada no controle de qualidade.');
  var fin = seriaisFinalizados(q.getDataRange().getValues(), FINALIZA_SO_APROVADO);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = planilha_();
    var aba = abaPrincipal_(ss);
    var d = lerItens_(aba);
    var idx = paraFinalizar(d.itens, fin);
    var cSit = d.cab.indexOf('SITUAÇÃO') + 1;
    var cUlt = d.cab.indexOf('ÚLTIMA ATUALIZAÇÃO') + 1;
    var cNota = d.cab.indexOf('O QUE FOI FEITO / NOTAS') + 1;
    var hoje = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy');
    idx.forEach(function (i) {
      var it = d.itens[i];
      aba.getRange(it._linha, cSit).setValue(FINALIZADO);
      if (cUlt > 0) aba.getRange(it._linha, cUlt).setValue(new Date());
      if (cNota > 0) {
        var nota = String(it['O QUE FOI FEITO / NOTAS'] || '');
        aba.getRange(it._linha, cNota).setValue((nota ? nota + '\n' : '') + hoje + ': finalizado (controle de qualidade)');
      }
      historico_(ss, 'AUTOMÁTICO', it.SERIAL, 'SITUAÇÃO', it['SITUAÇÃO'], FINALIZADO);
    });
    recalcular_(aba);
    PropertiesService.getScriptProperties().setProperty('ULTIMA_SINCRONIA', hoje + ' · ' + idx.length + ' finalizado(s)');
    return idx.length;
  } finally {
    lock.releaseLock();
  }
}

/** Botão "Conferir agora" do app. */
function apiSincronizar() {
  var n = sincronizarQualidade();
  return { finalizados: n };
}

if (typeof module !== 'undefined') {
  module.exports = { lerNota: lerNota, juntarNotas: juntarNotas, pecasDoDefeito: pecasDoDefeito, combinacoes: combinacoes, normalizarSerial: normalizarSerial, seriaisFinalizados: seriaisFinalizados, paraFinalizar: paraFinalizar };
}
