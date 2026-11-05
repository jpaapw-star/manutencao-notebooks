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

## Observações e previsão das peças (1.3.0)

- Cada observação (app, outro projeto ou controle de qualidade) vira uma linha na aba **OBSERVAÇÕES** com data, técnico e texto completo. Nada é apagado.
- A célula **O QUE FOI FEITO / NOTAS** mostra uma linha curta por observação (`05/11 · TÉCNICO · resumo`), a mais nova em cima; o texto completo fica na nota da célula (passe o mouse) e no app.
- A coluna **PEÇAS** é a previsão automática, sem IA: lê o defeito do teste e depois cada observação em ordem. Uma observação nova pode confirmar, levantar suspeita, dizer que a peça foi trocada ou desmentir ("mostra o logo" descarta a tela, "troquei e não resolveu" descarta a peça). Formato: `CHIP DA BIOS (SUSPEITA) | TROCADO: WEBCAM | DESCARTADO: TELA`.

## Peças universais e modelos que compartilham peça (1.5.0)

- **PEÇAS UNIVERSAIS** (aba LISTAS): peças que servem em qualquer modelo (padrão: MEMÓRIA, SSD, WI-FI). Entram na montagem entre modelos diferentes.
- **COMPATIBILIDADE**: cada linha diz que modelos diferentes usam a mesma peça (ex.: TELA · E1504FA, X1504ZA). O João pode escrever, e o app pesquisa sozinho (IA com busca do Google, uma vez por modelo+peça, a cada 2 horas e quando a planilha é editada).
- A montagem, a aba COMPATÍVEIS, as peças compradas e o app usam essas regras.
