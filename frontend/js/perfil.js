// TecLog+ — Meus dados (o próprio usuário edita o telefone)

function msg(texto, tipo) {
  const el = document.getElementById("msg-perfil");
  el.textContent = texto;
  el.className = "msg show " + tipo;
}

async function carregar() {
  const r = await fetch("/api/perfil");
  if (!r.ok) {
    if (r.status === 401) window.location.href = "/";
    return;
  }
  const u = await r.json();
  document.getElementById("p-nome").value = u.nome || "";
  document.getElementById("p-email").value = u.email || "";
  document.getElementById("p-tel").value = u.telefone || "";
}

document.getElementById("form-perfil").addEventListener("submit", async (e) => {
  e.preventDefault();
  const r = await fetch("/api/perfil", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telefone: document.getElementById("p-tel").value || null }),
  });
  const d = await r.json().catch(() => ({}));
  if (r.ok) {
    msg("Telefone atualizado! ✅", "ok");
  } else {
    msg(d.erro || "Não foi possível salvar.", "erro");
  }
});

document.getElementById("btn-sair").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "/";
});

carregar();
