/* Script comum dos sites da Ametista Seeds.
   1) Botão de doação no rodapé (Ko-fi), no estilo do "Apoie o tudukit ☕".
   2) Estatística anônima: sem cookies, sem armazenamento no aparelho, sem identificador.
      Envia só: página vista, domínio de onde veio a visita, erros técnicos e alguns cliques (vídeo, streaming, apoio). */
(function () {
  // ---- Doação (Ko-fi) ----
  // Preencher com o link do Ko-fi (ex.: "https://ko-fi.com/ametistaseeds"). Enquanto estiver vazio,
  // o botão NÃO aparece no site publicado; nas pré-visualizações (*.workers.dev) aparece desativado, só para ver o visual.
  var SUPPORT_URL = "";
  var BRAND = /babinoli/.test(location.hostname) ? "Babi Noli" : "Ametista Seeds";
  var SUPPORT_TXT = {
    pt: "Apoie a " + BRAND + " ☕",
    en: "Support " + BRAND + " ☕",
    de: BRAND + " unterstützen ☕"
  };
  var isPreview = /\.workers\.dev$/.test(location.hostname);

  function send(ep, data) {
    if (!navigator.sendBeacon || location.protocol !== "https:") return;
    try { navigator.sendBeacon(ep, new Blob([JSON.stringify(data)], { type: "application/json" })); } catch (e) {}
  }

  function addSupport() {
    var ok = /^https:\/\/ko-fi\.com\/[A-Za-z0-9_]+\/?$/.test(SUPPORT_URL);
    if (!ok && !isPreview) return;
    var foot = document.querySelector("footer .envolve") || document.querySelector("footer");
    if (!foot || foot.querySelector(".apoio")) return;
    var lang = (document.documentElement.lang || "pt").slice(0, 2);
    var a = document.createElement("a");
    a.className = "apoio";
    a.textContent = SUPPORT_TXT[lang] || SUPPORT_TXT.en;
    if (ok) {
      a.href = SUPPORT_URL; a.target = "_blank"; a.rel = "noopener";
      a.addEventListener("click", function () { send("/api/ev", { p: location.pathname, e: "apoio-clique" }); });
    } else {
      a.href = "#"; a.title = "Pré-visualização: falta o link do Ko-fi";
      a.addEventListener("click", function (e) { e.preventDefault(); });
    }
    var before = foot.querySelector(".idiomas");
    if (before && before.parentNode === foot) foot.insertBefore(a, before); else foot.appendChild(a);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addSupport); else addSupport();

  // ---- Estatística anônima ----
  if (!navigator.sendBeacon || location.protocol !== "https:") return;
  var ref = "";
  try { if (document.referrer) { var h = new URL(document.referrer).hostname; if (h !== location.hostname) ref = h; } } catch (e) {}
  send("/api/hit", { p: location.pathname, r: ref });
  var errs = 0;
  function err(m) { if (errs++ < 3) send("/api/err", { p: location.pathname, m: String(m || "?").slice(0, 200) }); }
  addEventListener("error", function (e) { err(e && e.message); });
  addEventListener("unhandledrejection", function (e) { err(e && e.reason && e.reason.message); });
  document.addEventListener("play", function (e) {
    if (e.target && e.target.tagName === "VIDEO" && !e.target.__s) { e.target.__s = 1; send("/api/ev", { p: location.pathname, e: "play-video" }); }
  }, true);
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest && e.target.closest("a[href]");
    if (a && /spotify\.com|music\.apple\.com|music\.youtube\.com|music\.amazon\.|deezer\.com|tidal\.com|distrokid\.com/.test(a.href)) send("/api/ev", { p: location.pathname, e: "clique-streaming" });
  }, true);
})();
