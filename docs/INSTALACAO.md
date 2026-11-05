# Instalação (uma vez só)

Depois disso, todo código novo que entrar na branch `main` é enviado e publicado sozinho.

## 1. Um segredo no GitHub

No repositório: **Settings › Secrets and variables › Actions › New repository secret**.

| Nome | O que colar |
| --- | --- |
| `CLASPRC_JSON` | O mesmo conteúdo usado nos outros apps (Produção por voz, Preço Médio): o arquivo `.clasprc.json` da sua pasta de usuário no Windows, aberto no Bloco de Notas. |

| `GEMINI_API_KEY` | (opcional, liga a IA da etiqueta) A mesma chave do Google AI Studio usada no SCAN. |

Nunca cole esses valores no chat.

## 2. Primeira publicação

Acontece sozinha quando o código entra na `main` (ou em **Actions › Apps Script › Run workflow**). O link do app aparece no resumo da execução.

## 3. Autorizar uma vez

Abra o link do app **logado na sua conta Google** (a dona da planilha) e aceite o acesso. Se aparecer "O Google não verificou este app", toque em **Avançado › Acessar**. Nessa primeira abertura o app:

- renomeia a aba EQUIPAMENTOS para APARELHOS e apaga a aba MEUS, se ainda existirem;
- cria as abas HISTÓRICO e OBSERVAÇÕES e a coluna COMBINA COM; a coluna PEÇAS passa a ser a previsão automática das peças com defeito;
- liga a conferência automática com o controle de qualidade (a cada 2 horas).

## 4. Passar para a equipe

- Mande o link do app. Não precisa de senha nem de conta. No iPhone: Safari › Compartilhar › **Adicionar à Tela de Início**.
- Compartilhe a planilha com os técnicos como **Leitor**.
- Os nomes dos técnicos ficam na aba LISTAS, coluna TÉCNICO.

## IA da etiqueta (a mesma do SCAN)

Com `GEMINI_API_KEY`, a "Foto da etiqueta" usa a IA **só quando o código de barras não resolveu** (sem serial ou modelo desconhecido). Ela lê o texto impresso e preenche só os campos vazios. Sem a chave, o app funciona igual, só com o código de barras.

## Bom saber

- Para contar como finalizado só com "APROVADO? = Sim" (padrão) ou com qualquer linha no controle de qualidade, mude `FINALIZA_SO_APROVADO` no topo de `src/Codigo.gs`.
- O botão "Conferir agora" no fim da tela do app faz a conferência na hora.
- Palavras que viram peças ficam na lista `PECAS` em `src/Codigo.gs`.
