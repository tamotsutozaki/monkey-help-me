// background.js — service worker (Manifest V3)
// Responsável por: menu de contexto, atalho de teclado, chamada da API Gemini e badge.
// Dois modos:
//   - "choice": múltipla escolha → a IA mapeia as alternativas para letras (A, B, C...)
//     por posição e devolve a(s) correta(s) em JSON; letra(s) no badge, letra+texto no popup.
//   - "open":   pergunta aberta → resposta objetiva em até 1 parágrafo, exibida no popup.
// IMPORTANTE: nada de estado em memória entre eventos. O SW pode ser desligado a
// qualquer momento pelo Edge/Chrome; tudo que precisa persistir vai pro chrome.storage.local.

const MENU_CHOICE = "answer-choice";
const MENU_OPEN = "answer-open";
const DEFAULT_MODEL = "gemini-2.5-flash";
const HISTORY_LIMIT = 10;
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const COLORS = {
  ok: "#16a34a",   // verde  — resposta válida
  busy: "#6b7280", // cinza  — processando
  warn: "#f59e0b", // âmbar  — key ausente/inválida ("!") ou formato inesperado ("?")
  err: "#dc2626"   // vermelho — rate limit ("X") ou erro de API/rede
};

const PROMPT_CHOICE = `Você recebe uma questão de múltipla escolha. Pense com calma e analise cada alternativa.

As alternativas estão listadas em ordem; atribua letras de cima para baixo: A = 1ª alternativa, B = 2ª, C = 3ª, e assim por diante (use quantas letras forem necessárias). Ignore a numeração da própria pergunta (ex.: "9.").

Identifique TODAS as alternativas corretas — normalmente é só uma, mas algumas questões têm mais de uma.

Responda SOMENTE com um objeto JSON, sem nenhum texto fora dele, neste formato:
{"letras": ["<letra>", "..."], "texto": "<texto exato da(s) alternativa(s) correta(s)>"}

Regras do JSON:
- "letras": lista com a(s) letra(s) da(s) alternativa(s) correta(s).
- "texto": o texto exato da(s) alternativa(s) correta(s); se houver mais de uma, separe com " ; ".

Questão:
{{QUESTION}}`;

const PROMPT_OPEN = `Você responde perguntas de forma objetiva e direta, em português.
Responda em NO MÁXIMO um parágrafo, indo direto ao ponto.
Não repita a pergunta, não faça introdução, não use rodeios.

Pergunta:
{{QUESTION}}`;

// ---------------------------------------------------------------------------
// Registro de listeners no topo (obrigatório em MV3 para o SW acordar nos eventos)
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(async () => {
  try {
    await chrome.contextMenus.removeAll();
  } catch (e) {
    console.warn("[Macaco] removeAll falhou (ok ignorar):", e);
  }
  chrome.contextMenus.create({
    id: MENU_CHOICE,
    title: "Responder alternativa (letra/número)",
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: MENU_OPEN,
    title: "Explicar / resposta aberta",
    contexts: ["selection"]
  });

  // Primeiro uso sem API key configurada → abre as opções automaticamente.
  const { apiKey } = await chrome.storage.local.get("apiKey");
  if (!apiKey) {
    chrome.runtime.openOptionsPage();
  }
});

chrome.contextMenus.onClicked.addListener((info, _tab) => {
  if (info.menuItemId === MENU_CHOICE) {
    handleQuestion(info.selectionText, "choice");
  } else if (info.menuItemId === MENU_OPEN) {
    handleQuestion(info.selectionText, "open");
  }
});

// Atalhos de teclado: Ctrl+Shift+1 → alternativa, Ctrl+Shift+2 → resposta aberta.
chrome.commands.onCommand.addListener(async (command) => {
  const mode =
    command === "answer-open-selection" ? "open" :
    command === "answer-selection" ? "choice" : null;
  if (!mode) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  const text = await getSelectionFromTab(tab.id);
  handleQuestion(text, mode);
});

// ---------------------------------------------------------------------------
// Núcleo
// ---------------------------------------------------------------------------

async function handleQuestion(selectionText, mode) {
  // Regra do briefing: limpar SEMPRE o badge anterior antes de processar o novo.
  await chrome.action.setBadgeText({ text: "" });

  const text = (selectionText || "").trim();
  if (!text) {
    await report("?", COLORS.warn, {
      type: "error",
      value: "?",
      message: "Nenhum texto selecionado. Selecione a pergunta/questão antes de acionar."
    });
    return;
  }

  const { apiKey, model } = await chrome.storage.local.get(["apiKey", "model"]);
  const useModel = model || DEFAULT_MODEL;

  if (!apiKey) {
    await report("!", COLORS.warn, {
      type: "error",
      value: "!",
      message: "API key não configurada. Abra as opções e cole sua key do Gemini."
    });
    chrome.runtime.openOptionsPage();
    return;
  }

  // Indicador de "processando".
  await setBadge("…", COLORS.busy);

  try {
    const prompt = buildPrompt(mode, text);
    const generationConfig = buildGenerationConfig(useModel, mode);
    const raw = await callGemini(apiKey, useModel, prompt, generationConfig);

    if (mode === "open") {
      const answer = raw.trim();
      console.log(`[Macaco] Resposta aberta (${useModel}):`, answer.slice(0, 120));
      await setBadge("✓", COLORS.ok); // badge não cabe parágrafo → indicador; texto no popup
      await saveResult({ type: "open", value: answer, question: text });
      return;
    }

    // modo "choice"
    const { letters, detail } = parseChoice(raw);
    if (letters.length) {
      const display = letters.join(", "); // ex.: "B" ou "A, C, D, F"
      const compact = letters.join("");    // ex.: "B" ou "ACDF"
      console.log(`[Macaco] Alternativa(s): ${display} (modelo ${useModel})`);
      // Badge cabe ~4 chars; conjuntos maiores viram "✓" e aparecem no popup.
      await setBadge(compact.length <= 4 ? compact : "✓", COLORS.ok);
      await saveResult({ type: "answer", value: display, detail, raw, question: text });
    } else {
      console.warn(`[Macaco] Resposta não interpretável:`, raw);
      await setBadge("?", COLORS.warn);
      await saveResult({
        type: "error",
        value: "?",
        message: "Não consegui interpretar a resposta da IA. Veja o texto cru abaixo ou tente o modo \"resposta aberta\".",
        raw,
        question: text
      });
    }
  } catch (err) {
    console.error("[Macaco] Erro ao consultar Gemini:", err);
    const isKey = err.kind === "key";
    const badge = isKey ? "!" : "X";
    const color = isKey ? COLORS.warn : COLORS.err;
    await report(badge, color, {
      type: "error",
      value: badge,
      message: err.message || "Erro desconhecido.",
      question: text
    });
    if (isKey) chrome.runtime.openOptionsPage();
  }
}

async function callGemini(apiKey, model, prompt, generationConfig) {
  const url = `${API_BASE}/${encodeURIComponent(model)}:generateContent`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Header em vez de ?key= na URL: evita a chave aparecer em logs de URL.
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    let detail = "";
    try {
      const payload = await res.json();
      detail = payload?.error?.message || "";
    } catch (_) { /* corpo não-JSON */ }

    const status = res.status;
    if (status === 429) {
      throw kinded("rate", "Limite de requisições atingido (rate limit). Aguarde alguns segundos e tente de novo.");
    }
    if (status === 400 || status === 403) {
      const msg = (detail || "").toLowerCase();
      if (msg.includes("api key") || msg.includes("api_key") || msg.includes("permission") || msg.includes("denied")) {
        throw kinded("key", "API key inválida ou sem permissão. Verifique a chave nas opções.");
      }
    }
    throw kinded("api", `Erro da API (${status}): ${detail || res.statusText}`);
  }

  const data = await res.json();
  const cand = data?.candidates?.[0];
  const parts = cand?.content?.parts || [];
  const textOut = parts.map((p) => p.text || "").join("").trim();

  if (!textOut) {
    const finish = cand?.finishReason;
    if (finish === "MAX_TOKENS") {
      throw kinded("api", "O modelo atingiu o limite de tokens sem concluir a resposta. Tente de novo ou aumente maxOutputTokens.");
    }
    if (finish === "SAFETY" || data?.promptFeedback?.blockReason) {
      throw kinded("api", "Conteúdo bloqueado pelos filtros de segurança do Gemini.");
    }
    throw kinded("api", "Resposta vazia da API.");
  }
  return textOut;
}

function buildPrompt(mode, question) {
  const template = mode === "open" ? PROMPT_OPEN : PROMPT_CHOICE;
  return template.replace("{{QUESTION}}", question);
}

// Config por modo. Com a API paga, deixamos o "thinking" DINÂMICO (thinkingBudget: -1):
// a IA pensa o quanto precisar para acertar. O teto de saída é alto só para nunca
// truncar — você paga pelos tokens realmente gerados, não pelo teto.
// (Otimização de custo fica para depois, se quisermos limitar o thinking.)
function buildGenerationConfig(_model, mode) {
  if (mode === "open") {
    return {
      temperature: 0.3,
      thinkingConfig: { thinkingBudget: -1 },
      maxOutputTokens: 4096
    };
  }
  // choice → saída estruturada em JSON, determinística
  return {
    temperature: 0.1,
    responseMimeType: "application/json",
    thinkingConfig: { thinkingBudget: -1 },
    maxOutputTokens: 8192
  };
}

// Interpreta a resposta JSON do modo "alternativa".
// Espera {"letras":["B"], "texto":"..."}. Retorna { letters, detail }.
function parseChoice(raw) {
  let letters = [];
  let detail = "";
  try {
    const obj = JSON.parse(stripJsonFence(raw));
    if (Array.isArray(obj.letras)) {
      letters = obj.letras
        .map((x) => String(x).trim().toUpperCase())
        .filter((x) => /^[A-Z]$/.test(x));
    }
    if (typeof obj.texto === "string") detail = obj.texto.trim();
  } catch (_) {
    // não veio JSON válido → letters fica vazio (estado "?")
  }
  letters = [...new Set(letters)]; // remove duplicatas mantendo a ordem
  return { letters, detail };
}

// Remove cercas ```json ... ``` caso o modelo as inclua (não deveria com responseMimeType).
function stripJsonFence(s) {
  return (s || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

function kinded(kind, message) {
  const e = new Error(message);
  e.kind = kind;
  return e;
}

async function setBadge(text, color) {
  await chrome.action.setBadgeBackgroundColor({ color });
  if (chrome.action.setBadgeTextColor) {
    try {
      await chrome.action.setBadgeTextColor({ color: "#ffffff" });
    } catch (_) { /* navegador antigo: ignora */ }
  }
  await chrome.action.setBadgeText({ text });
}

// Atualiza badge + persiste o resultado (e histórico) para o popup ler.
async function report(badgeText, color, result) {
  await setBadge(badgeText, color);
  await saveResult(result);
}

async function saveResult(result) {
  result.ts = Date.now();
  const { history } = await chrome.storage.local.get("history");
  const list = Array.isArray(history) ? history : [];

  if (result.type === "answer") {
    list.unshift({ kind: "choice", value: result.value, ts: result.ts, snippet: clip(result.question) });
  } else if (result.type === "open") {
    list.unshift({ kind: "open", value: "✓", ts: result.ts, snippet: clip(result.question), answer: result.value });
  }

  await chrome.storage.local.set({
    lastResult: result,
    history: list.slice(0, HISTORY_LIMIT)
  });
}

function clip(s) {
  return (s || "").replace(/\s+/g, " ").slice(0, 80);
}

// Lê a seleção da aba ativa (usado só pelo atalho de teclado; o menu de contexto
// já entrega info.selectionText pronto).
async function getSelectionFromTab(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => (window.getSelection() ? window.getSelection().toString() : "")
    });
    return results?.[0]?.result || "";
  } catch (e) {
    console.error("[Macaco] Falha ao ler a seleção da aba:", e);
    return "";
  }
}
