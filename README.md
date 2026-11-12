# Manutenção de notebooks

App da Web (Google Apps Script) para os técnicos acompanharem os aparelhos em manutenção, em cima da planilha **MANUTENÇÃO NOTEBOOKS (NOVA)**.

- Só o dono edita a planilha. Os técnicos usam o app (que grava em nome do dono) e podem só **ver** a planilha.
- Tudo fica na aba **APARELHOS**. Produtos em garantia (coluna GARANTIA = GARANTIA, ou situação de garantia) ficam na aba GARANTIA e os de sucata na aba SUCATA, com as mesmas colunas; o resto fica em APARELHOS. A aba PEÇAS é o estoque das peças compradas: o João preenche PEÇA, VALOR, LINK e SITUAÇÃO (o CÓDIGO é opcional: sem ele, a IA acha o part number pelo nome e pela página do link, uma vez por peça, e deixa uma nota na célula para conferir); o app pesquisa os modelos compatíveis pelo código (IA com busca do Google, só uma vez por peça) e lista os aparelhos que precisam; peça em estoque também entra nos grupos de montagem, e só a aba COMPATÍVEIS tem cores (uma por grupo), e a aba COMPATÍVEIS mostra, em cores, os grupos de notebooks do mesmo modelo que se completam (vários doadores podem montar um), e o RESUMO conta por situação.
- **Peças com defeito**: o app tira da descrição do teste (sem IA). Ex.: "tela não dá imagem e webcam não funciona" → TELA, WEBCAM. Dá para corrigir à mão.
- **Combina com**: aparelhos do mesmo modelo que se completam (um tem boa a peça que falta no outro). Aparece na coluna COMBINA COM e no filtro "⇄ Combinam" do app.
- **Controle de qualidade**: a cada 2 horas o app confere a planilha CONTROLE DE QUALIDADE INFORMATICA EMANX (só leitura). Serial aprovado lá vira **FINALIZADO** aqui, mesmo se o técnico esqueceu.
- **Anotações do João Pedro**: o Claude do outro projeto escreve em `notas/<SERIAL>.md`; a cada push o GitHub manda para o app. Só esses notebooks passam por IA.
- Toda mudança feita pelo app fica na aba **HISTÓRICO** (quem, quando, antes e depois).

Instalação: [docs/INSTALACAO.md](docs/INSTALACAO.md). Testes: `npm test`.

| Arquivo | Para que serve |
| --- | --- |
| `src/Codigo.gs` | IDs das planilhas (no topo), leitura e gravação, peças, combinações, controle de qualidade, anotações |
| `src/Index.html` | Tela do app |
| `scripts/enviar-notas.js` | Manda `notas/` para o app (usado pelo GitHub) |

## 1.20.1: correções da vistoria

- Nome novo de técnico entra depois da última célula preenchida da coluna LISTAS › TÉCNICO (antes, com uma célula vazia no meio, sobrescrevia um nome).
- Aparelho REPARADO com ÚLTIMA ATUALIZAÇÃO de outro mês só sai das abas de defeitos se o serial já estiver numa aba de mês da planilha de produção.
- Anotações do outro projeto chegam de qualquer branch (busca de hora em hora).

## 1.20.0: a previsão aprende, próximo teste e compatibilidade melhor (novembro/2026)

**A previsão aprende com os consertos**
- A IA recebe os consertos que a oficina já fez no mesmo modelo, contados pela planilha de produção (últimas 6 abas de mês, só leitura): `consertosDoModelo`.
- Recebe também as lições dos aparelhos que já saíram consertados: o que os técnicos viram, o que o app previa e o que resolveu. Quando a previsão foi diferente do que resolveu, vai marcado como ERROU (`licaoDoConserto`, `resolvidos_`, HISTÓRICO).

**Próximo teste (só no app, a planilha continua limpa)**
- A IA sugere o teste que tira a dúvida que resta. Sem IA, vale o teste padrão da peça em dúvida (`TESTES`, `testeSugerido`).
- Se outro aparelho do mesmo modelo tem a peça boa, o app diz qual usar no teste (`doadorDeTeste`).

**Compatibilidade (aba COMPATÍVEIS e "para montar" no app)**
- Quem precisa de peça da placa (placa-mãe, chip da BIOS, USB, HDMI, P2) não entra como "montar": vira o melhor doador das outras peças.
- Peça só SUSPEITA não é trocada: aparece em "Antes, testar", com o aparelho que tem uma boa.
- Mesmo EAN vale como mesmo modelo, mesmo com o modelo escrito diferente.
- Modelo parecido (C4128E e C4128A-14, A515-45 e A515-45-R043) entra marcado "modelo parecido: conferir o encaixe".
- Quando os doadores não cobrem tudo, o plano aparece mesmo assim como "MONTAR (FALTA PEÇA)", dizendo o que falta comprar.

## 1.19.0: previsão do defeito lida pela IA (novembro/2026)

- A IA lê **todas** as anotações do aparelho, em ordem, junto com tipo, marca e modelo, e diz o estado de cada peça: confirmada, provável, suspeita, trocada ou descartada. Antes ela só entrava quando as regras não achavam nada.
- Acontece logo depois de salvar (`apiPrever`, sem segurar a tela) e a cada 2 horas para o que faltar. Uma leitura por texto: se nada mudou nas anotações, não gasta IA de novo.
- Duas travas: peça citada só como parte do teste não entra mesmo que a IA diga, e peça que as regras deram como CONFIRMADA não some se a IA esquecer dela.
- Medido em 16 casos reais: com raciocínio (`thinkingLevel: high`) a IA erra menos; por isso tenta assim primeiro e, sem resposta, sem raciocínio.
- "Só liga no carregador" aponta para a bateria **e** para o circuito de carga da placa; a IA pode dizer a área da placa: `PLACA-MÃE (PROVÁVEL · CIRCUITO DE CARGA)`.
- Sem IA (sem chave, sem cota ou fora do ar) continuam valendo as regras, que aparecem na hora.
- A IA compara com aparelhos que a oficina já consertou (os do mesmo modelo primeiro).
- Peças novas para controles: ANALÓGICO e GATILHO.
- `scripts/medir-previsao.js` roda a IA nos casos reais de `tests/previsao-casos.json` (só fora da main).

## 1.18.0: revisão pelo jeito de trabalhar (novembro/2026)

Feita olhando os aparelhos, o histórico e a planilha de produção dos primeiros dias de uso.

- **Datas certas:** a planilha estava no fuso de Los Angeles, então a DATA ENTRADA aparecia um dia antes e as horas do HISTÓRICO 4-5 h atrás. A planilha passa para o horário de Brasília e as datas que já existem são regravadas.
- **Aparelho sem serial** (controles, acessórios): pode salvar com o serial vazio. Ele ganha um código interno e, quando REPARADO, vai para a planilha de produção com `N\A`, como já é escrito lá.
- **Vários iguais em seguida:** botão "Igual ao último" repete tipo, marca, modelo e situação. Quem está adicionando continua sendo perguntado.
- **Previsão do defeito:** peça citada só como parte do teste não vira defeito ("conectado ao carregador", "retirei o SSD", "sem memória e bateria", "indicado na tela"); "troquei a tela por uma com pixel morto" marca a tela com defeito; "não estão funcionando", "defeito na placa de rede" e "botão power retirado" são entendidos; sem imagem na tela e no HDMI aponta a placa-mãe.
- **Planilha de produção:** erros de digitação comuns são consertados (INTEFACE, SDD, AUDIO, INICIALIZAÇÂO, BOTAO). Se alguém escrever por cima do título TÉCNICO, o nome continua indo para a primeira coluna.
- **Dados iguais sempre do mesmo jeito:** técnico, marca e tipo em maiúsculas; modelo sem espaço em volta do hífen. Descrição, marca e tipo vazios são copiados de outro aparelho com o mesmo EAN ou modelo.
- **Observação com o nome certo:** ao abrir um aparelho, a tela mostra com que nome a observação vai ficar, com "trocar" (a tela de nomes abria escondida atrás do aparelho).

## 1.17.0: abre na hora, busca mais rápida e pergunta quem está adicionando

- A lista fica guardada no aparelho: ao abrir, a tela aparece na hora com a última lista e se atualiza sozinha em segundo plano.
- Sem lista guardada, a primeira leitura traz só os aparelhos (rápida) e a tela já fica usável; observações, peças e montagens completam logo depois.
- Busca filtra a cada letra, com o serial em qualquer parte (também EAN e NF); mostra 60 por vez. Serial que não está na tela é procurado na planilha toda.
- Aparelho novo sempre pergunta "Quem está adicionando?" no topo, com os nomes da aba LISTAS › TÉCNICO. Os técnicos que aparecem na planilha de produção (últimos 3 meses) e nos aparelhos entram sozinhos nessa coluna.

## 1.16.0: descrição pelo modelo

Quando a DESCRIÇÃO fica vazia (a etiqueta não traz), o app pesquisa o modelo no Google pela IA e escreve uma linha curta: nome comercial, processador, memória, armazenamento, placa de vídeo dedicada e tela. A busca é feita uma vez por modelo e fica guardada; se não achar, o campo fica vazio para digitar.

## 1.15.0: leitura da etiqueta mais rápida e sem confundir P/N

Medido com fotos reais (job de CI "Medir a IA nas fotos de etiqueta", fotos em tests/etiquetas): gemini-flash-lite-latest lê em ~1 s; o 3-flash com thinking travava 60-90 s e o app desistia. Ordem nova começando pelo lite, sem thinkingConfig. Dell/Alienware: serial só o Service Tag de 7 caracteres (P/N 4D25F não entra). EAN só com 8/12/13/14 dígitos. A IA também diz o TIPO.

## 1.13.0: resumo do que foi feito na planilha de produção

Ao marcar REPARADO, o técnico escreve do jeito dele. Na coluna DESCRIÇÃO da planilha MANUTENÇÕES INFORMATICA GERAL vai só o resumo no padrão da planilha (ex.: "REPARO NA INTERFACE DE ÁUDIO", "TROCA DE SSD E FORMATAÇÃO DO SISTEMA", "REPARO NO CIRCUITO DE CARGA"). Regras primeiro; a IA só entra quando as regras não conseguem. O texto inteiro continua nas observações. O app mostra, ao salvar, o que vai para a planilha.

## Observações e previsão das peças (1.3.0)

- Cada observação (app, outro projeto ou controle de qualidade) vira uma linha na aba **OBSERVAÇÕES** com data, técnico e texto completo. Nada é apagado.
- A célula **O QUE FOI FEITO / NOTAS** mostra uma linha curta por observação (`05/11 · TÉCNICO · resumo`), a mais nova em cima; o texto completo fica na nota da célula (passe o mouse) e no app.
- A coluna **PEÇAS** é a previsão automática, sem IA: lê o defeito do teste e depois cada observação em ordem. Uma observação nova pode confirmar, levantar suspeita, dizer que a peça foi trocada ou desmentir ("mostra o logo" descarta a tela, "troquei e não resolveu" descarta a peça). Formato: `CHIP DA BIOS (SUSPEITA) | TROCADO: WEBCAM | DESCARTADO: TELA`.

## Peças universais e modelos que compartilham peça (1.5.0)

- **PEÇAS UNIVERSAIS** (aba LISTAS): peças que servem em qualquer modelo (padrão: MEMÓRIA, SSD, WI-FI). Entram na montagem entre modelos diferentes.
- **COMPATIBILIDADE**: cada linha diz que modelos diferentes usam a mesma peça (ex.: TELA · E1504FA, X1504ZA). O João pode escrever, e o app pesquisa sozinho (IA com busca do Google, uma vez por modelo+peça, a cada 2 horas e quando a planilha é editada).
- A montagem, a aba COMPATÍVEIS, as peças compradas e o app usam essas regras.

### Como a parte de peças pensa (1.8.0)
- **Previsão da peça com defeito:** regras com um vocabulário maior. Na aba LISTAS › PALAVRAS DAS PEÇAS o João ensina palavras novas ("TELA: PAINEL, MONITOR"). Quando as regras não acham nada, a IA lê o defeito uma vez (sem internet), marca a peça como "SUSPEITA · IA" e escreve na LISTAS a palavra que usou, com "(IA)", para as regras aprenderem.
- **Conferência da pesquisa:** cada pesquisa fica anotada na célula com o código e a data. Se o código mudar, pesquisa de novo. "NÃO ACHEI" é pesquisado de novo depois de 15 dias. Se a pesquisa não citar os modelos de SERVE NOS MODELOS, aparece "CONFERIR:". Código achado pela IA sem nenhuma página que o confirme ganha o aviso "NÃO CONFIRMADO".
- **Medida e conector:** coluna MEDIDA / CONECTOR na aba PEÇAS (polegadas, pinos, DDR, tipo de SSD), lida do nome da peça ou pesquisada. A peça só é sugerida quando a medida bate com o que está escrito no aparelho; se o aparelho não diz a medida, ela é sugerida igual.

### Manutenções do mês (1.9.0)
Quando um aparelho passa para REPARADO (FINALIZADO não entra e não aparece mais como opção no app; só vem do controle de qualidade), o app acrescenta uma linha na planilha **MANUTENÇÕES INFORMATICA GERAL**, na aba do mês (ex.: "NOVEMBRO 2026"): técnico, marca, modelo, serial, data e a descrição no jeito da planilha ("TROCA DE WEBCAM", "REPARO NA INTERFACE DE VÍDEO E REDE"), escrita pelo técnico ao marcar Reparado (o app já sugere uma, montada da coluna PEÇAS e das observações). Com Reparado escolhido, a tela mostra só serial, marca, modelo, técnico e o que foi feito. Cada aparelho entra uma vez; o serial que já está na aba não é repetido. O app não mexe no que já existe lá. A única mudança é criar a aba do mês novo, copiando o cabeçalho do mês anterior, quando ela ainda não existe. ESTADO, ENTREGUE e TIPO ficam para a equipe preencher.

### Colunas (1.11.0)
LOCAL e COMBINA COM saíram das abas APARELHOS, GARANTIA e SUCATA. A antiga coluna DEFEITO (texto livre) também saiu: o que estava escrito virou a primeira observação de cada aparelho ("Defeito: ...", com a data de entrada). A coluna PEÇAS passou a se chamar **DEFEITO** e continua com a previsão das peças. Num aparelho novo, o defeito é escrito no campo DEFEITO do app, que vira a primeira observação. Os grupos de quem combina ficam só na aba COMPATÍVEIS e no app.

### Reparados saem da planilha de defeitos (1.12.0)
Regra do João (09/11): depois que um aparelho REPARADO é gravado na planilha de produção (MANUTENÇÕES INFORMATICA GERAL), a linha dele sai das abas APARELHOS, GARANTIA e SUCATA. A linha inteira fica guardada no HISTÓRICO e as observações continuam na aba OBSERVAÇÕES. Se a gravação na planilha de produção falhar, a linha fica até dar certo.
