// TecLog+ — aviso sutil de pendência/suspensão (reaparece a cada ação)
(function () {
  let estado = null;
  let mensagem = "";
  let aberto = false;

  function fechar() {
    const m = document.getElementById("aviso-pend");
    if (m) m.remove();
    aberto = false;
  }

  function mostrar() {
    if (!estado || estado === "ok" || aberto) return;
    aberto = true;
    const ov = document.createElement("div");
    ov.id = "aviso-pend";
    ov.className = "aviso-overlay";
    ov.innerHTML =
      '<div class="aviso-box">' +
      '<div class="aviso-ic">⚠️</div>' +
      '<div class="aviso-msg"></div>' +
      '<button class="aviso-ok">OK</button>' +
      "</div>";
    ov.querySelector(".aviso-msg").textContent = mensagem;
    document.body.appendChild(ov);
    ov.querySelector(".aviso-ok").addEventListener("click", fechar);
  }

  async function carregarStatus() {
    try {
      const r = await fetch("/api/me");
      if (!r.ok) return;
      const d = await r.json();
      if (d.status) {
        estado = d.status.estado;
        mensagem = d.status.mensagem || "";
      }
      mostrar();
    } catch (e) {}
  }

  // Reaparece após cada AÇÃO de escrita (POST/PATCH/PUT/DELETE)
  const _fetch = window.fetch;
  window.fetch = function (url, opts) {
    const p = _fetch.apply(this, arguments);
    try {
      const u = typeof url === "string" ? url : (url && url.url) || "";
      const m = ((opts && opts.method) || "GET").toUpperCase();
      if (u.indexOf("/api/") === 0 && m !== "GET" && u.indexOf("/api/logout") !== 0) {
        p.then(function () {
          setTimeout(mostrar, 150);
        });
      }
    } catch (e) {}
    return p;
  };

  carregarStatus();
})();
