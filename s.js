/* Estatística anônima da Ametista Seeds: sem cookies, sem armazenamento no aparelho, sem identificador.
   Envia só: página vista, domínio de onde veio a visita, erros técnicos e alguns cliques (vídeo, streaming). */
(function () {
  if (!navigator.sendBeacon || location.protocol !== "https:") return;
  function send(ep, data) {
    try { navigator.sendBeacon(ep, new Blob([JSON.stringify(data)], { type: "application/json" })); } catch (e) {}
  }
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
