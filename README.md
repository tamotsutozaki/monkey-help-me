# Macaco Ajuda

Extensão de navegador (Microsoft Edge / Chromium — **Manifest V3**) que responde questões de múltipla escolha selecionadas em qualquer página, usando a **API do Google Gemini**.

Fluxo: você seleciona o texto da questão → botão direito → **"Responder questão"** → a resposta (só a letra ou número) aparece no **badge sobre o ícone** da extensão e também no **popup**.

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

- **Service worker** (`background.js`) cria o item de menu de contexto, recebe o texto selecionado, chama a API do Gemini e escreve o resultado no badge.
- A resposta é exibida de **duas formas**:
  1. **Badge** sobre o ícone da extensão na barra (forma primária).
  2. **Popup** minimalista (clique no ícone) mostrando a letra/número em fonte grande, mais um histórico das últimas respostas.
- Também há um **atalho de teclado** (`Ctrl+Shift+Y` por padrão) como alternativa ao botão direito.
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

1. Em qualquer página, **selecione com o mouse** o texto da questão **incluindo as alternativas**.
2. **Botão direito** → **"Responder questão"**.
   *(ou pressione `Ctrl+Shift+Y` com o texto selecionado.)*
3. Enquanto processa, o badge mostra **`…`**. Em seguida aparece a resposta, por exemplo **`A`** (em verde).
4. Clique no ícone da extensão para abrir o **popup** com a resposta em fonte grande e o histórico das últimas respostas.

O badge anterior é **sempre limpo** antes de processar uma nova questão.

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
| `A` / `3` | verde | Resposta válida (letra ou número) |
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

**Badge `?` (formato inesperado)**
- Raro. Normalmente significa que o modelo respondeu algo que não é uma letra/número curto. Veja o texto cru no popup. Em questões muito difíceis, troque para `gemini-2.5-pro` nas opções.

**Erro de CORS / falha de rede**
- O domínio `https://generativelanguage.googleapis.com/*` já está declarado em `host_permissions`. Se aparecer erro de rede, verifique sua conexão e se a key é válida.

**O atalho `Ctrl+Shift+Y` não funciona**
- Pode haver conflito com outro atalho. Vá em `edge://extensions/shortcuts` e defina uma combinação livre para "Responder a questão selecionada".

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

### 1. "Thinking" do Gemini 2.5 desligado (mudança importante)
Os modelos **Gemini 2.5 são "thinking models"**: eles gastam tokens *pensando* antes de produzir a resposta visível. Com o `maxOutputTokens: 10` sugerido no briefing, o modelo consumiria os 10 tokens **só no raciocínio interno** e devolveria **texto vazio** (`finishReason: MAX_TOKENS`). Solução adotada em `buildGenerationConfig()`:

- **Flash / Flash-Lite:** `thinkingConfig.thinkingBudget = 0` (desliga o thinking) + `maxOutputTokens = 10`. Resposta curtíssima e determinística, exatamente como pedido.
- **Pro:** o Pro **não permite** budget 0 (mínimo 128). Então usamos `thinkingBudget = 128` e `maxOutputTokens = 512` para reservar folga e não cair no `MAX_TOKENS`.

Mantidos `temperature: 0.1` e o prompt exatamente como no briefing.

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
- **Histórico** das últimas 10 respostas no popup.
- **Atalho de teclado** (`commands` API) como alternativa ao botão direito.
- **Botão "Testar conexão"** nas opções para validar a key na hora.
- Suporte a **tema escuro** no popup e nas opções.
- Modelo adicional `gemini-2.5-flash-lite` na lista.

### Validação do fluxo (teste mental)
- **Sem key → 1º uso:** `onInstalled` abre as opções. ✓
- **Selecionar + botão direito:** `contextMenus.onClicked` → `info.selectionText` → `callGemini` → badge `A` + popup. ✓
- **Atalho de teclado:** `commands.onCommand` → `scripting.executeScript` lê `window.getSelection()` → mesmo fluxo. ✓
- **Badge limpo:** `setBadgeText({text:""})` no início de cada `handleQuestion`. ✓
- **Key inválida:** HTTP 400/403 com "API key" → badge `!` + abre opções. ✓
- **Rate limit:** HTTP 429 → badge `X`. ✓
- **Formato inesperado:** `normalizeAnswer` retorna `null` → badge `?`. ✓
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

- Opção para também **mostrar uma justificativa curta** (modo "explicar") num segundo clique.
- **Copiar a resposta** para a área de transferência automaticamente.
- Permitir **editar o prompt** nas opções.
- **Cache** de perguntas idênticas para economizar chamadas.
- **Fallback automático** Flash → Pro quando a resposta vier no formato `?`.
- **Exportar o histórico** (CSV/JSON).
- Indicador de **consumo/limite** do tier gratuito.
- Suporte a **streaming** para feedback mais rápido em modelos lentos.
