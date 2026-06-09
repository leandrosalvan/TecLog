// TecLog+ — painel inicial
const MENU = {
  terceirizado: [
    { ic: "📝", ti: "Registrar O.S.", de: "Lançar serviço executado", href: "/registrar", soon: false },
    { ic: "📊", ti: "Relatório de Ganhos", de: "Ganhos e O.S. da equipe", href: "/ordens", soon: false },
    { ic: "👥", ti: "Expandir equipe", de: "Gerenciar técnicos", href: "/equipe", soon: false },
    { ic: "⚙️", ti: "Valores", de: "Classe × perfil técnico", href: "/valores", soon: false },
    { ic: "🔔", ti: "Notificações", de: "Avisos da equipe", href: "/notificacoes", soon: false },
    { ic: "👤", ti: "Meus dados", de: "Telefone e contato", href: "/perfil", soon: false },
  ],
  quarteirizado: [
    { ic: "📝", ti: "Registrar O.S.", de: "Lançar serviço executado", href: "/registrar", soon: false },
    { ic: "📊", ti: "Relatório de Ganhos", de: "Minhas O.S. e ganhos", href: "/ordens", soon: false },
    { ic: "🔔", ti: "Notificações", de: "Avisos recebidos", href: "/notificacoes", soon: false },
    { ic: "👤", ti: "Meus dados", de: "Telefone e contato", href: "/perfil", soon: false },
  ],
};

async function carregar() {
  const resp = await fetch("/api/me");
  if (!resp.ok) {
    window.location.href = "/";
    return;
  }
  const u = await resp.json();
  document.getElementById("ola").textContent = "Olá, " + u.nome.split(" ")[0] + "!";
  document.getElementById("email-user").textContent = u.email;
  const badge = document.getElementById("papel-user");
  if (u.papel === "terceirizado") {
    badge.style.display = "none";        // dono da conta: sem rótulo
  } else {
    badge.textContent = "Técnico";
  }

  const menu = document.getElementById("menu");
  (MENU[u.papel] || []).forEach((m) => {
    const card = document.createElement("div");
    card.className = "menu-card" + (m.soon ? " soon" : "");
    card.dataset.titulo = m.ti;
    card.innerHTML =
      '<div class="ic">' + m.ic + "</div>" +
      '<div class="ti">' + m.ti + "</div>" +
      '<div class="de">' + m.de + "</div>";
    if (!m.soon) card.addEventListener("click", () => (window.location.href = m.href));
    menu.appendChild(card);
  });

  // Badge de notificações pendentes
  try {
    const cont = await (await fetch("/api/notificacoes/contagem")).json();
    if (cont.pendentes > 0) {
      const card = document.querySelector('[data-titulo="Notificações"] .ic');
      if (card) {
        const b = document.createElement("span");
        b.className = "badge-num";
        b.textContent = cont.pendentes;
        card.appendChild(b);
      }
    }
  } catch (e) {}
}

document.getElementById("btn-sair").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "/";
});

carregar();
