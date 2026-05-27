// options.js — salva API key + modelo no chrome.storage.local e testa a conexão.

const DEFAULT_MODEL = "gemini-2.5-flash";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const $ = (id) => document.getElementById(id);

async function load() {
  const { apiKey, model } = await chrome.storage.local.get(["apiKey", "model"]);
  if (apiKey) $("apiKey").value = apiKey;
  $("model").value = model || DEFAULT_MODEL;
}

function setStatus(text, cls) {
  const el = $("status");
  el.textContent = text;
  el.className = cls || "";
}

$("toggleKey").addEventListener("click", () => {
  const input = $("apiKey");
  const show = input.type === "password";
  input.type = show ? "text" : "password";
  $("toggleKey").textContent = show ? "Ocultar" : "Mostrar";
});

$("save").addEventListener("click", async () => {
  const apiKey = $("apiKey").value.trim();
  const model = $("model").value;
  if (!apiKey) {
    setStatus("Informe uma API key antes de salvar.", "err");
    return;
  }
  await chrome.storage.local.set({ apiKey, model });
  setStatus("Salvo ✓", "ok");
});

$("test").addEventListener("click", async () => {
  const apiKey = $("apiKey").value.trim();
  const model = $("model").value;
  if (!apiKey) {
    setStatus("Informe uma API key antes de testar.", "err");
    return;
  }
  setStatus("Testando…", "info");

  try {
    const res = await fetch(`${API_BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Responda apenas com a letra: A" }] }],
        generationConfig: buildGenerationConfig(model)
      })
    });

    if (res.ok) {
      setStatus(`Conexão OK ✓ — modelo "${model}" respondeu.`, "ok");
      return;
    }

    let detail = "";
    try {
      const payload = await res.json();
      detail = payload?.error?.message || "";
    } catch (_) { /* ignore */ }

    if (res.status === 400 || res.status === 403) {
      setStatus(`Falha (${res.status}): API key inválida ou sem permissão. ${detail}`, "err");
    } else if (res.status === 429) {
      setStatus("Falha (429): rate limit. A key é válida, mas você atingiu o limite — tente depois.", "err");
    } else {
      setStatus(`Falha (${res.status}): ${detail || res.statusText}`, "err");
    }
  } catch (e) {
    setStatus(`Erro de rede: ${e.message}`, "err");
  }
});

// Mesma lógica do background: desliga "thinking" no Flash, reserva folga no Pro.
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

load();
