// background.js — service worker (Manifest V3)
// Responsável por: menu de contexto, atalho de teclado, chamada da API Gemini e badge.
// IMPORTANTE: nada de estado em memória entre eventos. O SW pode ser desligado a
// qualquer momento pelo Edge/Chrome; tudo que precisa persistir vai pro chrome.storage.local.

const MENU_ID = "answer-question";
const DEFAULT_MODEL = "gemini-2.5-flash";
const HISTORY_LIMIT = 10;
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const COLORS = {
  ok: "#16a34a",   // verde  — resposta válida
  busy: "#6b7280", // cinza  — processando
  warn: "#f59e0b", // âmbar  — key ausente/inválida ("!") ou formato inesperado ("?")
  err: "#dc2626"   // vermelho — rate limit ("X") ou erro de API/rede
};

const PROMPT_TEMPLATE = `Você é um assistente que responde questões de múltipla escolha.
Responda APENAS com a letra ou número da alternativa correta.
Sem explicação, sem texto adicional, sem pontuação, sem aspas.
Exemplos de resposta válida: A
Outro exemplo válido: 3

Questão:
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
    id: MENU_ID,
    title: "Responder questão",
    contexts: ["selection"]
  });

  // Primeiro uso sem API key configurada → abre as opções automaticamente.
  const { apiKey } = await chrome.storage.local.get("apiKey");
  if (!apiKey) {
    chrome.runtime.openOptionsPage();
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID) {
    handleQuestion(info.selectionText, tab);
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "answer-selection") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  const text = await getSelectionFromTab(tab.id);
  handleQuestion(text, tab);
});

// ---------------------------------------------------------------------------
// Núcleo
// ---------------------------------------------------------------------------

async function handleQuestion(selectionText, _tab) {
  // Regra do briefing: limpar SEMPRE o badge anterior antes de processar o novo.
  await chrome.action.setBadgeText({ text: "" });

  const text = (selectionText || "").trim();
  if (!text) {
    await report("?", COLORS.warn, {
      type: "error",
      value: "?",
      message: "Nenhum texto selecionado. Selecione a questão (com as alternativas) antes de acionar."
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
    const raw = await callGemini(apiKey, useModel, text);
    const answer = normalizeAnswer(raw);

    if (answer) {
      console.log(`[Macaco] Resposta: "${answer}" (modelo ${useModel})`);
      await report(answer, COLORS.ok, {
        type: "answer",
        value: answer,
        raw,
        question: text
      });
    } else {
      console.warn(`[Macaco] Formato inesperado da API:`, raw);
      await report("?", COLORS.warn, {
        type: "error",
        value: "?",
        message: "A API respondeu, mas não num formato de letra/número curto.",
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

async function callGemini(apiKey, model, questionText) {
  const url = `${API_BASE}/${encodeURIComponent(model)}:generateContent`;
  const body = {
    contents: [{ parts: [{ text: PROMPT_TEMPLATE.replace("{{QUESTION}}", questionText) }] }],
    generationConfig: buildGenerationConfig(model)
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
      throw kinded("api", "O modelo gastou o orçamento de tokens 'pensando' e não retornou texto. Use o Flash ou aumente o limite.");
    }
    if (finish === "SAFETY" || data?.promptFeedback?.blockReason) {
      throw kinded("api", "Conteúdo bloqueado pelos filtros de segurança do Gemini.");
    }
    throw kinded("api", "Resposta vazia da API.");
  }
  return textOut;
}

// Gemini 2.5 são modelos "thinking": gastam tokens pensando ANTES de responder.
// Com maxOutputTokens baixo isso zera a resposta visível. Por isso:
//  - Flash/Flash-Lite: desligamos o thinking (budget 0) → cabe em 10 tokens.
//  - Pro: não permite budget 0 (mínimo 128) → reservamos folga no maxOutputTokens.
function buildGenerationConfig(model) {
  const m = (model || "").toLowerCase();
  const cfg = { temperature: 0.1 };
  if (m.includes("flash") || m.includes("lite")) {
    cfg.thinkingConfig = { thinkingBudget: 0 };
    cfg.maxOutputTokens = 10;
  } else {
    cfg.thinkingConfig = { thinkingBudget: 128 };
    cfg.maxOutputTokens = 512;
  }
  return cfg;
}

// Extrai uma letra (A-Z) ou número curto da resposta crua, tolerando pontuação/aspas.
function normalizeAnswer(raw) {
  if (!raw) return null;
  const firstLine = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0] || "";
  const cleaned = firstLine.replace(/[^A-Za-z0-9]/g, "");
  if (/^[A-Za-z]$/.test(cleaned)) return cleaned.toUpperCase();
  if (/^[0-9]{1,2}$/.test(cleaned)) return cleaned;
  return null;
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
    list.unshift({
      value: result.value,
      ts: result.ts,
      snippet: (result.question || "").replace(/\s+/g, " ").slice(0, 80)
    });
  }
  await chrome.storage.local.set({
    lastResult: result,
    history: list.slice(0, HISTORY_LIMIT)
  });
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
