# Macaco Ajuda

Extensão de navegador (Microsoft Edge / Chromium — **Manifest V3**) que responde **questões de múltipla escolha** e **perguntas abertas** selecionadas em qualquer página, usando a **API do Google Gemini**.

Fluxo: você seleciona o texto → botão direito → escolhe um dos dois itens:

- **"Responder alternativa"** → a IA mapeia as alternativas para letras (A, B, C... por posição) e devolve a(s) correta(s). Letra(s) no **badge sobre o ícone** (ex.: `B`, `ACDF`) e **letra + texto** no popup. Suporta mais de uma correta.
- **"Explicar / resposta aberta"** → resposta objetiva em **até 1 parágrafo** no **popup** (o badge mostra `✓`).

---

## Sumário

- [Como funciona](#como-funciona)
- [Instalação no Microsoft Edge](#instalação-no-microsoft-edge)
- [Configurar a API key](#configurar-a-api-key)
- [Como usar](#como-usar)
- [Recarregar após mudanças no código](#recarregar-após-mudanças-no-código)
- [Significado dos badges](#significado-dos-badges)
- [Troubleshooting](#troubleshooting)
- [Instalação no Google Chrome (bônus)](#instalação-no-google-chrome-bônus)
- [Decisões técnicas e mudanças em relação ao briefing](#decisões-técnicas-e-mudanças-em-relação-ao-briefing)
- [Substituir os ícones](#substituir-os-ícones)
- [Privacidade e segurança](#privacidade-e-segurança)
- [Melhorias futuras](#melhorias-futuras)

---

## Como funciona

- **Service worker** (`background.js`) cria os itens de menu de contexto, recebe o texto selecionado, chama a API do Gemini e escreve o resultado.
- **Dois modos**, escolhidos pelo item do menu de botão direito:
  - **Alternativa** (`choice`): a IA numera as alternativas como letras (A = 1ª, B = 2ª...) **por posição**, raciocina (thinking) e devolve a(s) correta(s) em **JSON** (`{"letras":[...],"texto":"..."}`). Funciona com alternativas de texto longo e com **mais de uma** correta. Badge mostra a(s) letra(s) (5+ viram `✓`); popup mostra **letra + texto**.
  - **Resposta aberta** (`open`): prompt pede resposta direta em até 1 parágrafo → texto no **popup** (o badge vira `✓`, pois não cabe parágrafo).
- O **popup** (clique no ícone) também mostra um **histórico** das últimas respostas.
- **Atalhos de teclado** (padrão): `Ctrl+Shift+1` → modo alternativa, `Ctrl+Shift+2` → modo aberto. Configuráveis em `edge://extensions/shortcuts`.
- A API key e o modelo escolhido ficam em `chrome.storage.local` — **nunca** no código.

---

## Instalação no Microsoft Edge

1. Abra o Edge e vá para `edge://extensions/` (digite na barra de endereço e Enter).
2. Ative o **"Modo de desenvolvedor"** — o botão fica no **canto inferior esquerdo** da página.
3. Clique em **"Carregar sem compactação"** (*Load unpacked*).
4. Selecione a pasta **`macaco-ajuda`** (a pasta que contém o `manifest.json`) e confirme.
5. A extensão aparece na lista. Clique no ícone de **quebra-cabeça/extensões** na barra e no **alfinete** (📌) ao lado de "Macaco Ajuda" para **fixar o ícone** na barra.

Na primeira instalação, como ainda não há API key, a **página de opções abre automaticamente**.

---

## Configurar a API key

1. Abra as opções: clique com o botão direito no ícone da extensão → **"Opções"**, ou vá em `edge://extensions/` → "Macaco Ajuda" → **"Detalhes"** → **"Opções da extensão"**.
2. Cole sua **API key do Gemini** (gere em <https://aistudio.google.com/app/apikey>).
3. Escolha o **modelo** (comece com `gemini-2.5-flash`).
4. Clique em **"Salvar"**. Opcionalmente clique em **"Testar conexão"** para validar a key na hora.

> A chave é guardada só no `chrome.storage.local` deste navegador. Ela **não** está no código nem em nenhum arquivo do projeto.

---

## Como usar

1. Em qualquer página, **selecione com o mouse** o texto.
2. **Botão direito** e escolha o modo:
   - **"Responder alternativa"** — para múltipla escolha. Selecione a questão **incluindo todas as alternativas**. *(atalho: `Ctrl+Shift+1`.)*
   - **"Explicar / resposta aberta"** — para perguntas abertas/teóricas. Ex.: *"O que é um algoritmo?"*, *"Escreva um exemplo de senha forte"*, *"Em que ano o HTML lançou sua primeira versão?"*. *(atalho: `Ctrl+Shift+2`.)*
3. Enquanto processa, o badge mostra **`…`**. Depois:
   - modo alternativa → a(s) letra(s) aparece(m) no badge (ex.: **`B`** ou **`ACDF`**, em verde) e a letra + texto no popup;
   - modo aberto → o badge mostra **`✓`** e o **parágrafo** aparece no popup.
4. Clique no ícone da extensão para abrir o **popup** com a resposta e o histórico das últimas respostas.

O badge anterior é **sempre limpo** antes de processar uma nova pergunta.

---

## Recarregar após mudanças no código

Sempre que editar qualquer arquivo do projeto:

1. Vá em `edge://extensions/`.
2. No cartão da "Macaco Ajuda", clique no ícone de **recarregar** (🔄).
3. Se mudou só o popup/options, basta reabrir; se mudou o `background.js` ou o `manifest.json`, o reload é obrigatório.

Para ver os logs do service worker (debug): em `edge://extensions/` → "Macaco Ajuda" → clique em **"service worker"** (link em *Inspecionar modos de exibição*). Abre o DevTools do background, onde aparecem os `console.log`/`console.error`.

---

## Significado dos badges

| Badge | Cor | Significado |
|------|------|-------------|
| `…` | cinza | Processando a requisição |
| `B` / `ACDF` | verde | Letra(s) da(s) alternativa(s) correta(s) — texto completo no popup |
| `✓` | verde | Resposta pronta no **popup** — parágrafo (modo aberto) ou alternativa de texto longo |
| `!` | âmbar | API key ausente ou inválida (abre as opções) |
| `?` | âmbar | Nenhum texto selecionado **ou** resposta em formato inesperado |
| `X` | vermelho | Erro de API/rede ou **rate limit** (429) |

O motivo detalhado de qualquer estado de erro aparece no **popup** (clique no ícone) e nos logs do service worker.

---

## Troubleshooting

**O badge não aparece / não acontece nada**
- Confirme que o ícone está **fixado** na barra (o badge fica sobre ele).
- Recarregue a extensão em `edge://extensions/` (🔄).
- Verifique se você **selecionou o texto** antes do botão direito.
- Abra o **service worker** (DevTools) e veja se há erros no console.

**Badge `!` (key)**
- A key está ausente, inválida ou sem permissão. Reabra as opções, cole a key correta e use **"Testar conexão"**.
- Garanta que a key foi gerada para a **Gemini API** no Google AI Studio.

**Badge `X` com 429 (rate limit)**
- Você atingiu o limite do tier gratuito. Aguarde alguns segundos/minutos e tente de novo.

**Badge `?` (não consegui interpretar a resposta)**
- A IA não devolveu um JSON válido com as letras. Veja o texto cru no popup/console. Tente de novo, use o modo **"Explicar / resposta aberta"** (`Ctrl+Shift+2`) ou troque o modelo nas opções.

**Erro de CORS / falha de rede**
- O domínio `https://generativelanguage.googleapis.com/*` já está declarado em `host_permissions`. Se aparecer erro de rede, verifique sua conexão e se a key é válida.

**Os atalhos `Ctrl+Shift+1` / `Ctrl+Shift+2` não funcionam**
- Pode haver conflito com outro atalho do sistema/navegador. Vá em `edge://extensions/shortcuts` e defina combinações livres para "Responder alternativa (letra/número)" e "Explicar / resposta aberta".
- Combos já usados pelo Edge (evite): `Ctrl+Shift+Y` (Coleções), `Ctrl+Shift+U` (Ler em voz alta), `Ctrl+Shift+K` (duplicar aba), `Ctrl+Shift+E` (busca na barra lateral).

---

## Instalação no Google Chrome (bônus)

Idêntico ao Edge — o Chrome é Chromium também:

1. `chrome://extensions/`
2. Ative **"Modo do desenvolvedor"** (canto **superior direito** no Chrome).
3. **"Carregar sem compactação"** → selecione a pasta `macaco-ajuda`.
4. Atalhos: `chrome://extensions/shortcuts`.

---

## Decisões técnicas e mudanças em relação ao briefing

O briefing deu liberdade para mudar decisões técnicas, desde que documentadas. As mudanças:

### 1. "Thinking" dinâmico + saída estruturada (mudança importante)
Os modelos **Gemini 2.5 são "thinking models"**: gastam tokens *pensando* antes de responder. Como a API é **paga**, deixamos o **thinking dinâmico** (`thinkingConfig.thinkingBudget = -1`) — a IA pensa o quanto precisar para acertar — com `maxOutputTokens` alto (`4096` no modo aberto, `8192` no alternativa) só para **nunca truncar** a resposta. Você paga pelos tokens realmente gerados, não pelo teto.

No **modo alternativa**, a saída é **JSON estruturado** (`responseMimeType: "application/json"`): a IA mapeia as alternativas para letras por posição (A = 1ª, B = 2ª...) e devolve `{"letras":[...],"texto":"..."}`. Isso funciona com alternativas de texto longo e com mais de uma correta, sem depender de o quiz ter rótulos. O `parseChoice()` lê esse JSON.

`temperature` = `0.1` (alternativa, determinístico) e `0.3` (aberto).

> Histórico: antes o thinking ficava **desligado** (budget 0) e o `maxOutputTokens` mínimo, para economizar no tier gratuito. Com a API assinada, priorizamos acerto sobre custo. Dá para reativar a economia depois limitando o `thinkingBudget`.

### 2. API key enviada no header, não na URL
A chamada usa o header `x-goog-api-key` em vez de `?key=...` na URL. Funciona igual e evita a key aparecer em logs de URL.

### 3. Endpoint e versão
`POST https://generativelanguage.googleapis.com/v1beta/models/<modelo>:generateContent` (a `v1beta` é a que expõe `thinkingConfig` para os modelos 2.5).

### 4. "Abrir opções ao clicar" + popup
O briefing pedia popup ao clicar **e** "abrir options ao clicar" quando a key está ausente. Como uma `action` com `default_popup` sempre abre o popup (não dá para capturar o clique ao mesmo tempo), a abertura das opções acontece:
- automaticamente **na primeira instalação** sem key;
- automaticamente quando uma consulta é disparada **sem key** (badge `!`);
- pelo botão **"Abrir configurações"** dentro do próprio popup.

### 5. Extras (dentro das liberdades do briefing)
- **Dois modos** de resposta (alternativa / aberta) — ver item 6.
- **Histórico** das últimas 10 respostas no popup.
- **Atalho de teclado** (`commands` API) como alternativa ao botão direito.
- **Botão "Testar conexão"** nas opções para validar a key na hora.
- Suporte a **tema escuro** no popup e nas opções.
- Modelo adicional `gemini-2.5-flash-lite` na lista.

### 6. Modo de resposta aberta + impacto em tokens
Além de múltipla escolha, a extensão responde **perguntas abertas** (segundo item do menu): resposta objetiva em até 1 parágrafo, exibida no popup.

**Custo em tokens:** com o thinking dinâmico ligado, cada requisição inclui os tokens de raciocínio (cobrados como **saída**). Em questão simples o thinking é curto; em difícil, maior. No **modo alternativa** a saída visível é minúscula (só o JSON), mas o thinking entra na conta; no **modo aberto** soma-se o parágrafo. No Flash o custo por requisição segue na casa de frações de centavo de dólar. Para cortar custo depois, basta limitar o `thinkingBudget`.

### Validação do fluxo (teste mental)
- **Sem key → 1º uso:** `onInstalled` abre as opções. ✓
- **Modo alternativa:** `contextMenus.onClicked` → `callGemini` (JSON) → `parseChoice` extrai letras + texto → badge com a(s) letra(s) + popup (letra + texto). ✓
- **Modo aberto:** item "resposta aberta" → prompt aberto → texto no popup, badge `✓`. ✓
- **Atalhos de teclado:** `commands.onCommand` roteia `Ctrl+Shift+1` → alternativa e `Ctrl+Shift+2` → aberto; lê a seleção via `scripting.executeScript`. ✓
- **Badge limpo:** `setBadgeText({text:""})` no início de cada `handleQuestion`. ✓
- **Key inválida:** HTTP 400/403 com "API key" → badge `!` + abre opções. ✓
- **Rate limit:** HTTP 429 → badge `X`. ✓
- **JSON inválido:** `parseChoice` não acha letras → badge `?` (texto cru fica no popup/console). ✓
- **SW reiniciado:** listeners no topo do arquivo + estado em `storage` → nada depende de variável global em memória. ✓

---

## Substituir os ícones

Os ícones em `icons/` (16/48/128 px) são uma carinha de macaco (marrom sobre fundo amarelo), gerados automaticamente. Para trocar, basta substituir os três PNGs **mantendo os nomes** `icon16.png`, `icon48.png`, `icon128.png` e recarregar a extensão. Os caminhos estão declarados no `manifest.json` (em `action.default_icon` e `icons`).

---

## Privacidade e segurança

- A **API key** vive só no `chrome.storage.local` do seu navegador.
- O texto selecionado é enviado **apenas** para `generativelanguage.googleapis.com` (Google), para obter a resposta.
- O `.gitignore` previne commit acidental de arquivos de segredo. **Não** adicione a key a nenhum arquivo do projeto.

---

## Melhorias futuras

- **Suporte a outras IAs** (OpenAI/GPT, Anthropic/Claude) via um adapter de provider.
- **Detecção automática** do modo (alternativa vs. aberta) pelo formato do texto selecionado.
- **Copiar a resposta** para a área de transferência automaticamente.
- Permitir **editar o prompt** nas opções.
- **Cache** de perguntas idênticas para economizar chamadas.
- **Fallback automático** Flash → Pro quando a resposta vier no formato `?`.
- **Exportar o histórico** (CSV/JSON).
- Indicador de **consumo/limite** do tier gratuito.
- Suporte a **streaming** para feedback mais rápido em modelos lentos.
