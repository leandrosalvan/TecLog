// TecLog+ — Notificações (O.S. sinalizada; técnico confirma com o "visto")

function dataBR(s) {
  if (!s) return "";
  const p = s.split(" ")[0].split("-");
  return p[2] + "/" + p[1] + "/" + p[0];
}

async function carregar() {
  const r = await fetch("/api/notificacoes");
  if (!r.ok) {
    if (r.status === 401) window.location.href = "/";
    return;
  }
  const data = await r.json();
  const cont = document.getElementById("lista-notif");
  cont.innerHTML = "";

  if (data.notificacoes.length === 0) {
    cont.innerHTML = '<div class="section"><p class="empty">Você não tem notificações.</p></div>';
    return;
  }

  data.notificacoes.forEach((n) => {
    const card = document.createElement("div");
    card.className = "section notif" + (n.confirmada ? " vista" : "");

    let html =
      '<div class="notif-head">' +
      '<h3>⚠️ ' + n.cliente + "</h3>" +
      '<span class="tag">' + n.classe + "</span></div>" +
      '<p class="notif-meta">O.S. de ' + dataBR(n.data_execucao) +
      (n.de_quem ? " · sinalizada por " + n.de_quem : "") + "</p>" +
      '<p class="notif-desc">' + (n.descricao || "") + "</p>";

    if (n.imagem) {
      html += '<a href="' + n.imagem + '" target="_blank" class="notif-img">' +
        '<img src="' + n.imagem + '" alt="anexo" /></a>';
    }

    if (n.confirmada) {
      html += '<p class="notif-visto">✓ Você confirmou em ' + dataBR(n.confirmada_em) + "</p>";
    } else {
      html += '<button class="btn btn-sm" data-id="' + n.id + '">✓ Marcar como visto</button>';
    }

    card.innerHTML = html;
    cont.appendChild(card);
  });

  // Botões de visto
  document.querySelectorAll("[data-id]").forEach((b) => {
    b.addEventListener("click", async () => {
      b.disabled = true;
      const r = await fetch("/api/notificacoes/" + b.dataset.id + "/visto", { method: "POST" });
      if (r.ok) carregar();
      else b.disabled = false;
    });
  });
}

document.getElementById("btn-sair").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "/";
});

carregar();
