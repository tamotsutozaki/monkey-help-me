// background.js — service worker (Manifest V3)
// Responsável por: menu de contexto, atalho de teclado, chamada da API Gemini e badge.
// Dois modos:
//   - "choice": questão de múltipla escolha → APENAS a letra/número, exibido no badge.
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

const PROMPT_CHOICE = `Você é um assistente que responde questões de múltipla escolha.
Responda APENAS com a letra ou número da alternativa correta.
Sem explicação, sem texto adicional, sem pontuação, sem aspas.
Exemplos de resposta válida: A
Outro exemplo válido: 3

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

// Atalho de teclado responde sempre no modo "alternativa" (badge curto).
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "answer-selection") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  const text = await getSelectionFromTab(tab.id);
  handleQuestion(text, "choice");
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
    const answer = normalizeAnswer(raw);
    if (answer) {
      console.log(`[Macaco] Resposta: "${answer}" (modelo ${useModel})`);
      await setBadge(answer, COLORS.ok);
      await saveResult({ type: "answer", value: answer, raw, question: text });
    } else {
      console.warn(`[Macaco] Formato inesperado da API:`, raw);
      await setBadge("?", COLORS.warn);
      await saveResult({
        type: "error",
        value: "?",
        message: "A API respondeu, mas não num formato de letra/número curto. Tente o modo \"resposta aberta\".",
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
      throw kinded("api", "O modelo gastou o orçamento de tokens 'pensando' e não retornou texto. Use o Flash ou aumente o limite.");
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

// Gemini 2.5 são modelos "thinking": gastam tokens pensando ANTES de responder.
// Com maxOutputTokens baixo isso zera a resposta visível. Por isso:
//  - Flash/Flash-Lite: desligamos o thinking (budget 0).
//  - Pro: não permite budget 0 (mínimo 128) → reservamos folga no maxOutputTokens.
// O modo "open" precisa de mais tokens de saída (cabe ~1 parágrafo); "choice" usa pouquíssimos.
function buildGenerationConfig(model, mode) {
  const m = (model || "").toLowerCase();
  const isFlash = m.includes("flash") || m.includes("lite");
  const isOpen = mode === "open";

  const cfg = { temperature: isOpen ? 0.2 : 0.1 };

  if (isFlash) {
    cfg.thinkingConfig = { thinkingBudget: 0 };
    cfg.maxOutputTokens = isOpen ? 256 : 10;
  } else {
    cfg.thinkingConfig = { thinkingBudget: 128 };
    cfg.maxOutputTokens = isOpen ? 768 : 512;
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
