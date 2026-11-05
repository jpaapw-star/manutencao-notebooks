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
  'TÉCNICO', 'SITUAÇÃO', 'LOCAL', 'PEÇAS', 'VALOR PEÇAS', 'LINK PEÇA',
  'O QUE FOI FEITO / NOTAS', 'ÚLTIMA ATUALIZAÇÃO', 'COMBINA COM'];
// Colunas que o app preenche sozinho (acrescentadas no fim se faltarem).
var COLUNAS_AUTO = ['COMBINA COM'];
// Colunas que só o app escreve: PEÇAS (previsão), NOTAS (montada das observações) e COMBINA COM.
var NOTAS = 'O QUE FOI FEITO / NOTAS';
var COLUNAS_DO_APP = ['PEÇAS', NOTAS, 'COMBINA COM'];
var OBS = 'OBSERVAÇÕES';
var VERSAO_PLANILHA = '6';
var DATAS = ['DATA ENTRADA', 'ÚLTIMA ATUALIZAÇÃO'];
// Produtos em garantia ficam na aba GARANTIA (com as mesmas colunas), não em APARELHOS.
var ABA_GARANTIA = 'GARANTIA';
var VISTAS = { 'PEÇAS': ['AGUARDANDO PEÇA', 'PEÇA PEDIDA'],
  SUCATA: ['SUCATA'] };
// Abas que não existem mais (o app apaga se encontrar). Os finalizados continuam em APARELHOS.
var ABAS_REMOVIDAS = ['FINALIZADOS', 'RESUMO'];
var HISTORICO = 'HISTÓRICO';
var COMPATIVEIS = 'COMPATÍVEIS';
// Uma cor clara por grupo na aba COMPATÍVEIS (pedido do João: grupos em cores diferentes).
var CORES_GRUPOS = ['#dbeafe', '#dcfce7', '#fef3c7', '#fce7f3', '#ede9fe', '#ffedd5', '#ccfbf1', '#e5e7eb'];

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


/** Produto em garantia: coluna GARANTIA = "GARANTIA" ou situação de garantia (enviado, aguardando NF, voltou). */
function ehGarantia(it) {
  var g = semAcento_(it.GARANTIA).trim();
  var s = semAcento_(it['SITUAÇÃO']).trim();
  return /^(EM |COM |NA )?GARANTIA$/.test(g) || /GARANTIA|AGUARDANDO NF/.test(s);
}

// ===== Peças com defeito e notebooks que se completam =====

function semAcento_(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

// ===== Previsão das peças com defeito (sem IA) =====
// Lê o defeito do teste e depois cada observação dos técnicos, em ordem.
// Uma observação nova pode confirmar, levantar suspeita, dizer que a peça foi trocada
// ou desmentir (peça boa, "não é a tela", "troquei e não resolveu").

// Peça → [palavras que nomeiam a peça, sintomas (só levantam suspeita), sinais de que a peça está boa]
var PREVER = [
  ['TELA', ['TELA', 'DISPLAY', 'LCD', 'PIXEL', 'BACKLIGHT'], ['TELA PRETA', 'TELA ESCURA', 'TELA APAGADA', 'SEM IMAGEM', 'SEM VIDEO', 'NAO DA VIDEO', 'NAO DA IMAGEM'],
    ['MOSTRA O LOGO', 'MOSTRA A LOGO', 'APARECE O LOGO', 'APARECE A LOGO', 'DA IMAGEM', 'COM IMAGEM', 'DA VIDEO']],
  ['CHIP DA BIOS', ['CHIP DA BIOS', 'BIOS CORROMPID', 'GRAVAR A BIOS', 'REGRAVAR A BIOS', ' EC ', 'W25', '25Q'],
    ['NAO ABRE A BIOS', 'NAO ENTRA NA BIOS', 'NAO ACESSA A BIOS', 'TRAVA NO LOGO', 'FICA NO LOGO', 'NAO PASSA DO LOGO'],
    ['ABRE A BIOS', 'ENTRA NA BIOS', 'ACESSA A BIOS']],
  ['WEBCAM', ['WEBCAM', 'CAMERA'], [], []],
  ['TECLADO', ['TECLADO', 'TECLA'], [], []],
  ['TOUCHPAD', ['TOUCHPAD', 'TOUCH PAD', 'MOUSEPAD'], [], []],
  ['BATERIA', ['BATERIA'], ['NAO SEGURA CARGA', 'DESCARREGA RAPIDO'], []],
  ['CARREGADOR', ['CARREGADOR', 'FONTE', 'CONECTOR DE CARGA', 'DC JACK'], ['NAO CARREGA'], ['CARREGA NORMAL', 'ESTA CARREGANDO']],
  ['ÁUDIO', ['AUDIO', ' SOM ', 'ALTO FALANTE', 'AUTO FALANTE', 'ALTO-FALANTE', 'AUTO-FALANTE'], ['CHIANDO'], []],
  ['MICROFONE', ['MICROFONE', ' MIC '], [], []],
  ['ENTRADA P2', [' P2 ', ' FONE ', 'FONE DE OUVIDO', ' FONES '], [], []],
  ['WI-FI', ['WIFI', 'WI-FI', 'WI FI', 'PLACA DE REDE', 'WIRELESS'], ['SEM INTERNET', 'NAO CONECTA', 'NAO ACHA REDE'], []],
  ['USB', ['USB'], [], []],
  ['HDMI', ['HDMI'], [], []],
  ['SSD', ['SSD', ' HD ', 'NVME', 'ARMAZENAMENTO'], ['NAO ACHA O DISCO', 'SEM SISTEMA', 'NAO DA BOOT', 'NO BOOTABLE'], []],
  ['MEMÓRIA', ['MEMORIA', ' PENTE', ' RAM '], ['APITA', 'BIPANDO', 'BIPES'], []],
  ['COOLER', ['COOLER', 'VENTOINHA', ' FAN '], ['ESQUENTA', 'AQUECEND', 'SUPERAQUEC', 'DESLIGA SOZINHO'], []],
  ['CARCAÇA', ['CARCACA', 'TAMPA', 'DOBRADICA', 'BASE QUEBRAD'], [], []],
  ['FLAT', ['FLAT', 'CABO DE VIDEO'], [], []],
  ['PLACA-MÃE', ['PLACA MAE', 'PLACA-MAE', 'CORROID', 'OXIDAD'], ['NAO LIGA', 'EM CURTO', 'NAO ACENDE', 'PLACA MORTA'], []]
];
var P_IGNORA = /ESPERADO|SO PARA TESTE|PARA TESTAR/;
var P_NEGA = /NAO (ESTA |ESTAVA |TA )?(FUNCION\w*|LIGA\w*|CARREG\w*|RECONHEC\w*|PEGA\w*|RESPOND\w*|ACEND\w*|ABRE|ENTRA|DA \w+)/g;
var P_NAO_RESOLVEU = /NAO RESOLV|CONTINUA (O |COM )?(MESMO )?(DEFEITO|PROBLEMA)|MESMO DEFEITO/;
var P_TROCA = /TROCAD|TROQUEI|SUBSTITUID|SUBSTITUI |REPARAD|REPAREI|CONSERTAD|CONSERTEI|RESOLVID|RESOLVI |ARRUMAD|ARRUMEI|REGRAVAD|REGRAVEI|REBALLING|PECA NOVA|COLOQUEI (UM|UMA|OUTR)/;
var P_OK = / OK |FUNCION|NORMAL|SEM DEFEITO|PERFEIT|DESCARTAD|ESTA BO|ESTAO BO|TESTAD\w* BO| BOA | BOM |NAO E A |NAO E O |NAO ERA |NAO TEM DEFEITO|NAO E ESS/;
var P_SUSPEITA = /SUSPEIT|POSSIVEL|TALVEZ|PODE SER|ACHO QUE|PARECE/;
var P_PROVAVEL = /PROVAVE/;
var P_CONFIRMA = /CONFIRMAD|COM DEFEITO|DEFEITUOS|QUEIMAD|ESTOURAD|CONDENAD|QUEBRAD|TRINCAD|RUIM|DANIFICAD|DEFX|NAO TEM CONSERTO|SEM CONSERTO/;
var NIVEL = { 'SUSPEITA': 1, 'PROVÁVEL': 2, 'CONFIRMADA': 3 };

function temSemNao_(t, w) {
  var i = t.indexOf(w);
  while (i >= 0) {
    if (t.slice(Math.max(0, i - 4), i) !== 'NAO ') return true;
    i = t.indexOf(w, i + 1);
  }
  return false;
}

/** Estado que uma frase dá a cada peça que ela cita: { PEÇA: {estado, explicito} }. */
function lerFrase_(frase) {
  var t = ' ' + semAcento_(frase).replace(/[^A-Z0-9-]+/g, ' ').trim() + ' ';
  var out = {};
  if (t.trim().length < 2 || P_IGNORA.test(t)) return out;
  var s = t.replace(P_NEGA, ' DEFX ');
  PREVER.forEach(function (p) {
    var limpo = t;
    p[2].forEach(function (w) { limpo = limpo.split(w).join(' '); });
    var forte = p[1].some(function (w) { return limpo.indexOf(w) >= 0; });
    var fraco = p[2].some(function (w) { return t.indexOf(w) >= 0; });
    var bom = p[3].some(function (w) { return temSemNao_(t, w); });
    if (!forte && !fraco && !bom) return;
    var e, x = true;
    if (bom || P_NAO_RESOLVEU.test(s)) e = 'OK';
    else if (P_TROCA.test(s)) e = 'TROCADA';
    else if (P_OK.test(s)) e = 'OK';
    else if (P_SUSPEITA.test(s)) e = 'SUSPEITA';
    else if (P_PROVAVEL.test(s)) e = 'PROVÁVEL';
    else if (forte && P_CONFIRMA.test(s)) e = 'CONFIRMADA';
    else { e = forte ? 'PROVÁVEL' : 'SUSPEITA'; x = false; }
    out[p[0]] = { estado: e, explicito: x, forte: forte };
  });
  return out;
}

/**
 * Previsão das peças com defeito. defeito = descrição do teste; textos = observações em ordem (mais antiga primeiro).
 * Retorna { texto: "CHIP DA BIOS (SUSPEITA) | DESCARTADO: TELA", pecas: ['CHIP DA BIOS'] }.
 */
function preverPecas(defeito, textos) {
  var est = {}, ordem = [], suspeitou = {};
  [defeito].concat(textos || []).forEach(function (txt) {
    String(txt == null ? '' : txt).split(/[.;,\n!?]+| MAS | POREM | PORÉM | mas | porém | porem /).forEach(function (fr) {
      var r = lerFrase_(fr);
      Object.keys(r).forEach(function (pc) {
        var n = r[pc], a = est[pc];
        if (!a) { ordem.push(pc); est[pc] = n.estado; }
        else if (n.explicito) est[pc] = n.estado;
        else if (NIVEL[a]) est[pc] = NIVEL[n.estado] > NIVEL[a] ? n.estado : a;
        else if (n.forte) est[pc] = n.estado;          // estava boa/trocada e voltou a ser citada com o nome da peça
        if (NIVEL[est[pc]]) suspeitou[pc] = true;
      });
    });
  });
  var def = ordem.filter(function (pc) { return NIVEL[est[pc]]; })
    .sort(function (a, b) { return NIVEL[est[b]] - NIVEL[est[a]]; });
  var troc = ordem.filter(function (pc) { return est[pc] === 'TROCADA'; });
  var desc = ordem.filter(function (pc) { return est[pc] === 'OK' && suspeitou[pc]; });
  var partes = [def.map(function (pc) { return pc + ' (' + est[pc] + ')'; }).join(', ')];
  if (troc.length) partes.push('TROCADO: ' + troc.join(', '));
  if (desc.length) partes.push('DESCARTADO: ' + desc.join(', '));
  var texto = partes.filter(String).join(' | ');
  return { texto: texto, pecas: def };
}

/** Peças com defeito a partir do texto da coluna PEÇAS (parte antes do "|", sem o grau entre parênteses). */
function pecasDaColuna(v) {
  return String(v == null ? '' : v).split('|')[0].split(/[,;\/]+/)
    .map(function (x) { return x.replace(/\(.*?\)/g, '').trim().toUpperCase(); }).filter(String);
}

// ===== Observações (nunca apagadas) =====

/** Resumo curto de uma observação para caber na célula: primeira frase, até 70 letras. */
function resumoObs(texto, max) {
  max = max || 70;
  var t = String(texto == null ? '' : texto).replace(/\s+/g, ' ').trim();
  var f = t.split(/(?<=[.;!?])\s/)[0].replace(/[.;]$/, '');
  if (f.length > max) f = f.slice(0, max).replace(/\s+\S*$/, '');
  return f.length < t.replace(/[.;]$/, '').length ? f + '…' : f;
}

function dataCurta_(d) {
  if (d instanceof Date) return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2);
  var m = String(d || '').match(/^(\d{2})\/(\d{2})/);
  return m ? m[1] + '/' + m[2] : String(d || '');
}

function dataLonga_(d) {
  if (d instanceof Date) return dataCurta_(d) + '/' + d.getFullYear();
  return String(d || '');
}

/** Texto da célula O QUE FOI FEITO: uma linha curta por observação, a mais nova em cima. */
function celulaNotas(obs) {
  return (obs || []).slice().reverse().map(function (o) {
    return dataCurta_(o.data) + ' · ' + (o.tecnico || '—') + ' · ' + resumoObs(o.texto);
  }).join('\n');
}

/** Nota da célula (aparece ao passar o mouse): tudo, completo, em ordem. */
function notaCompleta(obs) {
  return (obs || []).map(function (o) {
    return dataLonga_(o.data) + ' · ' + (o.tecnico || '—') + '\n' + String(o.texto || '').trim();
  }).join('\n\n');
}

/** Converte o texto antigo da célula em observações: linhas "dd/mm/aaaa (TÉCNICO): texto" ou um bloco só. */
function notasAntigas(texto, dataPadrao, tecnicoPadrao) {
  var out = [];
  String(texto || '').split(/\r?\n/).forEach(function (l) {
    var t = l.trim();
    if (!t) return;
    var m = t.match(/^(\d{2}\/\d{2}\/\d{4})\s*(?:\(([^)]*)\))?\s*:\s*(.*)$/);
    if (m) out.push({ data: m[1], tecnico: (m[2] || tecnicoPadrao || '').trim(), texto: m[3] });
    else if (out.length && !/^\d{2}\/\d{2}\//.test(t)) out[out.length - 1].texto += ' ' + t;
    else out.push({ data: dataPadrao || '', tecnico: tecnicoPadrao || '', texto: t });
  });
  return out;
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
    var pecas = pecasDaColuna(it['PEÇAS']);
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

/**
 * Notebooks fáceis de resolver: para cada aparelho em aberto, outros do MESMO modelo que, juntos,
 * têm boas todas as peças que faltam nele. Pode precisar de 2, 3 ou mais doadores.
 * Cada peça boa de um doador só é usada uma vez; quem doa não entra como aparelho a montar.
 * Começa pelos que precisam de menos peças. Retorna [{ serial, modelo, recebe: [{peca, de, sucata}] }].
 */
function planosDeMontagem(itens) {
  var lista = [];
  itens.forEach(function (it, i) {
    var sit = semAcento_(it['SITUAÇÃO']).trim();
    var m = modeloChave_(it.MODELO);
    if (sit === 'FINALIZADO' || !m) return;
    lista.push({ i: i, m: m, modelo: String(it.MODELO || '').trim(), serial: String(it.SERIAL || '').trim() || ('linha ' + it._linha),
      aba: it._aba || '', linha: it._linha, pecas: pecasDaColuna(it['PEÇAS']), sucata: sit === 'SUCATA', usadas: {}, doou: false, montado: false });
  });
  var alvos = lista.filter(function (a) { return !a.sucata && a.pecas.length; })
    .sort(function (a, b) { return a.pecas.length - b.pecas.length; });
  var planos = [];
  alvos.forEach(function (a) {
    if (a.doou) return;
    var doadores = lista.filter(function (b) { return b !== a && b.m === a.m && !b.montado; });
    var falta = a.pecas.slice(), recebe = [];
    while (falta.length) {
      var melhor = null, cobre = [];
      doadores.forEach(function (b) {
        var c = falta.filter(function (p) { return b.pecas.indexOf(p) < 0 && !b.usadas[p]; });
        if (!c.length) return;
        var nota = c.length * 10 + (b.sucata ? 5 : 0) + Math.min(b.pecas.length, 4);
        if (!melhor || nota > melhor.nota) { melhor = { b: b, nota: nota }; cobre = c; }
      });
      if (!melhor) break;
      cobre.forEach(function (p) { recebe.push({ peca: p, de: melhor.b.serial, sucata: melhor.b.sucata, d: melhor.b }); melhor.b.usadas[p] = true; });
      falta = falta.filter(function (p) { return cobre.indexOf(p) < 0; });
    }
    if (falta.length) { recebe.forEach(function (r) { delete r.d.usadas[r.peca]; }); return; }
    a.montado = true;
    recebe.forEach(function (r) { r.d.doou = true; delete r.d; });
    planos.push({ serial: a.serial, modelo: a.modelo, aba: a.aba, linha: a.linha, recebe: recebe });
  });
  return planos;
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
  if (cache.get('pronta') === VERSAO_PLANILHA) return;
  var ss = planilha_();
  var aba = abaPrincipal_(ss);
  ['MEUS'].concat(ABAS_REMOVIDAS).forEach(function (nome) {
    var velha = ss.getSheetByName(nome);
    if (velha) ss.deleteSheet(velha);
  });
  var cab = cabecalho_(aba);
  // A previsão das peças agora fica na coluna PEÇAS.
  var velhaP = cab.indexOf('PEÇAS COM DEFEITO');
  if (velhaP >= 0) { aba.deleteColumn(velhaP + 1); cab = cabecalho_(aba); }
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
  // Aba GARANTIA com as mesmas colunas de APARELHOS (antes era só uma lista automática).
  var ga = abaGarantia_(ss);
  ga.getRange(1, 1, 1, cab.length).setValues([cab]);
  // Abas que se montam sozinhas.
  Object.keys(VISTAS).forEach(function (nome) {
    var v = ss.getSheetByName(nome);
    if (!v) v = ss.insertSheet(nome);
    v.clearContents();
    v.getRange(1, 1, 1, cab.length).setValues([cab]);
    v.setFrozenRows(1);
    var colSit = '{' + ABA + '!' + cSit + '2:' + cSit + ';' + ABA_GARANTIA + '!' + cSit + '2:' + cSit + '}';
    var cond = VISTAS[nome].map(function (s) { return '(' + colSit + '="' + s + '")'; }).join('+');
    v.getRange(2, 1).setFormula('=IFERROR(FILTER({' + ABA + '!A2:' + ult + ';' + ABA_GARANTIA + '!A2:' + ult + '},' + cond + '),"")');
  });
  if (!ss.getSheetByName(HISTORICO)) {
    var h = ss.insertSheet(HISTORICO);
    h.getRange(1, 1, 1, 6).setValues([['DATA', 'TÉCNICO', 'SERIAL', 'O QUE MUDOU', 'ANTES', 'DEPOIS']]);
    h.setFrozenRows(1);
  }
  // Observações: uma linha por observação, nunca apagada. Na primeira vez, traz o que já estava escrito.
  var cN = cab.indexOf(NOTAS) + 1;
  if (!ss.getSheetByName(OBS)) {
    var o = ss.insertSheet(OBS);
    o.getRange(1, 1, 1, 6).setValues([['DATA', 'TÉCNICO', 'SERIAL', 'MODELO', 'OBSERVAÇÃO', 'ORIGEM']]);
    o.setFrozenRows(1);
    o.setColumnWidth(5, 600);
    o.getRange('E:E').setWrap(true);
    migrarNotas_(ss, aba);
  }
  // Célula de notas compacta: uma linha por observação, sem quebrar o texto.
  if (cN > 0) [aba, ga].forEach(function (x) {
    x.getRange(1, cN, x.getMaxRows(), 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP).setVerticalAlignment('top');
    x.setColumnWidth(cN, 460);
  });
  garantirGatilho_();
  recalcular_(ss);
  cache.put('pronta', VERSAO_PLANILHA, 21600);
}

/** Linhas da aba COMPATÍVEIS a partir dos planos de montagem (pura). Um grupo por notebook a montar. */
function linhasCompativeis(planos, itens) {
  var porSerial = {};
  (itens || []).forEach(function (it) { porSerial[String(it.SERIAL || '').trim() || ('linha ' + it._linha)] = it; });
  var out = [];
  planos.forEach(function (p, g) {
    var a = porSerial[p.serial] || {};
    var de = {}, ordem = [];
    p.recebe.forEach(function (r) { if (!de[r.de]) { de[r.de] = []; ordem.push(r.de); } de[r.de].push(r.peca); });
    out.push({ grupo: g, valores: [g + 1, 'MONTAR', p.serial, p.modelo, a._aba || '', a['SITUAÇÃO'] || '', String(a['PEÇAS'] || ''),
      'Recebe ' + p.recebe.map(function (r) { return r.peca; }).join(', ') + ' de ' + ordem.length + (ordem.length === 1 ? ' doador' : ' doadores')] });
    ordem.forEach(function (s) {
      var b = porSerial[s] || {};
      out.push({ grupo: g, valores: [g + 1, String(b['SITUAÇÃO'] || '').toUpperCase() === 'SUCATA' ? 'DOADOR (SUCATA)' : 'DOADOR', s, b.MODELO || p.modelo,
        b._aba || '', b['SITUAÇÃO'] || '', String(b['PEÇAS'] || ''), 'Dá ' + de[s].join(', ') + ' para ' + p.serial] });
    });
  });
  return out;
}

/** Reescreve a aba COMPATÍVEIS (só quando mudou): cada grupo com uma cor. */
function escreverCompativeis_(ss, itens) {
  var linhas = linhasCompativeis(planosDeMontagem(itens), itens);
  var assinatura = JSON.stringify(linhas);
  var cache = CacheService.getScriptCache();
  var aba = ss.getSheetByName(COMPATIVEIS);
  if (aba && cache.get('compat') === Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, assinatura))) return;
  if (!aba) aba = ss.insertSheet(COMPATIVEIS, 2);
  aba.clear();
  var cab = ['GRUPO', 'PAPEL', 'SERIAL', 'MODELO', 'ABA', 'SITUAÇÃO', 'PEÇAS COM DEFEITO', 'O QUE FAZ NO GRUPO'];
  aba.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold');
  aba.setFrozenRows(1);
  if (linhas.length) {
    aba.getRange(2, 1, linhas.length, cab.length).setValues(linhas.map(function (l) { return l.valores; }));
    aba.getRange(2, 1, linhas.length, cab.length).setBackgrounds(linhas.map(function (l) {
      var c = CORES_GRUPOS[l.grupo % CORES_GRUPOS.length];
      return cab.map(function () { return c; });
    }));
    aba.getRange(2, 2, linhas.length, 1).setFontWeight('bold');
  } else {
    aba.getRange(2, 1).setValue('Nenhum notebook pode ser montado com peças de outros do mesmo modelo agora.');
  }
  cache.put('compat', Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, assinatura)), 21600);
}

/** Uma vez só: o texto antigo de NOTAS e de PEÇAS vira observação, para nada se perder. */
function migrarNotas_(ss, aba) {
  var d = lerItens_(aba);
  var linhas = [];
  d.itens.forEach(function (it) {
    var data = it['ÚLTIMA ATUALIZAÇÃO'] || it['DATA ENTRADA'] || '';
    var lista = notasAntigas(it[NOTAS], data, it['TÉCNICO']);
    var pc = String(it['PEÇAS'] || '').trim();
    if (pc) lista.push({ data: data, tecnico: it['TÉCNICO'] || '', texto: 'Peças com defeito: ' + pc });
    lista.forEach(function (o) {
      linhas.push([paraData_(o.data), o.tecnico, chaveObs_(it), it.MODELO || '', o.texto, 'PLANILHA']);
    });
  });
  if (linhas.length) ss.getSheetByName(OBS).getRange(2, 1, linhas.length, 6).setValues(linhas);
}

function paraData_(v) {
  if (v instanceof Date) return v;
  var m = String(v || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? new Date(+m[3], +m[2] - 1, +m[1]) : new Date();
}

/** Chave que liga a observação ao aparelho: o serial (ou a linha, se ainda não tem serial). */
function chaveObs_(it) {
  return String(it.SERIAL || '').trim().toUpperCase() || ('LINHA ' + it._linha);
}

/** Todas as observações, agrupadas pelo serial normalizado, em ordem. */
function lerObs_(ss) {
  var o = ss.getSheetByName(OBS);
  var mapa = {};
  if (!o || o.getLastRow() < 2) return mapa;
  o.getRange(2, 1, o.getLastRow() - 1, 6).getValues().forEach(function (l) {
    var k = normalizarSerial(l[2]);
    if (!k || !String(l[4]).trim()) return;
    (mapa[k] = mapa[k] || []).push({ data: l[0], tecnico: String(l[1] || ''), texto: String(l[4]), origem: String(l[5] || '') });
  });
  return mapa;
}

function obsDoItem_(mapa, it) { return mapa[normalizarSerial(chaveObs_(it))] || []; }

/** Acrescenta observações (sem repetir texto igual do mesmo aparelho). Retorna quantas entraram. */
function adicionarObs_(ss, it, lista, mapa) {
  var o = ss.getSheetByName(OBS);
  if (!o || !lista.length) return 0;
  var ja = obsDoItem_(mapa || lerObs_(ss), it).map(function (x) { return semAcento_(x.texto).replace(/\s+/g, ' ').trim(); });
  var linhas = [];
  lista.forEach(function (x) {
    var t = String(x.texto || '').trim();
    var n = semAcento_(t).replace(/\s+/g, ' ');
    if (!t || ja.indexOf(n) >= 0) return;
    ja.push(n);
    linhas.push([paraData_(x.data), x.tecnico || '', chaveObs_(it), it.MODELO || '', t, x.origem || 'APP']);
  });
  if (linhas.length) o.getRange(o.getLastRow() + 1, 1, linhas.length, 6).setValues(linhas);
  return linhas.length;
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
    var o = { _linha: i + 2, _aba: aba.getName() };
    cab.forEach(function (h, j) {
      var v = l[j];
      o[h] = v instanceof Date ? Utilities.formatDate(v, 'America/Sao_Paulo', 'dd/MM/yyyy') : v;
    });
    return o;
  }).filter(function (o) { return String(o.SERIAL || o.MODELO || o['DESCRIÇÃO'] || '').trim() !== ''; });
  return { cab: cab, itens: itens };
}

/** Aba GARANTIA com dados (se ainda for a lista automática antiga, limpa e põe o cabeçalho). */
function abaGarantia_(ss) {
  var g = ss.getSheetByName(ABA_GARANTIA);
  if (!g) g = ss.insertSheet(ABA_GARANTIA, 2);
  if (g.getRange(2, 1).getFormula()) {
    g.clearContents();
    var cab = cabecalho_(abaPrincipal_(ss));
    g.getRange(1, 1, 1, cab.length).setValues([cab]);
  }
  g.setFrozenRows(1);
  return g;
}

function abaDe_(ss, nome) { return nome === ABA_GARANTIA ? abaGarantia_(ss) : abaPrincipal_(ss); }

/** Aparelhos das duas abas (APARELHOS e GARANTIA), cada um com _aba e _linha. */
function lerTudo_(ss) {
  var d = lerTudo_(ss);
  var g = lerItens_(abaGarantia_(ss));
  return { cab: d.cab, itens: d.itens.concat(g.itens) };
}

/** Produto em garantia vai para a aba GARANTIA; se deixou de ser garantia, volta para APARELHOS. */
function distribuir_(ss) {
  var ap = abaPrincipal_(ss), ga = abaGarantia_(ss);
  [[ap, ga, true], [ga, ap, false]].forEach(function (x) {
    var de = x[0], para = x[1];
    var d = lerItens_(de);
    var mover = d.itens.filter(function (it) { return ehGarantia(it) === x[2]; });
    if (!mover.length) return;
    var cN = d.cab.indexOf(NOTAS);
    mover.forEach(function (it) {
      var vals = de.getRange(it._linha, 1, 1, d.cab.length).getValues();
      var nota = cN >= 0 ? de.getRange(it._linha, cN + 1).getNote() : '';
      var r = para.getLastRow() + 1;
      para.getRange(r, 1, 1, d.cab.length).setValues(vals);
      if (nota) para.getRange(r, cN + 1).setNote(nota);
      historico_(ss, 'AUTOMÁTICO', it.SERIAL, 'ABA', de.getName(), para.getName());
    });
    mover.map(function (it) { return it._linha; }).sort(function (a, b) { return b - a; })
      .forEach(function (r) { de.deleteRow(r); });
  });
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

/**
 * Move os produtos em garantia para a aba GARANTIA e recalcula das duas abas: PEÇAS (previsão pelo defeito + observações), a célula de NOTAS
 * (resumo, com o texto completo na nota da célula) e COMBINA COM. Só grava o que mudou.
 */
function recalcular_(ss) {
  distribuir_(ss);
  var d = lerTudo_(ss);
  if (!d.itens.length) return;
  var mapa = lerObs_(ss);
  var cP = d.cab.indexOf('PEÇAS'), cN = d.cab.indexOf(NOTAS), cC = d.cab.indexOf('COMBINA COM');
  var abas = {}, notas = {};
  [abaPrincipal_(ss), abaGarantia_(ss)].forEach(function (a) {
    abas[a.getName()] = a;
    notas[a.getName()] = cN >= 0 && a.getLastRow() > 1 ? a.getRange(2, cN + 1, a.getLastRow() - 1, 1).getNotes() : [];
  });
  d.itens.forEach(function (it) {
    var aba = abas[it._aba];
    var obs = obsDoItem_(mapa, it);
    if (cP >= 0) {
      var p = preverPecas(it.DEFEITO, obs.map(function (o) { return o.texto; })).texto;
      if (String(it['PEÇAS'] || '') !== p) { it['PEÇAS'] = p; aba.getRange(it._linha, cP + 1).setValue(p); }
    }
    if (cN >= 0 && obs.length) {
      var c = celulaNotas(obs), n = notaCompleta(obs);
      if (String(it[NOTAS] || '') !== c) aba.getRange(it._linha, cN + 1).setValue(c);
      if ((notas[it._aba][it._linha - 2] || [''])[0] !== n) aba.getRange(it._linha, cN + 1).setNote(n);
    }
  });
  escreverCompativeis_(ss, d.itens);
  if (cC < 0) return;
  var comb = combinacoes(d.itens);
  d.itens.forEach(function (it, i) {
    if (String(it['COMBINA COM'] || '') !== comb[i]) abas[it._aba].getRange(it._linha, cC + 1).setValue(comb[i]);
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
  var d = lerTudo_(ss);
  var limite = new Date(Date.now() - 30 * 86400000);
  var itens = d.itens.filter(function (it) {
    var sit = String(it['SITUAÇÃO'] || '').toUpperCase();
    if (ENCERRADAS.indexOf(sit) < 0) return true;
    var p = String(it['ÚLTIMA ATUALIZAÇÃO'] || '').split('/');
    return p.length === 3 && new Date(+p[2], +p[1] - 1, +p[0]) >= limite;
  });
  var mapa = lerObs_(ss);
  itens.forEach(function (it) { it._obs = obsParaTela_(obsDoItem_(mapa, it)); });
  return { listas: listas_(ss), itens: itens, colunas: d.cab, planilha: ss.getUrl(), ia: !!iaChave_(), montagens: planosDeMontagem(d.itens) };
}

function obsParaTela_(obs) {
  return obs.map(function (o) { return { data: dataLonga_(o.data), tecnico: o.tecnico, texto: o.texto }; });
}

/** Busca um aparelho pelo serial (em toda a planilha). */
function apiBuscar(serial) {
  var n = normalizarSerial(serial);
  if (!n) return null;
  var d = lerTudo_(planilha_());
  var achados = d.itens.filter(function (it) { return normalizarSerial(it.SERIAL) === n; });
  if (!achados.length) return null;
  var it = achados[achados.length - 1];
  it._obs = obsParaTela_(obsDoItem_(lerObs_(planilha_()), it));
  return it;
}

// ===== IA do SCAN (Gemini): lê a etiqueta pela foto quando o código de barras não basta =====

var IA_MODELOS = ['gemini-3.1-flash-lite-preview', 'gemini-3-flash-preview', 'gemini-flash-lite-latest', 'gemini-flash-latest'];
var IA_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';

function iaChave_() { return (typeof SEGREDOS !== 'undefined' && SEGREDOS.iaChave) || ''; }

/** Esta publicação tem a IA ligada? (a tela só oferece a leitura com IA quando sim) */
function apiIaLigada() { return !!iaChave_(); }

/**
 * Lê a foto da etiqueta com a IA e devolve { SERIAL, EAN, MARCA, MODELO, DESCRIÇÃO } (vazio = não achou).
 * jaLido: o que o código de barras já leu (vai como dica, a IA só confirma/completa).
 */
function apiLerComIA(base64, jaLido) {
  var k = iaChave_();
  if (!k) return { erro: 'A IA não está ligada nesta publicação.' };
  var dica = jaLido && (jaLido.serial || jaLido.ean) ? ' Já lido pelo código de barras: serial ' + (jaLido.serial || '?') + ', EAN ' + (jaLido.ean || '?') + '.' : '';
  var texto = 'Foto da etiqueta de um notebook, console ou acessório em manutenção. Leia o número de série (S/N, SN, Serial), ' +
    'o EAN/código de barras de 8 a 14 dígitos, a marca, o modelo (código do modelo, ex. E1504F, AG15-51P-39MU, 15IRH10) e uma descrição curta ' +
    '(tipo, processador, memória, armazenamento, se aparecerem). Copie exatamente o que está impresso; não invente. Deixe vazio o que não aparece.' + dica;
  var esquema = { type: 'OBJECT', properties: { serial: { type: 'STRING' }, ean: { type: 'STRING' }, marca: { type: 'STRING' }, modelo: { type: 'STRING' }, descricao: { type: 'STRING' } } };
  var partes = [{ text: texto }, { inline_data: { mime_type: 'image/jpeg', data: String(base64 || '').replace(/^data:[^,]*,/, '') } }];
  var erro = '';
  for (var i = 0; i < IA_MODELOS.length; i++) {
    var modos = ['minimal', ''];
    for (var j = 0; j < modos.length; j++) {
      var cfg = { temperature: 0, responseMimeType: 'application/json', responseSchema: esquema };
      if (modos[j]) cfg.thinkingConfig = { thinkingLevel: modos[j] };
      var r;
      try {
        r = UrlFetchApp.fetch(IA_URL + IA_MODELOS[i] + ':generateContent?key=' + encodeURIComponent(k), {
          method: 'post', contentType: 'application/json', muteHttpExceptions: true,
          payload: JSON.stringify({ contents: [{ role: 'user', parts: partes }], generationConfig: cfg })
        });
      } catch (e) { erro = String(e.message || e); break; }
      var cod = r.getResponseCode();
      if (cod === 400 && modos[j]) continue;          // modelo não aceita thinkingLevel: tenta sem
      if (cod !== 200) { erro = IA_MODELOS[i] + ' ' + cod; break; }   // ocupado/limite/sem modelo: próximo
      try {
        var t = JSON.parse(r.getContentText()).candidates[0].content.parts[0].text;
        var o = JSON.parse(t);
        return {
          SERIAL: String(o.serial || '').toUpperCase().replace(/\s+/g, ''),
          EAN: String(o.ean || '').replace(/\D/g, ''),
          MARCA: String(o.marca || '').toUpperCase(),
          MODELO: String(o.modelo || '').toUpperCase(),
          'DESCRIÇÃO': String(o.descricao || '').toUpperCase(),
          modelo_ia: IA_MODELOS[i]
        };
      } catch (e) { erro = 'resposta da IA ilegível'; break; }
    }
  }
  return { erro: 'A IA não respondeu agora (' + erro + '). Tente de novo em alguns segundos.' };
}

/** O que a planilha já sabe de um EAN (último aparelho com ele): tipo, marca, modelo, descrição. */
function apiPorEan(ean) {
  var e = String(ean || '').replace(/\D/g, '').replace(/^0(\d{13})$/, '$1');
  if (e.length < 8) return null;
  var d = lerTudo_(planilha_());
  for (var i = d.itens.length - 1; i >= 0; i--) {
    var it = d.itens[i];
    if (String(it.EAN || '').replace(/\D/g, '').replace(/^0(\d{13})$/, '$1') === e && (it.MODELO || it['DESCRIÇÃO'])) {
      return { TIPO: it.TIPO || '', MARCA: it.MARCA || '', MODELO: it.MODELO || '', 'DESCRIÇÃO': it['DESCRIÇÃO'] || '' };
    }
  }
  return null;
}

/**
 * Cria (sem _linha) ou atualiza (com _linha) um aparelho. Grava só os campos que mudaram.
 * item._nota: observação nova do técnico (vira uma linha em OBSERVAÇÕES, nada é apagado).
 * item._notas: várias observações [{data, texto, tecnico, origem}] (vindas do outro projeto).
 */
function apiSalvar(item, tecnico) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ss = planilha_();
    var aba = abaDe_(ss, item._linha ? item._aba : ABA);
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
      var linha = cab.map(function (h) {
        if (h === 'ÚLTIMA ATUALIZAÇÃO') return agora;
        if (COLUNAS_DO_APP.indexOf(h) >= 0) return '';
        return paraCelula(h, item[h] == null ? '' : item[h]);
      });
      var r = aba.getLastRow() + 1;
      aba.getRange(r, 1, 1, cab.length).setValues([linha]);
      historico_(ss, tecnico, serial, 'CADASTRO', '', item['SITUAÇÃO']);
      adicionarObs_(ss, { SERIAL: serial, MODELO: item.MODELO, _linha: r }, notasDoPedido_(item, tecnico, agora));
      recalcular_(ss);
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
      if (h === 'ÚLTIMA ATUALIZAÇÃO' || COLUNAS_DO_APP.indexOf(h) >= 0 || !(h in item)) return;
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
    var cM = cab.indexOf('MODELO');
    var it2 = { SERIAL: atual[cSerial], MODELO: cM >= 0 ? atual[cM] : '', _linha: r2 };
    if (mudouCol.SERIAL) renomearObs_(ss, normalizarSerial(item._serial) || ('LINHA ' + r2), chaveObs_(it2));
    if (adicionarObs_(ss, it2, notasDoPedido_(item, tecnico, agora))) mudou = true;
    if (!mudou) return { ok: true, linha: r2, nada: true };
    var cu = cab.indexOf('ÚLTIMA ATUALIZAÇÃO');
    if (cu >= 0) atual[cu] = agora;
    aba.getRange(r2, 1, 1, cab.length).setValues([atual]);
    recalcular_(ss);
    return { ok: true, linha: r2 };
  } finally {
    lock.releaseLock();
  }
}

function notasDoPedido_(item, tecnico, agora) {
  var out = (item._notas || []).slice();
  var t = String(item._nota || '').trim();
  if (t) out.push({ data: agora, tecnico: tecnico || '', texto: t, origem: 'APP' });
  return out;
}

/** Aparelho ganhou/mudou o serial: as observações acompanham. */
function renomearObs_(ss, de, para) {
  var o = ss.getSheetByName(OBS);
  if (!o || o.getLastRow() < 2 || !de) return;
  var r = o.getRange(2, 3, o.getLastRow() - 1, 1);
  var v = r.getValues(), mudou = false;
  v.forEach(function (l) { if (normalizarSerial(l[0]) === normalizarSerial(de)) { l[0] = para; mudou = true; } });
  if (mudou) r.setValues(v);
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
  var tec = 'JOÃO PEDRO';
  var notas = n.entradas.map(function (e) { return { data: e.data, tecnico: tec, texto: e.texto, origem: 'OUTRO PROJETO' }; });
  // A análise das peças feita no outro projeto entra como observação (a previsão lê e respeita).
  if (n.pecas) notas.push({ data: new Date(), tecnico: tec, texto: 'Peças com defeito: ' + n.pecas, origem: 'OUTRO PROJETO' });
  var ja = apiBuscar(n.serial);
  if (!ja) {
    var novo = { SERIAL: n.serial.toUpperCase(), MODELO: n.modelo || '', DEFEITO: n.defeito || '', 'TÉCNICO': tec,
      'SITUAÇÃO': (n.situacao || 'EM REPARO').toUpperCase(), _notas: notas };
    var r = apiSalvar(novo, tec + ' (notas)');
    return { ok: r.ok, serial: n.serial, criado: true };
  }
  var mud = { _linha: ja._linha, _aba: ja._aba, _serial: ja.SERIAL, _notas: notas };
  if (n.situacao && ENCERRADAS.indexOf(String(ja['SITUAÇÃO']).toUpperCase()) < 0) mud['SITUAÇÃO'] = n.situacao.toUpperCase();
  if (n.defeito && !String(ja.DEFEITO || '').trim()) mud.DEFEITO = n.defeito;
  if (n.modelo && !String(ja.MODELO || '').trim()) mud.MODELO = n.modelo;
  var r2 = apiSalvar(mud, tec + ' (notas)');
  return { ok: r2.ok, serial: n.serial, nada: !!r2.nada };
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
    var d = lerTudo_(ss);
    var idx = paraFinalizar(d.itens, fin);
    var cSit = d.cab.indexOf('SITUAÇÃO') + 1;
    var cUlt = d.cab.indexOf('ÚLTIMA ATUALIZAÇÃO') + 1;
    var hoje = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy');
    idx.forEach(function (i) {
      var it = d.itens[i];
      var aba = abaDe_(ss, it._aba);
      aba.getRange(it._linha, cSit).setValue(FINALIZADO);
      if (cUlt > 0) aba.getRange(it._linha, cUlt).setValue(new Date());
      adicionarObs_(ss, it, [{ data: new Date(), tecnico: 'AUTOMÁTICO', texto: 'Finalizado (aprovado no controle de qualidade).', origem: 'QUALIDADE' }]);
      historico_(ss, 'AUTOMÁTICO', it.SERIAL, 'SITUAÇÃO', it['SITUAÇÃO'], FINALIZADO);
    });
    recalcular_(ss);
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
  module.exports = { linhasCompativeis: linhasCompativeis, ehGarantia: ehGarantia, planosDeMontagem: planosDeMontagem, lerNota: lerNota, preverPecas: preverPecas, pecasDaColuna: pecasDaColuna, resumoObs: resumoObs, celulaNotas: celulaNotas, notaCompleta: notaCompleta, notasAntigas: notasAntigas, combinacoes: combinacoes, normalizarSerial: normalizarSerial, seriaisFinalizados: seriaisFinalizados, paraFinalizar: paraFinalizar };
}
