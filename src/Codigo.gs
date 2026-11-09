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
  QUALIDADE: '1JHONHaipHAKmtkcQ_7mm8VXA-h-LBQuu-I8uzPhjgDQ',
  // MANUTENÇÕES INFORMATICA GERAL: cada notebook dado como arrumado ganha uma linha na aba do mês ("NOVEMBRO 2026").
  // O app só acrescenta linhas; a única mudança na planilha é criar a aba do mês quando ela ainda não existe.
  ARRUMADOS: '10zHHWjV6Xva7ojDr7GpGRe_NuJufYZ62qhpwhMU3Hcs'
};
// Situações que contam como arrumado (vão para a planilha de manutenções do mês).
var ARRUMADO = ['REPARADO'];   // só REPARADO (escolhido no app); FINALIZADO vem do controle de qualidade e não entra
var MESES = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
var QUALIDADE_ABA = 'TabelaQualidade';
// true: só conta como finalizado quando "APROVADO?" = Sim. false: basta o serial aparecer.
var FINALIZA_SO_APROVADO = true;
// Conferência automática com o controle de qualidade, a cada N horas.
var SINCRONIZAR_HORAS = 2;

var ABA = 'APARELHOS';
var ABA_NOMES_ANTIGOS = ['EQUIPAMENTOS'];
var FINALIZADO = 'FINALIZADO';
var ENCERRADAS = ['FINALIZADO', 'SUCATA'];
// DEFEITO e LOCAL saíram (pedido do João, 05/11/2026): o defeito agora é a primeira observação.
var COLUNAS = ['DATA ENTRADA', 'TIPO', 'MARCA', 'MODELO', 'DESCRIÇÃO', 'EAN', 'SERIAL', 'NF', 'GARANTIA',
  'TÉCNICO', 'SITUAÇÃO', 'DEFEITO',
  'O QUE FOI FEITO / NOTAS', 'ÚLTIMA ATUALIZAÇÃO'];
// Colunas que o app preenche sozinho (acrescentadas no fim se faltarem).
// COMBINA COM saiu das abas (pedido do João): os grupos ficam só na aba COMPATÍVEIS e no app.
var COLUNAS_AUTO = [];
// Colunas que só o app escreve: PEÇAS (previsão), NOTAS (montada das observações) e COMBINA COM.
var NOTAS = 'O QUE FOI FEITO / NOTAS';
// DEFEITO = previsão das peças com defeito (antes se chamava PEÇAS; o nome mudou a pedido do João em 05/11/2026).
var COL_DEF = 'DEFEITO';
var COLUNAS_DO_APP = [COL_DEF, NOTAS, 'COMBINA COM'];
var OBS = 'OBSERVAÇÕES';
var VERSAO_PLANILHA = '11';
var DATAS = ['DATA ENTRADA', 'ÚLTIMA ATUALIZAÇÃO'];
// Produtos em garantia ficam na aba GARANTIA e os de sucata na aba SUCATA (mesmas colunas), não em APARELHOS.
var ABA_GARANTIA = 'GARANTIA';
var ABA_SUCATA = 'SUCATA';
var ABAS_DADOS = [ABA, ABA_GARANTIA, ABA_SUCATA];
// Aba PEÇAS = estoque das peças compradas (o João preenche). As duas últimas colunas o app preenche.
var ABA_PECAS = 'PEÇAS';
var CAB_PECAS = ['DATA COMPRA', 'PEÇA', 'CÓDIGO DA PEÇA', 'SERVE NOS MODELOS', 'VALOR', 'LINK', 'SITUAÇÃO', 'USADA EM (SERIAL)',
  'MODELOS COMPATÍVEIS (PESQUISA)', 'APARELHOS QUE PRECISAM', 'MEDIDA / CONECTOR'];
// Que medida precisa bater em cada tipo de peça (tela de 14" não serve onde vai 15,6"; 30 pinos não liga em 40).
var MEDIDAS_DA_PECA = { 'TELA': ['POLEGADAS', 'PINOS'], 'FLAT': ['PINOS'], 'MEMÓRIA': ['DDR'], 'SSD': ['SSD'] };
// Peças que servem em qualquer modelo (padrão). O João pode mudar na aba LISTAS, coluna PEÇAS UNIVERSAIS.
var PECAS_UNIVERSAIS = ['MEMÓRIA', 'SSD', 'WI-FI'];
// Aba COMPATIBILIDADE: modelos diferentes que usam a mesma peça (o João escreve ou o app pesquisa).
var ABA_COMPAT = 'COMPATIBILIDADE';
var CAB_COMPAT = ['PEÇA', 'MODELOS QUE USAM A MESMA PEÇA', 'ORIGEM', 'DATA'];
// Colunas que saíram de APARELHOS (valor e link agora ficam na aba PEÇAS). Só saem se estiverem vazias.
var COLUNAS_REMOVIDAS = ['VALOR PEÇAS', 'LINK PEÇA'];
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

/** Em que aba o aparelho deve ficar: SUCATA, GARANTIA ou APARELHOS. */
function abaDoItem(it) {
  if (semAcento_(it['SITUAÇÃO']).trim() === 'SUCATA') return ABA_SUCATA;
  return ehGarantia(it) ? ABA_GARANTIA : ABA;
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
  ['TELA', ['TELA', 'DISPLAY', 'LCD', 'LED SLIM', 'PIXEL', 'BACKLIGHT', 'MONITOR', 'PAINEL'], ['LISTRA', 'MANCHA', 'IMAGEM TREMENDO', 'IMAGEM PISCANDO', 'IMAGEM FRACA', 'TELA PRETA', 'TELA ESCURA', 'TELA APAGADA', 'SEM IMAGEM', 'SEM VIDEO', 'NAO DA VIDEO', 'NAO DA IMAGEM'],
    ['MOSTRA O LOGO', 'MOSTRA A LOGO', 'APARECE O LOGO', 'APARECE A LOGO', 'DA IMAGEM', 'COM IMAGEM', 'DA VIDEO']],
  ['CHIP DA BIOS', ['CHIP DA BIOS', 'BIOS CORROMPID', 'GRAVAR A BIOS', 'REGRAVAR A BIOS', ' EC ', 'W25', '25Q'],
    ['NAO ABRE A BIOS', 'NAO ENTRA NA BIOS', 'NAO ACESSA A BIOS', 'TRAVA NO LOGO', 'FICA NO LOGO', 'NAO PASSA DO LOGO'],
    ['ABRE A BIOS', 'ENTRA NA BIOS', 'ACESSA A BIOS']],
  ['WEBCAM', ['WEBCAM', 'CAMERA'], [], []],
  ['TECLADO', ['TECLADO', 'TECLA'], ['DIGITA SOZINHO', 'LETRA FALHANDO'], []],
  ['TOUCHPAD', ['TOUCHPAD', 'TOUCH PAD', 'MOUSEPAD', 'MOUSE PAD', 'CLICKPAD'], ['CURSOR SOZINHO', 'MOUSE NAO MEXE', 'MOUSE NAO FUNCIONA'], []],
  ['BATERIA', ['BATERIA', 'BATERIA ESTUFADA'], ['NAO SEGURA CARGA', 'DESCARREGA RAPIDO', 'SO LIGA NA TOMADA', 'SO FUNCIONA NA TOMADA', 'ESTUFAD'], []],
  ['CARREGADOR', ['CARREGADOR', 'FONTE', 'CONECTOR DE CARGA', 'DC JACK', 'DCJACK', 'CONECTOR DC', 'PLUG DE CARGA'], ['NAO CARREGA'], ['CARREGA NORMAL', 'ESTA CARREGANDO']],
  ['ÁUDIO', ['AUDIO', ' SOM ', 'ALTO FALANTE', 'AUTO FALANTE', 'ALTO-FALANTE', 'AUTO-FALANTE'], ['CHIANDO'], []],
  ['MICROFONE', ['MICROFONE', ' MIC '], [], []],
  ['ENTRADA P2', [' P2 ', ' FONE ', 'FONE DE OUVIDO', ' FONES '], [], []],
  ['WI-FI', ['WIFI', 'WI-FI', 'WI FI', 'PLACA DE REDE', 'WIRELESS', 'ANTENA', 'BLUETOOTH'], ['SEM INTERNET', 'NAO CONECTA', 'NAO ACHA REDE'], []],
  ['USB', ['USB', 'PORTA USB', 'ENTRADA USB'], ['PEN DRIVE NAO', 'NAO RECONHECE O MOUSE'], []],
  ['HDMI', ['HDMI'], [], []],
  ['SSD', ['SSD', ' HD ', 'HDD', 'NVME', 'M 2', 'ARMAZENAMENTO', 'DISCO'], ['NAO ACHA O DISCO', 'SEM SISTEMA', 'NAO DA BOOT', 'NO BOOTABLE'], []],
  ['MEMÓRIA', ['MEMORIA', ' PENTE', ' RAM ', 'DDR3', 'DDR4', 'DDR5'], ['APITA', 'BIPANDO', 'BIPES', 'TELA AZUL', 'REINICIA SOZINHO'], []],
  ['COOLER', ['COOLER', 'VENTOINHA', ' FAN ', 'DISSIPADOR', 'PASTA TERMICA'], ['ESQUENTA', 'AQUECEND', 'SUPERAQUEC', 'DESLIGA SOZINHO', 'BARULHO', 'ZUMBIDO'], []],
  ['CARCAÇA', ['CARCACA', 'TAMPA', 'DOBRADICA', 'BASE QUEBRAD', 'MOLDURA', 'BEZEL', 'PALMREST', 'CHASSI'], [], []],
  ['FLAT', ['FLAT', 'CABO DE VIDEO', 'CABO FLAT', 'CABO LVDS', 'CABO EDP'], [], []],
  ['PLACA-MÃE', ['PLACA MAE', 'PLACA-MAE', 'MOTHERBOARD', 'CORROID', 'OXIDAD', 'MOLHAD', 'CAIU AGUA', 'CAIU LIQUIDO'], ['NAO LIGA', 'EM CURTO', 'NAO ACENDE', 'PLACA MORTA'], []]
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
function lerFrase_(frase, naoResolveu, lista) {
  var t = ' ' + semAcento_(frase).replace(/[^A-Z0-9-]+/g, ' ').trim() + ' ';
  var out = {};
  if (t.trim().length < 2 || P_IGNORA.test(t)) return out;
  var s = t.replace(P_NEGA, ' DEFX ');
  (lista || PREVER).forEach(function (p) {
    var limpo = t;
    p[2].forEach(function (w) { limpo = limpo.split(w).join(' '); });
    var forte = p[1].some(function (w) { return limpo.indexOf(w) >= 0; });
    var fraco = p[2].some(function (w) { return t.indexOf(w) >= 0; });
    var bom = p[3].some(function (w) { return temSemNao_(t, w); });
    if (!forte && !fraco && !bom) return;
    var e, x = true;
    if (bom || P_NAO_RESOLVEU.test(s)) e = 'OK';
    else if (P_TROCA.test(s)) e = naoResolveu ? 'OK' : 'TROCADA';
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
function preverPecas(defeito, textos, extras) {
  var lista = vocabulario(extras);
  var est = {}, ordem = [], suspeitou = {};
  [defeito].concat(textos || []).forEach(function (txt) {
    String(txt == null ? '' : txt).split(/[.;\n!?]+/).forEach(function (sentenca) {
    var nr = P_NAO_RESOLVEU.test(' ' + semAcento_(sentenca).replace(/[^A-Z0-9-]+/g, ' ') + ' ');
    sentenca.split(/,| MAS | POREM | PORÉM | mas | porém | porem /).forEach(function (fr) {
      var r = lerFrase_(fr, nr, lista);
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

/** PREVER com as palavras extras { PEÇA: ['PALAVRA', ...] } somadas às palavras da peça (peça nova entra no fim). Pura. */
function vocabulario(extras) {
  if (!extras || !Object.keys(extras).length) return PREVER;
  var lista = PREVER.map(function (p) { return [p[0], p[1].slice(), p[2], p[3]]; });
  Object.keys(extras).forEach(function (pc) {
    var ws = extras[pc].map(function (w) { return ' ' + semAcento_(w).replace(/[^A-Z0-9-]+/g, ' ').trim() + ' '; }).filter(function (w) { return w.trim().length >= 2; });
    var achou = lista.filter(function (p) { return p[0] === pc; })[0];
    if (achou) achou[1] = achou[1].concat(ws); else lista.push([pc, ws, [], []]);
  });
  return lista;
}

/** Coluna PALAVRAS DAS PEÇAS da aba LISTAS ("TELA: MONITOR, PAINEL") em { TELA: ['MONITOR', 'PAINEL'] }. "(IA)" no fim é só marca. Pura. */
function palavrasExtras(linhas) {
  var out = {};
  (linhas || []).forEach(function (l) {
    var m = String(l == null ? '' : l).match(/^\s*([^:=]+?)\s*[:=]\s*(.+)$/);
    if (!m) return;
    var pc = tipoDaPeca(m[1]) || semAcento_(m[1]).trim();
    if (!pc) return;
    m[2].replace(/\(IA\)/gi, '').split(/[,;]+/).map(function (w) { return w.trim(); }).filter(String).forEach(function (w) {
      (out[pc] = out[pc] || []).push(w);
    });
  });
  return out;
}

/** Junta a previsão das regras com a da IA (usada só quando as regras não acharam peça nenhuma). Pura. */
function previsaoFinal(regras, pecasIA) {
  if (regras.pecas.length || !pecasIA || !pecasIA.length) return regras;
  var fora = pecasIA.filter(function (p) { return regras.texto.indexOf(p) < 0; });
  if (!fora.length) return regras;
  var t = fora.map(function (p) { return p + ' (SUSPEITA · IA)'; }).join(', ');
  return { texto: t + (regras.texto ? ' | ' + regras.texto : ''), pecas: fora };
}

/** Peças com defeito a partir do texto da coluna PEÇAS (parte antes do "|", sem o grau entre parênteses). */
function pecasDaColuna(v) {
  var def = String(v == null ? '' : v).split('|').filter(function (x) { return !/^\s*(TROCADO|DESCARTADO)\s*:/i.test(x); })[0] || '';
  return def.split(/[,;\/]+/)
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
    var pecas = pecasDaColuna(it[COL_DEF]);
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
function planosDeMontagem(itens, estoque, compat) {
  var lista = [];
  itens.forEach(function (it, i) {
    var sit = semAcento_(it['SITUAÇÃO']).trim();
    var m = modeloChave_(it.MODELO);
    if (sit === 'FINALIZADO' || !m) return;
    lista.push({ i: i, m: m, t: semAcento_(it.TIPO).trim(), modelo: String(it.MODELO || '').trim(), serial: String(it.SERIAL || '').trim() || ('linha ' + it._linha),
      aba: it._aba || '', linha: it._linha, pecas: pecasDaColuna(it[COL_DEF]), sucata: sit === 'SUCATA', usadas: {}, doou: false, montado: false,
      medidas: medidasDoItem(it) });
  });
  // Peça comprada em estoque também conta como doador (só da peça dela, nos modelos em que serve).
  (estoque || []).forEach(function (e, k) {
    if (!e.tipo || e.usada) return;
    lista.push({ i: 'e' + k, estoque: true, modelos: e.modelos, oferece: [e.tipo], serial: 'PEÇA COMPRADA' + (e.codigo ? ' ' + e.codigo : ' (' + e.peca + ')'),
      pecas: [], sucata: false, usadas: {}, doou: false, montado: true, medidas: e.medidas || {} });
  });
  var alvos = lista.filter(function (a) { return !a.estoque && !a.sucata && a.pecas.length; })
    .sort(function (a, b) { return a.pecas.length - b.pecas.length; });
  var planos = [];
  alvos.forEach(function (a) {
    if (a.doou) return;
    var doadores = lista.filter(function (b) {
      if (b.estoque) return true;
      return b !== a && !b.montado && (!a.t || !b.t || a.t === b.t);
    });
    var serve = function (b, p) {
      return (b.estoque ? pecaServeEstoque(p, a.modelo, b.modelos, compat) : pecaServe(p, a.modelo, b.modelo, compat)) && medidasBatem(p, a.medidas, b.medidas);
    };
    var falta = a.pecas.slice(), recebe = [];
    while (falta.length) {
      var melhor = null, cobre = [];
      doadores.forEach(function (b) {
        var c = falta.filter(function (p) { return (b.oferece ? b.oferece.indexOf(p) >= 0 : b.pecas.indexOf(p) < 0) && !b.usadas[p] && serve(b, p); });
        if (!c.length) return;
        var nota = c.length * 10 + (b.estoque ? 6 : 0) + (b.sucata ? 5 : 0) + (b.m === a.m ? 3 : 0) + Math.min(b.pecas.length, 4);
        if (!melhor || nota > melhor.nota) { melhor = { b: b, nota: nota }; cobre = c; }
      });
      if (!melhor) break;
      cobre.forEach(function (p) { recebe.push({ peca: p, de: melhor.b.serial, sucata: melhor.b.sucata, comprada: !!melhor.b.estoque,
        outroModelo: !melhor.b.estoque && melhor.b.m !== a.m ? melhor.b.modelo : '', d: melhor.b }); melhor.b.usadas[p] = true; });
      falta = falta.filter(function (p) { return cobre.indexOf(p) < 0; });
    }
    if (falta.length) { recebe.forEach(function (r) { delete r.d.usadas[r.peca]; }); return; }
    a.montado = true;
    recebe.forEach(function (r) { r.d.doou = true; delete r.d; });
    planos.push({ serial: a.serial, modelo: a.modelo, aba: a.aba, linha: a.linha, recebe: recebe });
  });
  return planos;
}

// ===== Compatibilidade entre modelos =====

function universais_(compat) { return (compat && compat.universais) || PECAS_UNIVERSAIS; }

/** A peça p de um aparelho modeloB serve no modeloA? Mesmo modelo, peça universal ou grupo da aba COMPATIBILIDADE. */
function pecaServe(p, modeloA, modeloB, compat) {
  var ka = modeloChave_(modeloA), kb = modeloChave_(modeloB);
  if (ka && ka === kb) return true;
  if (universais_(compat).indexOf(p) >= 0) return true;
  return ((compat && compat.grupos) || []).some(function (g) {
    return (!g.peca || g.peca === p) && modelosCombinam(modeloA, g.modelos) && modelosCombinam(modeloB, g.modelos);
  });
}

/** Peça comprada (lista de modelos em que serve) serve no modeloA? */
function pecaServeEstoque(p, modeloA, listaModelos, compat) {
  if (universais_(compat).indexOf(p) >= 0) return true;
  if (modelosCombinam(modeloA, listaModelos)) return true;
  return ((compat && compat.grupos) || []).some(function (g) {
    return (!g.peca || g.peca === p) && modelosCombinam(modeloA, g.modelos) && modelosCombinam(listaModelos, g.modelos);
  });
}

/** Lê LISTAS (coluna PEÇAS UNIVERSAIS) e a aba COMPATIBILIDADE. */
function compatDe(universais, linhasCompat) {
  var u = (universais || []).map(function (x) { return tipoDaPeca(x) || String(x).trim().toUpperCase(); }).filter(String);
  var grupos = (linhasCompat || []).slice(1).map(function (l) {
    return { peca: tipoDaPeca(l[0]) || String(l[0] || '').trim().toUpperCase(), modelos: String(l[1] || '') };
  }).filter(function (g) { return codigosModelo_(g.modelos).length >= 2; });
  return { universais: u.length ? u : PECAS_UNIVERSAIS, grupos: grupos };
}

// ===== Peças compradas (aba PEÇAS) =====

/** Tipo da peça pelo nome (ex.: "Tela 15.6 LED slim" → TELA). Vazio se não reconhecer. */
function tipoDaPeca(texto) {
  var t = ' ' + semAcento_(texto).replace(/[^A-Z0-9-]+/g, ' ').trim() + ' ';
  for (var i = 0; i < PREVER.length; i++) {
    if (PREVER[i][1].some(function (w) { return t.indexOf(w) >= 0; })) return PREVER[i][0];
  }
  return '';
}

/** Códigos de modelo dentro de um texto (têm letra e número, 4+ caracteres). */
function codigosModelo_(texto) {
  return String(texto == null ? '' : texto).toUpperCase().split(/[^A-Z0-9-]+/).map(function (x) { return x.replace(/-/g, ''); })
    .filter(function (x) { return x.length >= 4 && /[A-Z]/.test(x) && /\d/.test(x); });
}

/** O modelo do aparelho está na lista de modelos em que a peça serve? (E1504F serve no E1504FA) */
function modelosCombinam(modeloAparelho, listaModelos) {
  var a = codigosModelo_(modeloAparelho), b = codigosModelo_(listaModelos);
  return a.some(function (x) {
    return b.some(function (y) { var c = Math.min(x.length, y.length); return c >= 5 && (x.indexOf(y) === 0 || y.indexOf(x) === 0); });
  });
}

/** Medidas escritas num texto: { POLEGADAS: '15.6', PINOS: '30', DDR: 'DDR4', SSD: 'NVME' }. Pura. */
function medidas(texto) {
  var t = ' ' + semAcento_(texto).replace(/,/g, '.') + ' ';
  var out = {}, m;
  if ((m = t.match(/[^0-9.](1[0-7])\.([0-9])(?![0-9])/)) || (m = t.match(/[^0-9.](1[0-7])(\.[0-9])?\s*("|”|''|POL)/))) out.POLEGADAS = String(parseFloat(m[1] + (m[2] && m[2][0] !== '.' ? '.' + m[2] : (m[2] || ''))));
  if ((m = t.match(/[^0-9.]([2-6][0-9])\s*-?\s*(PINOS?|PINS?|P)(?![A-Z])/))) out.PINOS = m[1];
  if ((m = t.match(/DDR\s?([2-5])/))) out.DDR = 'DDR' + m[1];
  if (/NVME|PCIE/.test(t)) out.SSD = 'NVME';
  else if (/MSATA/.test(t)) out.SSD = 'MSATA';
  else if (/M\.?\s?2/.test(t) && /SATA/.test(t)) out.SSD = 'M.2 SATA';
  else if (/SATA|2\.5/.test(t) && !/M\.?\s?2/.test(t) && /SSD|HD/.test(t)) out.SSD = 'SATA 2.5';
  return out;
}

/** Medidas em texto curto para a coluna MEDIDA / CONECTOR, ex.: 15.6" · 30 pinos. Pura. */
function textoMedidas(md) {
  var p = [];
  if (md.POLEGADAS) p.push(md.POLEGADAS + '"');
  if (md.PINOS) p.push(md.PINOS + ' pinos');
  if (md.DDR) p.push(md.DDR);
  if (md.SSD) p.push(md.SSD);
  return p.join(' · ');
}

/** As medidas que importam para a peça batem? Medida que só um dos lados tem não impede. Pura. */
function medidasBatem(tipo, a, b) {
  return (MEDIDAS_DA_PECA[tipo] || []).every(function (k) { return !a[k] || !b[k] || a[k] === b[k]; });
}

/** Medidas do aparelho pelo que está escrito nele (modelo, descrição, defeito, notas). */
function medidasDoItem(it) {
  return medidas([it.MODELO, it['DESCRIÇÃO'], it[NOTAS]].join(' '));
}

/** Linhas da aba PEÇAS em objetos simples. */
function estoqueDe(linhas) {
  if (!linhas || linhas.length < 2) return [];
  var cab = linhas[0].map(function (h) { return String(h).trim(); });
  var c = function (n) { return cab.indexOf(n); };
  return linhas.slice(1).map(function (l, k) {
    var g = function (n) { return c(n) >= 0 ? String(l[c(n)] == null ? '' : l[c(n)]).trim() : ''; };
    var peca = g('PEÇA');
    return { linha: k + 2, peca: peca, codigo: g('CÓDIGO DA PEÇA'), link: g('LINK'), serve: g('SERVE NOS MODELOS'), tipo: tipoDaPeca(peca),
      medida: g('MEDIDA / CONECTOR'), medidas: medidas(peca + ' ' + g('MEDIDA / CONECTOR')),
      modelos: [g('SERVE NOS MODELOS'), g('MODELOS COMPATÍVEIS (PESQUISA)')].filter(String).join(', '),
      pesquisa: g('MODELOS COMPATÍVEIS (PESQUISA)'), usada: /USAD/.test(semAcento_(g('SITUAÇÃO'))) || !!g('USADA EM (SERIAL)') };
  }).filter(function (e) { return e.peca || e.codigo; });
}

/** A peça comprada e serve no aparelho it? Modelo compatível e medidas que batem. Pura. */
function compradaServe(e, it, compat) {
  return pecaServeEstoque(e.tipo, it.MODELO, e.modelos, compat) && medidasBatem(e.tipo, medidasDoItem(it), e.medidas || {});
}

/** Aparelhos em aberto que precisam de cada peça comprada (mesmo tipo e modelo compatível). */
function aparelhosParaPecas(estoque, itens, compat) {
  return estoque.map(function (e) {
    if (e.usada || !e.tipo) return '';
    return itens.filter(function (it) {
      var sit = semAcento_(it['SITUAÇÃO']).trim();
      return sit !== 'FINALIZADO' && sit !== 'SUCATA' && pecasDaColuna(it[COL_DEF]).indexOf(e.tipo) >= 0 && compradaServe(e, it, compat);
    }).map(function (it) { return String(it.SERIAL || '').trim() + (it.MODELO ? ' (' + it.MODELO + ')' : ''); }).join('\n');
  });
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
  // VALOR PEÇAS e LINK PEÇA saem de APARELHOS/GARANTIA/SUCATA quando estão vazias (agora ficam na aba PEÇAS).
  var dados = [aba, abaDados_(ss, ABA_GARANTIA), abaDados_(ss, ABA_SUCATA)];
  COLUNAS_REMOVIDAS.forEach(function (nome) {
    var j = cab.indexOf(nome);
    if (j < 0) return;
    var vazia = dados.every(function (x) {
      var n = x.getLastRow() - 1;
      return n < 1 || x.getRange(2, j + 1, n, 1).getValues().every(function (l) { return String(l[0]).trim() === ''; });
    });
    if (!vazia) return;
    dados.forEach(function (x) { if (cabecalho_(x)[j] === nome) x.deleteColumn(j + 1); });
    cab = cabecalho_(aba);
  });
  // Peças universais (o João pode editar na LISTAS) e aba COMPATIBILIDADE.
  var ls = ss.getSheetByName('LISTAS');
  if (ls && cabecalho_(ls).indexOf('PEÇAS UNIVERSAIS') < 0) {
    var cu = cabecalho_(ls).filter(String).length + 1;
    ls.getRange(1, cu, PECAS_UNIVERSAIS.length + 1, 1).setValues([['PEÇAS UNIVERSAIS']].concat(PECAS_UNIVERSAIS.map(function (x) { return [x]; })));
  }
  if (ls && cabecalho_(ls).indexOf('PALAVRAS DAS PEÇAS') < 0) {
    var cw = cabecalho_(ls).filter(String).length + 1;
    ls.getRange(1, cw, 2, 1).setValues([['PALAVRAS DAS PEÇAS'], ['TELA: PAINEL, MONITOR']]);
    ls.getRange(1, cw).setNote('Uma peça por linha: "PEÇA: palavra, outra palavra". A previsão da coluna PEÇAS passa a reconhecer essas palavras. ' +
      'Quando as regras não acham nada, a IA lê o defeito e acrescenta aqui a palavra que usou, marcada com (IA). Pode apagar ou corrigir.');
  }
  if (!ss.getSheetByName(ABA_COMPAT)) {
    var ca = ss.insertSheet(ABA_COMPAT);
    ca.getRange(1, 1, 1, CAB_COMPAT.length).setValues([CAB_COMPAT]).setFontWeight('bold');
    ca.setFrozenRows(1);
    ca.setColumnWidth(2, 360);
  }
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
  // Abas GARANTIA e SUCATA com as mesmas colunas de APARELHOS (antes eram listas automáticas).
  var extras = [ABA_GARANTIA, ABA_SUCATA].map(function (n) {
    var x = abaDados_(ss, n);
    x.getRange(1, 1, 1, cab.length).setValues([cab]);
    return x;
  });
  // Aba PEÇAS vira o estoque de peças compradas (se ainda for a lista antiga de aparelhos, recomeça).
  var pc = ss.getSheetByName(ABA_PECAS) || ss.insertSheet(ABA_PECAS);
  if (cabecalho_(pc).join('|') !== CAB_PECAS.join('|')) {
    var antigo = cabecalho_(pc);
    if (antigo.indexOf('PEÇA') < 0) pc.clear();
    pc.getRange(1, 1, 1, CAB_PECAS.length).setValues([CAB_PECAS]).setFontWeight('bold');
    pc.setFrozenRows(1);
    pc.setColumnWidth(2, 220); pc.setColumnWidth(4, 220); pc.setColumnWidth(9, 260); pc.setColumnWidth(10, 260); pc.setColumnWidth(11, 160);
  }
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
  removerDefeitoLocal_(ss, [aba].concat(extras));
  cab = cabecalho_(aba);
  cN = cab.indexOf(NOTAS) + 1;
  // Célula de notas compacta: uma linha por observação, sem quebrar o texto.
  if (cN > 0) [aba].concat(extras).forEach(function (x) {
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
    out.push({ grupo: g, valores: [g + 1, 'MONTAR', p.serial, p.modelo, a._aba || '', a['SITUAÇÃO'] || '', String(a[COL_DEF] || ''),
      'Recebe ' + p.recebe.map(function (r) { return r.peca; }).join(', ') + ' de ' + ordem.length + (ordem.length === 1 ? ' doador' : ' doadores')] });
    ordem.forEach(function (s) {
      var b = porSerial[s] || {};
      var comprada = /^PEÇA COMPRADA/.test(s);
      out.push({ grupo: g, valores: [g + 1, comprada ? 'PEÇA COMPRADA' : String(b['SITUAÇÃO'] || '').toUpperCase() === 'SUCATA' ? 'DOADOR (SUCATA)' : 'DOADOR', s, b.MODELO || (comprada ? '' : p.modelo),
        b._aba || (comprada ? 'PEÇAS' : ''), b['SITUAÇÃO'] || (comprada ? 'EM ESTOQUE' : ''), String(b[COL_DEF] || ''), 'Dá ' + de[s].join(', ') + ' para ' + p.serial + (b.MODELO && modeloChave_(b.MODELO) !== modeloChave_(p.modelo) ? ' (outro modelo, mesma peça)' : '')] });
    });
  });
  return out;
}

/** Peças universais (LISTAS) + grupos de modelos da aba COMPATIBILIDADE. */
function lerCompat_(ss) {
  var l = listas_(ss);
  var c = ss.getSheetByName(ABA_COMPAT);
  var linhas = c && c.getLastRow() > 1 ? c.getRange(1, 1, c.getLastRow(), 2).getValues() : [];
  return compatDe(l['PEÇAS UNIVERSAIS'], linhas);
}

/**
 * Pesquisa (IA do SCAN com busca do Google) quais outros modelos usam a MESMA peça que um modelo em aberto precisa.
 * Uma pesquisa por modelo+peça (fica guardado), no máximo `limite` por vez. O resultado vira uma linha da aba COMPATIBILIDADE.
 */
function pesquisarIrmaos_(ss, limite) {
  var k = iaChave_();
  var c = ss.getSheetByName(ABA_COMPAT);
  if (!k || !c) return 0;
  var props = PropertiesService.getScriptProperties();
  var compat = lerCompat_(ss);
  var feitas = 0, vistos = {};
  lerTudo_(ss).itens.forEach(function (it) {
    var sit = semAcento_(it['SITUAÇÃO']).trim();
    var cod = codigosModelo_(it.MODELO)[0];
    if (feitas >= limite || !cod || sit === 'FINALIZADO' || sit === 'SUCATA') return;
    pecasDaColuna(it[COL_DEF]).forEach(function (p) {
      var chave = 'irm:' + p + ':' + cod;
      if (feitas >= limite || vistos[chave] || compat.universais.indexOf(p) >= 0 || props.getProperty(chave)) return;
      vistos[chave] = true;
      var ja = compat.grupos.some(function (g) { return g.peca === p && modelosCombinam(it.MODELO, g.modelos); });
      if (ja) { props.setProperty(chave, '1'); return; }
      var r = pesquisarIA_(k, 'Notebook modelo "' + it.MODELO + '"' + (it.MARCA ? ' da marca ' + it.MARCA : '') + '. Pesquise quais OUTROS modelos de notebook usam ' +
        'exatamente a mesma peça "' + p + '" (mesmo part number, encaixe e conector). Responda só com os códigos de modelo separados por vírgula, ' +
        'sem texto extra. Se não achar nada confiável, responda NADA.');
      if (r === null) return;
      props.setProperty(chave, '1');
      feitas++;
      var lista = codigosModelo_(r).filter(function (x) { return !modelosCombinam(x, it.MODELO); });
      if (lista.length) c.appendRow([p, [cod].concat(lista).join(', '), 'PESQUISA', new Date()]);
    });
  });
  return feitas;
}

function chavePrevisao_(defeito, textos) {
  return 'prev:' + Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, [defeito].concat(textos).join('\n')));
}

/**
 * Quando as regras não reconhecem nenhuma peça no defeito/observações, a IA lê o texto (uma vez por texto, sem busca na internet).
 * A peça que ela achar entra como SUSPEITA · IA, e a palavra que ela usou vai para LISTAS › PALAVRAS DAS PEÇAS (as regras aprendem).
 */
function preverComIA_(ss, limite) {
  var k = iaChave_();
  if (!k) return 0;
  var d = lerTudo_(ss);
  var mapa = lerObs_(ss);
  var extras = palavrasExtras(listas_(ss)['PALAVRAS DAS PEÇAS']);
  var props = PropertiesService.getScriptProperties();
  var nomes = PREVER.map(function (p) { return p[0]; });
  var feitas = 0, novas = [];
  d.itens.forEach(function (it) {
    var sit = semAcento_(it['SITUAÇÃO']).trim();
    if (feitas >= limite || sit === 'FINALIZADO' || sit === 'SUCATA') return;
    var textos = obsDoItem_(mapa, it).map(function (o) { return o.texto; });
    var tudo = textos.join(' ').trim();
    if (tudo.length < 4 || preverPecas('', textos, extras).pecas.length) return;
    var chave = chavePrevisao_('', textos);
    if (props.getProperty(chave) !== null) return;
    var t = pesquisarIA_(k, 'Notebook em manutenção. Defeito e anotações dos técnicos, em ordem:\n' + textos.filter(String).join('\n') +
      '\n\nQuais peças provavelmente estão com defeito? Use só nomes desta lista: ' + nomes.join(', ') + '.\n' +
      'Uma linha por peça, no formato PEÇA = palavra ou trecho curto (até 4 palavras) copiado do texto que indica isso. ' +
      'Sem texto extra. Se não der para saber, responda NADA.', []);
    feitas++;
    if (t === null) return;
    var r = respostaPrevisao(t, nomes);
    props.setProperty(chave, r.pecas.join(','));
    r.palavras.forEach(function (x) { novas.push(x.peca + ': ' + x.palavra + ' (IA)'); });
  });
  if (novas.length) {
    var ls = ss.getSheetByName('LISTAS');
    var col = ls ? cabecalho_(ls).indexOf('PALAVRAS DAS PEÇAS') + 1 : 0;
    if (col > 0) {
      var ja = (listas_(ss)['PALAVRAS DAS PEÇAS'] || []).map(semAcento_);
      var fim = ls.getRange(1, col, ls.getMaxRows(), 1).getValues().map(function (l) { return String(l[0]).trim(); });
      var ultima = fim.length; while (ultima > 0 && !fim[ultima - 1]) ultima--;
      novas.filter(function (x, n, a) { return a.indexOf(x) === n && ja.indexOf(semAcento_(x)) < 0; })
        .forEach(function (x, n) { ls.getRange(ultima + 1 + n, col).setValue(x); });
    }
  }
  if (feitas) recalcular_(ss);
  return feitas;
}

/** Lê "TELA = listras na imagem" da IA: peças válidas e palavras para aprender. Pura. */
function respostaPrevisao(t, nomes) {
  var pecas = [], palavras = [];
  String(t || '').split(/\n+/).forEach(function (l) {
    var m = l.match(/^\s*[-*•]?\s*([^=:]+?)\s*[=:]\s*(.*)$/);
    var nome = m ? semAcento_(m[1]).trim() : '';
    var pc = (nomes || []).filter(function (n) { return semAcento_(n) === nome; })[0] || (m ? tipoDaPeca(m[1]) : '');
    if (!pc || pecas.indexOf(pc) >= 0) return;
    pecas.push(pc);
    var w = String(m[2] || '').replace(/["“”.]/g, '').trim();
    if (w.length >= 4 && w.split(/\s+/).length <= 4) palavras.push({ peca: pc, palavra: w.toUpperCase() });
  });
  return { pecas: pecas, palavras: palavras };
}

/** Pergunta curta à IA com busca do Google; devolve o texto, '' se respondeu NADA, null se não respondeu. */
function pesquisarIA_(k, pergunta, ferramentas) {
  if (!ferramentas) ferramentas = [{ google_search: {} }];
  for (var i = 0; i < IA_MODELOS.length; i++) {
    var r;
    try {
      r = UrlFetchApp.fetch(IA_URL + IA_MODELOS[i] + ':generateContent?key=' + encodeURIComponent(k), {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        payload: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: pergunta }] }], tools: ferramentas.length ? ferramentas : undefined, generationConfig: { temperature: 0 } })
      });
    } catch (x) { continue; }
    if (r.getResponseCode() !== 200) continue;
    try {
      var t = JSON.parse(r.getContentText()).candidates[0].content.parts.map(function (p) { return p.text || ''; }).join(' ').trim();
      return /^NADA\b/i.test(t) ? '' : t;
    } catch (x) { continue; }
  }
  return null;
}

function lerEstoque_(ss) {
  var pc = ss.getSheetByName(ABA_PECAS);
  if (!pc || pc.getLastRow() < 2) return [];
  return estoqueDe(pc.getRange(1, 1, pc.getLastRow(), CAB_PECAS.length).getValues());
}

/** Preenche APARELHOS QUE PRECISAM na aba PEÇAS (só grava o que mudou). */
function escreverPecas_(ss, d, est, compat) {
  var pc = ss.getSheetByName(ABA_PECAS);
  if (!pc || !est.length) return;
  var col = CAB_PECAS.indexOf('APARELHOS QUE PRECISAM') + 1;
  var precisam = aparelhosParaPecas(est, d.itens, compat);
  var colMed = CAB_PECAS.indexOf('MEDIDA / CONECTOR') + 1;
  est.forEach(function (e, k) {
    var r = pc.getRange(e.linha, col);
    if (String(r.getValue()) !== precisam[k]) r.setValue(precisam[k]);
    var md = textoMedidas(e.medidas);
    if (!e.medida && md) pc.getRange(e.linha, colMed).setValue(md);
  });
}

/** Cor de cada aparelho que está num grupo de montagem (mesma cor da aba COMPATÍVEIS). Pura. */
function coresDosGrupos(planos) {
  var cor = {};
  planos.forEach(function (p, g) {
    var c = CORES_GRUPOS[g % CORES_GRUPOS.length];
    cor[normalizarSerial(p.serial)] = c;
    p.recebe.forEach(function (r) { cor[normalizarSerial(r.de)] = c; });
  });
  return cor;
}

/** Reescreve a aba COMPATÍVEIS (só quando mudou): cada grupo com uma cor. */
function escreverCompativeis_(ss, itens, est, compat) {
  var linhas = linhasCompativeis(planosDeMontagem(itens, est, compat), itens);
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
    var pc = String(it['PEÇAS'] || '').trim();   // coluna antiga (antes de virar DEFEITO)
    if (pc) lista.push({ data: data, tecnico: it['TÉCNICO'] || '', texto: 'Peças com defeito: ' + pc });
    lista.forEach(function (o) {
      linhas.push([paraData_(o.data), o.tecnico, chaveObs_(it), it.MODELO || '', o.texto, 'PLANILHA']);
    });
  });
  if (linhas.length) ss.getSheetByName(OBS).getRange(2, 1, linhas.length, 6).setValues(linhas);
}

/**
 * Tira as colunas DEFEITO e LOCAL das abas de dados. O que estava escrito em DEFEITO vira a primeira observação do aparelho
 * (data de entrada, técnico do aparelho, origem DEFEITO), para a previsão das peças continuar lendo. LOCAL só sai.
 */
function removerDefeitoLocal_(ss, abas) {
  abas.forEach(function (x) {
    var cab = cabecalho_(x);
    ['LOCAL', 'COMBINA COM'].forEach(function (nome) {
      var j = cabecalho_(x).indexOf(nome);
      if (j >= 0) x.deleteColumn(j + 1);
    });
    cab = cabecalho_(x);
    if (cab.indexOf('PEÇAS') < 0) return;           // já migrada: DEFEITO aqui é a previsão
    var jD = cab.indexOf('DEFEITO');
    if (jD >= 0 && x.getLastRow() > 1) {
      var vals = x.getRange(2, 1, x.getLastRow() - 1, cab.length).getValues();
      var mapa = lerObs_(ss);
      vals.forEach(function (l, i) {
        var d = String(l[jD] || '').trim();
        if (!d) return;
        var it = { _linha: i + 2 };
        cab.forEach(function (h, j) { it[h] = l[j]; });
        adicionarObs_(ss, it, [{ data: it['DATA ENTRADA'] || new Date(), tecnico: it['TÉCNICO'] || '', texto: 'Defeito: ' + d, origem: 'DEFEITO' }], mapa);
      });
    }
    if (jD >= 0) x.deleteColumn(jD + 1);
    x.getRange(1, cabecalho_(x).indexOf('PEÇAS') + 1).setValue(COL_DEF);
  });
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
  Object.keys(mapa).forEach(function (k) { mapa[k] = ordenarObs(mapa[k]); });
  return mapa;
}

function obsDoItem_(mapa, it) { return mapa[normalizarSerial(chaveObs_(it))] || []; }

/** Observações em ordem de dia; no mesmo dia, o defeito de entrada vem antes. Ordem da aba no resto. Pura. */
function ordenarObs(lista) {
  var dia = function (d) {
    if (d instanceof Date) return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    var m = String(d || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    return m ? +m[3] * 10000 + +m[2] * 100 + +m[1] : 0;
  };
  return lista.map(function (o, i) { return { o: o, i: i, d: dia(o.data), p: o.origem === 'DEFEITO' ? 0 : 1 }; })
    .sort(function (a, b) { return (a.d && b.d ? a.d - b.d : 0) || a.p - b.p || a.i - b.i; })
    .map(function (x) { return x.o; });
}

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
  var nomes = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  if (nomes.indexOf('sincronizarQualidade') < 0) ScriptApp.newTrigger('sincronizarQualidade').timeBased().everyHours(SINCRONIZAR_HORAS).create();
  // Quando o João mexe na aba PEÇAS, o app pesquisa os modelos compatíveis e acha os aparelhos que precisam.
  if (nomes.indexOf('aoEditar') < 0) ScriptApp.newTrigger('aoEditar').forSpreadsheet(PLANILHAS.MANUTENCAO).onEdit().create();
}

/** Gatilho de edição da planilha (roda com a conta do dono). */
function aoEditar(e) {
  var nome = e && e.range ? e.range.getSheet().getName() : '';
  if ([ABA_PECAS, ABA_COMPAT, 'LISTAS'].indexOf(nome) < 0) return;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    var ss = planilha_();
    pesquisarPecas_(ss, 3);
    pesquisarIrmaos_(ss, 2);
    recalcular_(ss);
  } finally { lock.releaseLock(); }
}

/**
 * Pesquisa na internet (IA do SCAN com busca do Google) os modelos de notebook em que cada peça comprada serve.
 * Só para peças com código e sem pesquisa ainda; no máximo `limite` por vez (gasta pouco).
 */
function pesquisarPecas_(ss, limite) {
  var k = iaChave_();
  var pc = ss.getSheetByName(ABA_PECAS);
  if (!k || !pc) return 0;
  var col = CAB_PECAS.indexOf('MODELOS COMPATÍVEIS (PESQUISA)') + 1;
  var colCod = CAB_PECAS.indexOf('CÓDIGO DA PEÇA') + 1;
  var colMed = CAB_PECAS.indexOf('MEDIDA / CONECTOR') + 1;
  var props = PropertiesService.getScriptProperties();
  var est = lerEstoque_(ss);
  var n = pc.getLastRow() - 1;
  var notasMod = n > 0 ? pc.getRange(2, col, n, 1).getNotes() : [];
  var notasCod = n > 0 ? pc.getRange(2, colCod, n, 1).getNotes() : [];
  var hoje = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy');
  var feitas = 0;
  est.forEach(function (e) {
    if (feitas >= limite || e.usada) return;
    // Sem código: a IA acha o código (part number) pelo nome da peça, pelo link da compra e pelos modelos.
    if (!e.codigo && e.peca) {
      var chave = 'cod:' + Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, e.peca + '|' + e.link + '|' + e.serve));
      if (props.getProperty(chave)) return;
      var cod = pesquisarCodigo_(k, e);
      feitas++;
      if (cod === null) return;
      props.setProperty(chave, '1');
      if (!cod) return;
      pc.getRange(e.linha, colCod).setValue(cod)
        .setNote('Código achado pela IA em ' + hoje + '. Confira na etiqueta da peça; se estiver errado, é só corrigir.');
      notasCod[e.linha - 2] = ['Código achado pela IA'];
      e.codigo = cod;
      if (feitas >= limite) return;
    }
    if (!e.codigo) return;
    // Pesquisa de novo quando: nunca pesquisou, o código mudou (o João corrigiu) ou "NÃO ACHEI" já tem 15 dias.
    var nota = String((notasMod[e.linha - 2] || [''])[0]);
    if (!precisaPesquisar(e.pesquisa, nota, e.codigo, new Date())) return;
    var r = pesquisarModelos_(k, e.peca, e.codigo);
    if (r === null) return;
    feitas++;
    var conf = conferirPesquisa(r.modelos, e.serve);
    var linhaNota = 'Pesquisado com o código ' + e.codigo + ' em ' + hoje + '.' + (conf.aviso ? ' ' + conf.aviso : '');
    pc.getRange(e.linha, col).setValue(conf.valor).setNote(linhaNota);
    if (!e.medida && r.medida) pc.getRange(e.linha, colMed).setValue(r.medida).setNote('Medida achada pela IA em ' + hoje + '. Confira na peça.');
    // Código que a própria IA achou e nenhuma página confirma: avisa na célula do código.
    if (!r.modelos && /achado pela IA/.test(String((notasCod[e.linha - 2] || [''])[0])))
      pc.getRange(e.linha, colCod).setNote('Código achado pela IA, mas NÃO CONFIRMADO (nenhuma página achada com ele). Confira na etiqueta da peça.');
  });
  return feitas;
}

/** Precisa pesquisar os modelos de novo? Nunca pesquisou, o código mudou desde a pesquisa, ou NÃO ACHEI com 15 dias ou mais. Pura. */
function precisaPesquisar(pesquisa, nota, codigo, agora) {
  if (!pesquisa) return true;
  var m = String(nota || '').match(/c[oó]digo (\S+) em (\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return true;
  if (normalizarSerial(m[1]) !== normalizarSerial(codigo)) return true;
  var dias = (agora - new Date(+m[4], +m[3] - 1, +m[2])) / 86400000;
  return /NAO ACHEI/.test(semAcento_(pesquisa)) && dias >= 15;
}

/** Confere a pesquisa com o que o João já sabe (SERVE NOS MODELOS). Não bate → marca CONFERIR. Pura. */
function conferirPesquisa(modelos, serve) {
  if (!modelos) return { valor: 'NÃO ACHEI', aviso: '' };
  if (codigosModelo_(serve).length && !modelosCombinam(serve, modelos))
    return { valor: 'CONFERIR: ' + modelos, aviso: 'A pesquisa não citou os modelos de SERVE NOS MODELOS; confira antes de confiar.' };
  return { valor: modelos, aviso: '' };
}

/** Código (part number) da peça comprada; '' se não achou, null se a IA não respondeu. Lê a página do link quando tem. */
function pesquisarCodigo_(k, e) {
  var pergunta = 'Peça de notebook comprada: "' + e.peca + '"' + (e.serve ? ', para o(s) modelo(s) ' + e.serve : '') +
    (e.link ? '. Link da compra: ' + e.link + ' (abra a página e leia o anúncio)' : '') +
    '. Ache o código do fabricante dessa peça (part number, ex.: NV156FHM-N48, 0B200-03940000, L15M3PB0). ' +
    'Responda só com o código mais provável, sem texto extra. Se não achar nada confiável, responda NADA.';
  var t = e.link ? pesquisarIA_(k, pergunta, [{ url_context: {} }, { google_search: {} }]) : null;
  if (t === null) t = pesquisarIA_(k, pergunta);
  return t === null ? null : codigoPeca(t);
}

/** Primeiro código de peça num texto (letras e números, 5+ caracteres, com algum número). Pura. */
function codigoPeca(texto) {
  var m = String(texto == null ? '' : texto).toUpperCase().match(/[A-Z0-9][A-Z0-9.\-\/]{3,}[A-Z0-9]/g) || [];
  return m.filter(function (x) { return /\d/.test(x) && x.replace(/[^A-Z0-9]/g, '').length >= 5; })[0] || '';
}

/** Modelos em que a peça serve e a medida/conector dela. null se a IA não respondeu. */
function pesquisarModelos_(k, peca, codigo) {
  var t = pesquisarIA_(k, 'Peça de notebook: "' + peca + '", código/part number "' + codigo + '". Pesquise e responda em duas linhas:\n' +
    'MODELOS: códigos de modelo de notebook em que essa peça serve (ex.: E1504FA, X1504ZA, 15IRH8), separados por vírgula\n' +
    'MEDIDA: só o que se aplica à peça: tamanho em polegadas, número de pinos do conector, DDR3/DDR4/DDR5, NVMe/M.2 SATA/SATA 2.5\n' +
    'Sem texto extra. Se não achar nada confiável, responda NADA.');
  if (t === null) return null;
  return respostaModelos(t);
}

/** Lê a resposta "MODELOS: ... / MEDIDA: ..." da IA. Pura. */
function respostaModelos(t) {
  t = String(t || '');
  var lm = t.match(/MODELOS?\s*:\s*([^\n]*)/i), lmed = t.match(/MEDIDAS?\s*:\s*([^\n]*)/i);
  var modelos = codigosModelo_(lm ? lm[1] : t.replace(/MEDIDAS?\s*:[^\n]*/i, '')).filter(function (x, n, a) { return a.indexOf(x) === n; }).slice(0, 30).join(', ');
  return { modelos: modelos, medida: lmed ? textoMedidas(medidas(lmed[1])) : '' };
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

/** Aba de dados GARANTIA ou SUCATA (se ainda for a lista automática antiga, limpa e põe o cabeçalho). */
function abaDados_(ss, nome) {
  var g = ss.getSheetByName(nome);
  if (!g) g = ss.insertSheet(nome, 2);
  if (g.getRange(2, 1).getFormula()) {
    g.clearContents();
    var cab = cabecalho_(abaPrincipal_(ss));
    g.getRange(1, 1, 1, cab.length).setValues([cab]);
  }
  g.setFrozenRows(1);
  return g;
}

function abaDe_(ss, nome) { return nome === ABA_GARANTIA || nome === ABA_SUCATA ? abaDados_(ss, nome) : abaPrincipal_(ss); }

function abasDados_(ss) { return ABAS_DADOS.map(function (n) { return abaDe_(ss, n); }); }

/** Aparelhos das três abas (APARELHOS, GARANTIA e SUCATA), cada um com _aba e _linha. */
function lerTudo_(ss) {
  var cab = null, itens = [];
  abasDados_(ss).forEach(function (a) {
    var d = lerItens_(a);
    if (!cab) cab = d.cab;
    itens = itens.concat(d.itens);
  });
  return { cab: cab, itens: itens };
}

/** Cada aparelho vai para a aba certa (sucata, garantia ou APARELHOS) e volta se mudar. */
function distribuir_(ss) {
  var abas = {};
  abasDados_(ss).forEach(function (a) { abas[a.getName()] = a; });
  ABAS_DADOS.forEach(function (nome) {
    var de = abas[nome];
    var d = lerItens_(de);
    var mover = d.itens.filter(function (it) { return abaDoItem(it) !== nome; });
    if (!mover.length) return;
    var cN = d.cab.indexOf(NOTAS);
    mover.forEach(function (it) {
      var para = abas[abaDoItem(it)];
      var vals = de.getRange(it._linha, 1, 1, d.cab.length).getValues();
      var nota = cN >= 0 ? de.getRange(it._linha, cN + 1).getNote() : '';
      var r = para.getLastRow() + 1;
      para.getRange(r, 1, 1, d.cab.length).setValues(vals);
      if (nota) para.getRange(r, cN + 1).setNote(nota);
      historico_(ss, 'AUTOMÁTICO', it.SERIAL, 'ABA', nome, para.getName());
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
  var extras = palavrasExtras(listas_(ss)['PALAVRAS DAS PEÇAS']);
  var props = PropertiesService.getScriptProperties().getProperties();
  var cP = d.cab.indexOf(COL_DEF), cN = d.cab.indexOf(NOTAS), cC = d.cab.indexOf('COMBINA COM');
  var abas = {}, notas = {};
  abasDados_(ss).forEach(function (a) {
    abas[a.getName()] = a;
    notas[a.getName()] = cN >= 0 && a.getLastRow() > 1 ? a.getRange(2, cN + 1, a.getLastRow() - 1, 1).getNotes() : [];
  });
  d.itens.forEach(function (it) {
    var aba = abas[it._aba];
    var obs = obsDoItem_(mapa, it);
    if (cP >= 0) {
      var textos = obs.map(function (o) { return o.texto; });
      var ia = props[chavePrevisao_('', textos)];
      var p = previsaoFinal(preverPecas('', textos, extras), ia ? ia.split(',').filter(String) : []).texto;
      if (String(it[COL_DEF] || '') !== p) { it[COL_DEF] = p; aba.getRange(it._linha, cP + 1).setValue(p); }
    }
    if (cN >= 0 && obs.length) {
      var c = celulaNotas(obs), n = notaCompleta(obs);
      if (String(it[NOTAS] || '') !== c) aba.getRange(it._linha, cN + 1).setValue(c);
      if ((notas[it._aba][it._linha - 2] || [''])[0] !== n) aba.getRange(it._linha, cN + 1).setNote(n);
    }
  });
  var est = lerEstoque_(ss), compat = lerCompat_(ss);
  escreverCompativeis_(ss, d.itens, est, compat);
  escreverPecas_(ss, d, est, compat);
  try { registrarArrumados_(d.itens, mapa, ss); } catch (x) { console.log('manutenções do mês: ' + x); }
}

// ===== Planilha de manutenções do mês (MANUTENÇÕES INFORMATICA GERAL) =====

/** Nome da aba do mês, ex.: "NOVEMBRO 2026". Pura. */
function abaDoMes(data) { return MESES[data.getMonth()] + ' ' + data.getFullYear(); }

/** A aba de mês mais recente entre os nomes (ex.: "OUTUBRO 2026"); '' se não houver. Pura. */
function ultimaAbaDeMes(nomes) {
  var melhor = '', nota = -1;
  (nomes || []).forEach(function (n) {
    var m = semAcento_(n).trim().match(/^([A-Z]+) (\d{4})$/);
    var i = m ? MESES.map(semAcento_).indexOf(m[1]) : -1;
    if (i >= 0 && +m[2] * 12 + i > nota) { nota = +m[2] * 12 + i; melhor = n; }
  });
  return melhor;
}

var NOME_TROCA = { 'WI-FI': 'PLACA DE REDE', 'MEMÓRIA': 'MEMÓRIA RAM', 'ÁUDIO': 'ALTO-FALANTE', 'CARREGADOR': 'CONECTOR DE CARGA' };
var NOME_REPARO = { 'TELA': 'VÍDEO', 'WI-FI': 'REDE', 'CHIP DA BIOS': 'INICIALIZAÇÃO', 'SSD': 'ARMAZENAMENTO', 'CARREGADOR': 'CARGA',
  'COOLER': 'REFRIGERAÇÃO', 'FLAT': 'VÍDEO', 'ENTRADA P2': 'ÁUDIO' };

function listaPt_(xs) {
  xs = xs.filter(function (x, n, a) { return x && a.indexOf(x) === n; });
  return xs.length < 2 ? (xs[0] || '') : xs.slice(0, -1).join(', ') + ' E ' + xs[xs.length - 1];
}

/**
 * Descrição no jeito da planilha de manutenções: "TROCA DE WEBCAM", "REPARO NA INTERFACE DE VÍDEO, REDE E ÁUDIO",
 * "TROCA DE SSD E REPARO NA INTERFACE DE ÁUDIO". Vem da coluna PEÇAS e das observações. Pura.
 */
function descricaoReparo(pecas, textos, defeito) {
  var v = String(pecas == null ? '' : pecas);
  var troc = ((v.match(/TROCADO:\s*([^|]*)/) || [])[1] || '').split(',').map(function (x) { return x.trim(); }).filter(String);
  var def = pecasDaColuna(v).filter(function (p) { return troc.indexOf(p) < 0 && p !== 'PLACA-MÃE' && p !== 'CARCAÇA'; });
  var tudo = semAcento_([defeito].concat(textos || []).join(' '));
  var partes = [];
  if (troc.length) partes.push('TROCA DE ' + listaPt_(troc.map(function (p) { return NOME_TROCA[p] || p; })));
  if (def.length) partes.push('REPARO NA INTERFACE DE ' + listaPt_(def.map(function (p) { return NOME_REPARO[p] || p; })));
  if (/FORMATA|FORMATEI|REINSTAL\w* (O )?(SISTEMA|WINDOWS)/.test(tudo)) partes.push('FORMATAÇÃO DO SISTEMA');
  if (/PLACA-MAE|PLACA MAE/.test(semAcento_(v)) && !partes.length) partes.push('REPARO NA PLACA-MÃE');
  if (partes.length) return partes.length === 2 ? partes.join(' E ') : partes.join(', ');
  var ult = (textos || []).filter(function (t) { return String(t || '').trim() && !/^Finalizado \(aprovado/.test(t); }).pop();
  return String(ult ? resumoObs(ult, 90) : (defeito || 'REPARO')).toUpperCase();
}

/** Linha da planilha de manutenções na ordem do cabeçalho daquela aba (nomes de coluna variam de mês para mês). Pura. */
function linhaManutencao(cab, it, descricao, data) {
  return cab.map(function (h) {
    var k = semAcento_(h).trim();
    if (/^TECNICO/.test(k)) return String(it['TÉCNICO'] || '').toUpperCase();
    if (k === 'MARCA') return String(it.MARCA || '').toUpperCase();
    if (k === 'MODELO') return String(it.MODELO || '').toUpperCase();
    if (/^(SERIAL|SERIE)$/.test(k)) return String(it.SERIAL || '').toUpperCase();
    if (k === 'DATA') return data;
    if (/^(DESCRICAO|DEFEITO)$/.test(k)) return descricao;
    return '';
  });
}

/**
 * Cada aparelho que passou para REPARADO ou FINALIZADO entra uma vez na aba do mês da planilha de manutenções.
 * Se voltar para uma situação em aberto, pode entrar de novo quando for arrumado outra vez.
 * Não mexe em nada que já está lá: só acrescenta linhas, e cria a aba do mês (cópia do cabeçalho do mês anterior) quando falta.
 */
function registrarArrumados_(itens, mapa, ssManut) {
  var props = PropertiesService.getScriptProperties();
  var marcas = props.getProperties();
  var hoje = new Date();
  var mesAtual = Utilities.formatDate(hoje, 'America/Sao_Paulo', 'MM/yyyy');
  var novos = [], sair = [];
  itens.forEach(function (it) {
    var sn = normalizarSerial(it.SERIAL);
    if (!sn) return;
    var chave = 'arr:' + sn;
    var feito = ARRUMADO.indexOf(semAcento_(it['SITUAÇÃO']).trim()) >= 0;
    if (!feito) { if (marcas[chave]) props.deleteProperty(chave); return; }
    if (marcas[chave]) { sair.push(it); return; }   // já está na planilha de produção: sai da planilha de defeitos
    // Só o que foi arrumado neste mês (o que é mais antigo já devia estar na planilha).
    if (String(it['ÚLTIMA ATUALIZAÇÃO'] || '').slice(3) !== mesAtual) { props.setProperty(chave, 'antigo'); sair.push(it); return; }
    novos.push(it);
  });
  if (!novos.length) { if (ssManut) tirarReparados_(ssManut, sair); return 0; }
  var ss = SpreadsheetApp.openById(PLANILHAS.ARRUMADOS);
  var nome = abaDoMes(hoje);
  var aba = ss.getSheetByName(nome) || criarAbaDoMes_(ss, nome);
  var cab = cabecalho_(aba);
  var cS = cab.map(semAcento_).findIndex(function (h) { return /^(SERIAL|SERIE)$/.test(h.trim()); });
  var ja = {};
  if (cS >= 0 && aba.getLastRow() > 1) aba.getRange(2, cS + 1, aba.getLastRow() - 1, 1).getValues().forEach(function (l) { ja[normalizarSerial(l[0])] = true; });
  var dataHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  var feitos = 0;
  novos.forEach(function (it) {
    var sn = normalizarSerial(it.SERIAL);
    if (!ja[sn]) {
      var textos = obsDoItem_(mapa, it).map(function (o) { return o.texto; });
      var escrito = marcas['prod:' + sn];
      acrescentarLinha_(ss, aba, linhaManutencao(cab, it, escrito || descricaoReparo(it[COL_DEF], textos, ''), dataHoje));
      ja[sn] = true;
      feitos++;
    }
    props.setProperty('arr:' + sn, Utilities.formatDate(hoje, 'America/Sao_Paulo', 'dd/MM/yyyy'));
    props.deleteProperty('prod:' + sn);
    sair.push(it);
  });
  if (ssManut) tirarReparados_(ssManut, sair);
  return feitos;
}

/**
 * Regra do João (09/11/2026): aparelho REPARADO vai para a planilha de produção e NÃO fica na planilha de defeitos.
 * Só sai depois de gravado lá. A linha inteira fica no HISTÓRICO (para recuperar) e as observações continuam na aba OBSERVAÇÕES.
 */
function tirarReparados_(ss, lista) {
  var porAba = {};
  lista.forEach(function (it) { if (it._aba && it._linha) (porAba[it._aba] = porAba[it._aba] || []).push(it); });
  Object.keys(porAba).forEach(function (nome) {
    var aba = ss.getSheetByName(nome);
    if (!aba) return;
    porAba[nome].sort(function (a, b) { return b._linha - a._linha; }).forEach(function (it) {
      var sn = normalizarSerial(aba.getRange(it._linha, cabecalho_(aba).indexOf('SERIAL') + 1).getValue());
      if (sn !== normalizarSerial(it.SERIAL)) return;   // a planilha mudou no meio: não apaga a linha errada
      var copia = {};
      Object.keys(it).forEach(function (k) { if (k.charAt(0) !== '_' && it[k] !== '' && it[k] != null) copia[k] = it[k]; });
      historico_(ss, 'AUTOMÁTICO', it.SERIAL, 'SAIU (REPARADO, FOI PARA A PLANILHA DE PRODUÇÃO)', JSON.stringify(copia), nome);
      aba.deleteRow(it._linha);
    });
  });
}

/** Cria a aba do mês copiando a aba do mês mais recente e limpando só os dados (cabeçalho, tabela e formatação ficam). */
function criarAbaDoMes_(ss, nome) {
  var base = ss.getSheetByName(ultimaAbaDeMes(ss.getSheets().map(function (x) { return x.getName(); })));
  var nova;
  if (base) {
    nova = base.copyTo(ss).setName(nome);
    if (nova.getMaxRows() > 1) nova.getRange(2, 1, nova.getMaxRows() - 1, nova.getMaxColumns()).clearContent();
  } else {
    nova = ss.insertSheet(nome);
    nova.getRange(1, 1, 1, 9).setValues([['TÉCNICO', 'MARCA', 'MODELO', 'SERIAL', 'DATA', 'DESCRIÇÃO', 'ESTADO', 'ENTREGUE', 'TIPO']]).setFontWeight('bold');
  }
  ss.setActiveSheet(nova);
  ss.moveActiveSheet(1);
  return nova;
}

/** Escreve a linha logo depois da última preenchida. Se passar do fim da tabela do Google, usa a API para a tabela crescer junto. */
function acrescentarLinha_(ss, aba, valores) {
  var r = Math.max(aba.getLastRow(), 1) + 1;
  var tabela = null;
  try {
    var info = Sheets.Spreadsheets.get(ss.getId(), { fields: 'sheets(properties(sheetId),tables(tableId,range))' });
    (info.sheets || []).forEach(function (sh) {
      if (sh.properties.sheetId === aba.getSheetId() && sh.tables && sh.tables.length) tabela = sh.tables[0];
    });
  } catch (x) { console.log('tabela: ' + x); }
  if (tabela && r > tabela.range.endRowIndex) {
    try {
      Sheets.Spreadsheets.batchUpdate({ requests: [{ appendCells: { tableId: tabela.tableId, fields: 'userEnteredValue,userEnteredFormat.numberFormat',
        rows: [{ values: valores.map(function (v) {
          if (v instanceof Date) return { userEnteredValue: { numberValue: (v.getTime() - v.getTimezoneOffset() * 60000) / 86400000 + 25569 },
            userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'dd/MM/yyyy' } } };
          return { userEnteredValue: { stringValue: String(v) } };
        }) }] } }] }, ss.getId());
      return;
    } catch (x) { console.log('appendCells: ' + x); }
  }
  aba.getRange(r, 1, 1, valores.length).setValues([valores]);
  var cD = valores.findIndex(function (v) { return v instanceof Date; });
  if (cD >= 0) aba.getRange(r, cD + 1).setNumberFormat('dd/MM/yyyy');
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
    if (ENCERRADAS.indexOf(sit) < 0 || sit === 'SUCATA') return true;   // sucata aparece sempre (aba Sucata do app)
    var p = String(it['ÚLTIMA ATUALIZAÇÃO'] || '').split('/');
    return p.length === 3 && new Date(+p[2], +p[1] - 1, +p[0]) >= limite;
  });
  var mapa = lerObs_(ss);
  itens.forEach(function (it) {
    var o = obsDoItem_(mapa, it);
    it._obs = obsParaTela_(o);
    it._sugestao = descricaoReparo(it[COL_DEF], o.map(function (x) { return x.texto; }), '');
  });
  var est = lerEstoque_(ss), compat = lerCompat_(ss);
  var montagens = planosDeMontagem(d.itens, est, compat);
  // COMBINA COM não fica mais na planilha: calculado só para o app.
  var comb = combinacoes(d.itens), combDe = {};
  d.itens.forEach(function (it, i) { combDe[it._aba + ':' + it._linha] = comb[i]; });
  itens.forEach(function (it) { it['COMBINA COM'] = combDe[it._aba + ':' + it._linha] || ''; });
  itens.forEach(function (it) {
    it._compradas = est.filter(function (e) { return !e.usada && e.tipo && pecasDaColuna(it[COL_DEF]).indexOf(e.tipo) >= 0 && compradaServe(e, it, compat); })
      .map(function (e) { return e.peca + (e.codigo ? ' · ' + e.codigo : ''); });
  });
  montagens.forEach(function (m, g) { m.cor = CORES_GRUPOS[g % CORES_GRUPOS.length]; });
  return { listas: listas_(ss), itens: itens, colunas: d.cab, planilha: ss.getUrl(), ia: !!iaChave_(), montagens: montagens };
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
var IA_ETIQUETA = ['gemini-3-flash-preview', 'gemini-flash-latest', 'gemini-3.1-flash-lite-preview', 'gemini-flash-lite-latest'];

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
  jaLido = jaLido || {};
  var codigos = [jaLido.serial].concat(jaLido.outros || []).filter(String);
  var dica = codigos.length || jaLido.ean ? ' Códigos de barras lidos na foto (o leitor pode ter pego o código errado como serial): ' +
    codigos.concat(jaLido.ean ? ['EAN ' + jaLido.ean] : []).join(', ') + '.' : '';
  var texto = 'Foto da etiqueta de um notebook, console ou acessório em manutenção. Leia:\n' +
    '- serial: o número de série impresso ao lado de S/N, SN, Serial No. ou Service Tag (Dell, 7 caracteres). ' +
    'NÃO é o P/N, PN, Part No., SKU, SNID (Acer), UPC, EAN, MAC, IMEI nem o código do modelo. Asus costuma ter 15 caracteres (ex. W6N0B605436627B), ' +
    'Acer 22 (ex. NXKMDAL0014159468C9501), Lenovo 8 (ex. PF4ABC12), Positivo 9 (ex. 4AK45WJ6S).\n' +
    '- ean: código de barras de 8 a 14 dígitos (EAN/UPC), se houver.\n' +
    '- marca.\n' +
    '- modelo: o código do modelo (Model, Modelo, MOD), ex. E1504FA, A315-510P, 15IRH10, C4128E. Não use o P/N.\n' +
    '- descricao: curta (processador, memória, armazenamento, se aparecerem).\n' +
    'Copie letra por letra exatamente o que está impresso, sem trocar O por 0 nem I por 1 por conta própria; não invente. Deixe vazio o que não aparece.' + dica;
  var esquema = { type: 'OBJECT', properties: { serial: { type: 'STRING' }, ean: { type: 'STRING' }, marca: { type: 'STRING' }, modelo: { type: 'STRING' }, descricao: { type: 'STRING' } } };
  var partes = [{ text: texto }, { inline_data: { mime_type: 'image/jpeg', data: String(base64 || '').replace(/^data:[^,]*,/, '') } }];
  var erro = '';
  // Etiqueta pede leitura caprichada: começa pelo modelo mais forte; os "lite" ficam de reserva.
  var ordem = IA_ETIQUETA;
  for (var i = 0; i < ordem.length; i++) {
    var modos = ['minimal', ''];
    for (var j = 0; j < modos.length; j++) {
      var cfg = { temperature: 0, responseMimeType: 'application/json', responseSchema: esquema };
      if (modos[j]) cfg.thinkingConfig = { thinkingLevel: modos[j] };
      var r;
      try {
        r = UrlFetchApp.fetch(IA_URL + ordem[i] + ':generateContent?key=' + encodeURIComponent(k), {
          method: 'post', contentType: 'application/json', muteHttpExceptions: true,
          payload: JSON.stringify({ contents: [{ role: 'user', parts: partes }], generationConfig: cfg })
        });
      } catch (e) { erro = String(e.message || e); break; }
      var cod = r.getResponseCode();
      if (cod === 400 && modos[j]) continue;          // modelo não aceita thinkingLevel: tenta sem
      if (cod !== 200) { erro = ordem[i] + ' ' + cod; break; }   // ocupado/limite/sem modelo: próximo
      try {
        var t = JSON.parse(r.getContentText()).candidates[0].content.parts[0].text;
        var o = JSON.parse(t);
        return {
          SERIAL: String(o.serial || '').toUpperCase().replace(/\s+/g, ''),
          EAN: String(o.ean || '').replace(/\D/g, ''),
          MARCA: String(o.marca || '').toUpperCase(),
          MODELO: String(o.modelo || '').toUpperCase(),
          'DESCRIÇÃO': String(o.descricao || '').toUpperCase(),
          modelo_ia: ordem[i]
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
    // O que foi feito, escrito ao marcar REPARADO: vira a DESCRIÇÃO na planilha de produção.
    var sn0 = normalizarSerial(item.SERIAL || item._serial);
    if (item._producao && sn0) PropertiesService.getScriptProperties().setProperty('prod:' + sn0, String(item._producao).trim().toUpperCase());
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
  // Chamadas do site do app (endereço próprio no GitHub Pages): mesmas funções da tela, sem login.
  if (corpo.api) {
    var API = { apiInicio: apiInicio, apiBuscar: apiBuscar, apiPorEan: apiPorEan, apiIaLigada: apiIaLigada,
      apiLerComIA: apiLerComIA, apiSalvar: apiSalvar, apiSincronizar: apiSincronizar };
    if (!API[corpo.api]) return json_({ ok: false, erro: 'função desconhecida' });
    try {
      prepararPlanilha_();
      return json_({ ok: true, r: API[corpo.api].apply(null, corpo.args || []) });
    } catch (x) { return json_({ ok: false, erro: String(x.message || x) }); }
  }
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
  if (n.defeito) notas.unshift({ data: new Date(), tecnico: tec, texto: 'Defeito: ' + n.defeito, origem: 'DEFEITO' });
  var ja = apiBuscar(n.serial);
  if (!ja) {
    var novo = { SERIAL: n.serial.toUpperCase(), MODELO: n.modelo || '', 'TÉCNICO': tec,
      'SITUAÇÃO': (n.situacao || 'EM REPARO').toUpperCase(), _notas: notas };
    var r = apiSalvar(novo, tec + ' (notas)');
    return { ok: r.ok, serial: n.serial, criado: true };
  }
  var mud = { _linha: ja._linha, _aba: ja._aba, _serial: ja.SERIAL, _notas: notas };
  if (n.situacao && ENCERRADAS.indexOf(String(ja['SITUAÇÃO']).toUpperCase()) < 0) mud['SITUAÇÃO'] = n.situacao.toUpperCase();
  if (n.modelo && !String(ja.MODELO || '').trim()) mud.MODELO = n.modelo;
  var r2 = apiSalvar(mud, tec + ' (notas)');
  return { ok: r2.ok, serial: n.serial, nada: !!r2.nada };
}

// ===== Conferência com o controle de qualidade =====

/** Gatilho a cada SINCRONIZAR_HORAS: o que já passou no controle de qualidade vira FINALIZADO. */
function sincronizarQualidade() {
  prepararPlanilha_();
  try { pesquisarPecas_(planilha_(), 5); pesquisarIrmaos_(planilha_(), 6); preverComIA_(planilha_(), 8); } catch (x) { console.log('pesquisa de peças: ' + x); }
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
  module.exports = { ordenarObs: ordenarObs, abaDoMes: abaDoMes, ultimaAbaDeMes: ultimaAbaDeMes, descricaoReparo: descricaoReparo, linhaManutencao: linhaManutencao, medidas: medidas, textoMedidas: textoMedidas, medidasBatem: medidasBatem, compradaServe: compradaServe, vocabulario: vocabulario, palavrasExtras: palavrasExtras, previsaoFinal: previsaoFinal, precisaPesquisar: precisaPesquisar, conferirPesquisa: conferirPesquisa, respostaModelos: respostaModelos, respostaPrevisao: respostaPrevisao, codigoPeca: codigoPeca, pecaServe: pecaServe, pecaServeEstoque: pecaServeEstoque, compatDe: compatDe, tipoDaPeca: tipoDaPeca, modelosCombinam: modelosCombinam, estoqueDe: estoqueDe, aparelhosParaPecas: aparelhosParaPecas, coresDosGrupos: coresDosGrupos, abaDoItem: abaDoItem, linhasCompativeis: linhasCompativeis, ehGarantia: ehGarantia, planosDeMontagem: planosDeMontagem, lerNota: lerNota, preverPecas: preverPecas, pecasDaColuna: pecasDaColuna, resumoObs: resumoObs, celulaNotas: celulaNotas, notaCompleta: notaCompleta, notasAntigas: notasAntigas, combinacoes: combinacoes, normalizarSerial: normalizarSerial, seriaisFinalizados: seriaisFinalizados, paraFinalizar: paraFinalizar };
}
