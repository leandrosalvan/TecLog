// TecLog+ — menu lateral (drawer) da Home
// Reúne as opções que antes ficavam no painel + "Sair".
const MENU_ITENS = {
  terceirizado: [
    { ic: "👥", ti: "Expandir equipe", href: "/equipe" },
    { ic: "⚙️", ti: "Valores", href: "/valores" },
    { ic: "🔔", ti: "Notificações", href: "/notificacoes" },
    { ic: "👤", ti: "Meus dados", href: "/perfil" },
  ],
  quarteirizado: [
    { ic: "🔔", ti: "Notificações", href: "/notificacoes" },
    { ic: "👤", ti: "Meus dados", href: "/perfil" },
  ],
};

function abrirDrawer() {
  document.getElementById("drawer").classList.add("aberto");
  document.getElementById("drawer-overlay").classList.add("aberto");
}

function fecharDrawer() {
  document.getElementById("drawer").classList.remove("aberto");
  document.getElementById("drawer-overlay").classList.remove("aberto");
}

async function initMenu() {
  const resp = await fetch("/api/me");
  if (!resp.ok) {
    window.location.href = "/";
    return;
  }
  const u = await resp.json();
  document.getElementById("drawer-nome").textContent = "Olá, " + u.nome.split(" ")[0] + "!";
  document.getElementById("drawer-email").textContent = u.email;
  const badge = document.getElementById("drawer-papel");
  if (u.papel === "terceirizado") {
    badge.style.display = "none";        // dono da conta: sem rótulo
  } else {
    badge.textContent = "Técnico";
  }

  const cont = document.getElementById("drawer-itens");
  cont.innerHTML = "";
  (MENU_ITENS[u.papel] || []).forEach((m) => {
    const a = document.createElement("a");
    a.className = "drawer-item";
    a.href = m.href;
    a.dataset.titulo = m.ti;
    a.innerHTML =
      '<span class="di-ic">' + m.ic + "</span>" +
      '<span class="di-ti">' + m.ti + "</span>";
    cont.appendChild(a);
  });

  // Badge de notificações pendentes (no item e um ponto no botão do menu)
  try {
    const c = await (await fetch("/api/notificacoes/contagem")).json();
    if (c.pendentes > 0) {
      const item = document.querySelector('.drawer-item[data-titulo="Notificações"]');
      if (item) {
        const b = document.createElement("span");
        b.className = "badge-num";
        b.textContent = c.pendentes;
        item.appendChild(b);
      }
      const dot = document.getElementById("menu-dot");
      if (dot) dot.style.display = "block";
    }
  } catch (e) {}
}

document.getElementById("btn-menu").addEventListener("click", abrirDrawer);
document.getElementById("drawer-fechar").addEventListener("click", fecharDrawer);
document.getElementById("drawer-overlay").addEventListener("click", fecharDrawer);

document.getElementById("btn-sair").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "/";
});

initMenu();
