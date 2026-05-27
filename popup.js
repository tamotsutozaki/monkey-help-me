// popup.js — UI minimalista que exibe a última resposta (ou estado de erro).
// Lê tudo do chrome.storage.local e re-renderiza ao vivo se algo mudar.
// Tipos de lastResult:
//   - "answer" → alternativa (letra/número) em fonte grande
//   - "open"   → resposta aberta (parágrafo)
//   - "error"  → mensagem de erro

const $ = (id) => document.getElementById(id);

async function render() {
  const { apiKey, lastResult, history } = await chrome.storage.local.get([
    "apiKey",
    "lastResult",
    "history"
  ]);

  $("answer-view").hidden = true;
  $("open-view").hidden = true;
  $("message-view").hidden = true;

  if (!apiKey) {
    showMessage("🔑", "Configure sua API key do Gemini para começar.", true);
  } else if (!lastResult) {
    showMessage(
      "✳️",
      'Selecione um texto na página e use o botão direito: "Responder alternativa" ou "Explicar / resposta aberta".',
      false
    );
  } else if (lastResult.type === "answer") {
    $("answer").textContent = lastResult.value;
    $("meta").textContent = timeAgo(lastResult.ts);
    $("answer-view").hidden = false;
  } else if (lastResult.type === "open") {
    $("open-question").textContent = lastResult.question || "";
    $("open-text").textContent = lastResult.value || "";
    $("open-meta").textContent = timeAgo(lastResult.ts);
    $("open-view").hidden = false;
  } else {
    const icon = lastResult.value === "!" ? "🔑" : lastResult.value === "?" ? "❓" : "⚠️";
    showMessage(icon, lastResult.message || "Erro ao responder.", lastResult.value === "!");
  }

  renderHistory(history);
}

function showMessage(icon, text, showOptionsBtn) {
  $("msg-icon").textContent = icon;
  $("msg-text").textContent = text;
  $("open-options").hidden = !showOptionsBtn;
  $("message-view").hidden = false;
}

function renderHistory(history) {
  const list = Array.isArray(history) ? history : [];
  const box = $("history");
  if (!list.length) {
    box.hidden = true;
    return;
  }
  const ul = $("history-list");
  ul.innerHTML = "";
  for (const item of list) {
    const li = document.createElement("li");
    const val = document.createElement("span");
    val.className = "h-val";
    val.textContent = item.value;
    const snip = document.createElement("span");
    snip.className = "h-snip";
    snip.textContent = item.snippet || "";
    // Em respostas abertas, o tooltip mostra a resposta completa; nas demais, a pergunta.
    snip.title = item.kind === "open" && item.answer ? item.answer : (item.snippet || "");
    li.append(val, snip);
    ul.appendChild(li);
  }
  box.hidden = false;
}

function timeAgo(ts) {
  if (!ts) return "";
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `há ${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m}min`;
  const h = Math.round(m / 60);
  return `há ${h}h`;
}

$("open-options").addEventListener("click", () => chrome.runtime.openOptionsPage());
chrome.storage.onChanged.addListener(render);
render();
