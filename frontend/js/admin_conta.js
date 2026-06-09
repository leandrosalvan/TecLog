// TecLog+ — Backoffice: minha conta (trocar senha do admin)

function msg(id, texto, tipo) {
  const el = document.getElementById(id);
  el.textContent = texto;
  el.className = "msg show " + tipo;
}

document.getElementById("form-senha").addEventListener("submit", async (e) => {
  e.preventDefault();
  const r = await fetch("/api/admin/senha", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      atual: document.getElementById("s-atual").value,
      nova: document.getElementById("s-nova").value,
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (r.ok) {
    document.getElementById("form-senha").reset();
    msg("msg-senha", "Senha trocada com sucesso! ✅", "ok");
  } else {
    msg("msg-senha", d.erro || "Erro ao trocar senha.", "erro");
  }
});

document.getElementById("btn-sair").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "/";
});
