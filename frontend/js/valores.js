// TecLog+ — Aba de Valores (classes de serviço + matriz classe × perfil)

function msg(id, texto, tipo) {
  const el = document.getElementById(id);
  el.textContent = texto;
  el.className = "msg show " + tipo;
}

// ---------- Perfis de pagamento ----------
function renderPerfis(perfis) {
  const ulP = document.getElementById("lista-perfis");
  ulP.innerHTML = "";
  (perfis || []).forEach((p, i) => {
    const li = document.createElement("li");
    li.className = "list-item";

    const info = document.createElement("div");
    info.className = "li-info";
    info.innerHTML =
      '<div class="li-main">' + (p.descricao || "(sem título)") +
      (p.principal ? " (você)" : "") + "</div>";

    const actions = document.createElement("div");
    actions.className = "li-actions";

    if (!p.principal) {
      const up = document.createElement("button");
      up.className = "btn-act seta"; up.textContent = "↑"; up.title = "Subir";
      up.disabled = i === 1;
      up.addEventListener("click", () => moverPerfil(p, "subir"));
      actions.appendChild(up);
      const down = document.createElement("button");
      down.className = "btn-act seta"; down.textContent = "↓"; down.title = "Descer";
      down.disabled = i === perfis.length - 1;
      down.addEventListener("click", () => moverPerfil(p, "descer"));
      actions.appendChild(down);
    }

    const ed = document.createElement("button");
    ed.className = "btn-act editar"; ed.textContent = "Editar";
    ed.addEventListener("click", () => modoEdicaoPerfil(li, p));
    actions.appendChild(ed);

    if (!p.principal) {
      const ex = document.createElement("button");
      ex.className = "btn-act excluir"; ex.textContent = "Excluir";
      ex.addEventListener("click", () => excluirPerfil(p));
      actions.appendChild(ex);
    }

    li.appendChild(info);
    li.appendChild(actions);
    ulP.appendChild(li);
  });
}

function modoEdicaoPerfil(li, p) {
  li.classList.add("editing");
  li.innerHTML = "";
  const input = document.createElement("input");
  input.className = "edit-input"; input.value = p.descricao || ""; input.placeholder = "Título do perfil";
  const salvar = document.createElement("button");
  salvar.className = "btn-act salvar"; salvar.textContent = "Salvar";
  salvar.addEventListener("click", async () => {
    const r = await fetch("/api/perfis/" + p.id, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titulo: input.value }),
    });
    if (r.ok) { msg("msg-perfil", "Perfil atualizado.", "ok"); carregar(); }
    else { const d = await r.json().catch(() => ({})); msg("msg-perfil", d.erro || "Erro ao salvar.", "erro"); }
  });
  const cancelar = document.createElement("button");
  cancelar.className = "btn-act"; cancelar.textContent = "Cancelar";
  cancelar.addEventListener("click", carregar);
  li.appendChild(input); li.appendChild(salvar); li.appendChild(cancelar);
  input.focus();
}

async function excluirPerfil(p) {
  if (!confirm('Excluir o perfil "' + (p.descricao || "sem título") + '"?')) return;
  const r = await fetch("/api/perfis/" + p.id, { method: "DELETE" });
  if (r.ok) { msg("msg-perfil", "Perfil excluído.", "ok"); carregar(); }
  else { const d = await r.json().catch(() => ({})); msg("msg-perfil", d.erro || "Erro ao excluir.", "erro"); }
}

async function moverPerfil(p, direcao) {
  const r = await fetch("/api/perfis/" + p.id + "/mover", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ direcao: direcao }),
  });
  if (r.ok) carregar();
  else { const d = await r.json().catch(() => ({})); msg("msg-perfil", d.erro || "Erro ao mover.", "erro"); }
}

async function carregar() {
  const r = await fetch("/api/valores");
  if (!r.ok) {
    if (r.status === 401) window.location.href = "/";
    return;
  }
  const data = await r.json();
  renderPerfis(data.perfis);
  const matriz = document.getElementById("matriz");
  matriz.innerHTML = "";

  if (data.classes.length === 0) {
    matriz.innerHTML =
      '<div class="section"><p class="empty">Nenhuma classe de serviço ainda. Crie uma acima.</p></div>';
    document.getElementById("btn-salvar").style.display = "none";
    return;
  }

  data.classes.forEach((cls) => {
    const card = document.createElement("div");
    card.className = "section";

    // Cabeçalho da classe (nome + editar/excluir)
    const head = document.createElement("div");
    head.className = "classe-head";

    const titulo = document.createElement("h3");
    titulo.textContent = cls.nome;

    const acts = document.createElement("div");
    acts.className = "li-actions";
    const bEd = document.createElement("button");
    bEd.className = "btn-act editar";
    bEd.textContent = "Editar";
    bEd.addEventListener("click", () => editarClasse(head, cls, titulo));
    const bEx = document.createElement("button");
    bEx.className = "btn-act excluir";
    bEx.textContent = "Excluir";
    bEx.addEventListener("click", () => excluirClasse(cls));
    acts.appendChild(bEd);
    acts.appendChild(bEx);

    head.appendChild(titulo);
    head.appendChild(acts);
    card.appendChild(head);

    // Uma linha por perfil, com input de valor
    const valoresClasse = data.valores[String(cls.id)] || {};
    data.perfis.forEach((p) => {
      const row = document.createElement("div");
      row.className = "valor-row";

      const lab = document.createElement("label");
      lab.textContent = (p.descricao || "(sem título)") + (p.principal ? " (você)" : "");

      const field = document.createElement("div");
      field.className = "valor-field";
      const cifra = document.createElement("span");
      cifra.textContent = "R$";
      const inp = document.createElement("input");
      inp.type = "number";
      inp.step = "0.01";
      inp.min = "0";
      inp.className = "valor-input";
      inp.value = valoresClasse[String(p.id)] != null ? valoresClasse[String(p.id)] : 0;
      inp.dataset.classe = cls.id;
      inp.dataset.perfil = p.id;

      field.appendChild(cifra);
      field.appendChild(inp);
      row.appendChild(lab);
      row.appendChild(field);
      card.appendChild(row);
    });

    matriz.appendChild(card);
  });

  document.getElementById("btn-salvar").style.display = "block";
}

// Editar nome da classe (inline)
function editarClasse(head, cls, tituloEl) {
  head.innerHTML = "";
  const input = document.createElement("input");
  input.className = "edit-input";
  input.value = cls.nome;
  input.placeholder = "Nome da classe";

  const salvar = document.createElement("button");
  salvar.className = "btn-act salvar";
  salvar.textContent = "Salvar";
  salvar.addEventListener("click", async () => {
    const r = await fetch("/api/classes/" + cls.id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: input.value }),
    });
    if (r.ok) {
      msg("msg-valores", "Classe atualizada.", "ok");
      carregar();
    } else {
      const d = await r.json().catch(() => ({}));
      msg("msg-valores", d.erro || "Erro ao salvar.", "erro");
    }
  });

  const cancelar = document.createElement("button");
  cancelar.className = "btn-act";
  cancelar.textContent = "Cancelar";
  cancelar.addEventListener("click", carregar);

  head.appendChild(input);
  head.appendChild(salvar);
  head.appendChild(cancelar);
  input.focus();
}

// Excluir classe
async function excluirClasse(cls) {
  if (!confirm('Excluir a classe "' + cls.nome + '"? Os valores dela serão perdidos.')) return;
  const r = await fetch("/api/classes/" + cls.id, { method: "DELETE" });
  if (r.ok) {
    msg("msg-valores", "Classe excluída.", "ok");
    carregar();
  } else {
    const d = await r.json().catch(() => ({}));
    msg("msg-valores", d.erro || "Erro ao excluir.", "erro");
  }
}

// Criar classe
document.getElementById("form-classe").addEventListener("submit", async (e) => {
  e.preventDefault();
  const nome = document.getElementById("classe-nome").value.trim();
  if (!nome) {
    msg("msg-classe", "Dê um nome à classe.", "erro");
    return;
  }
  const r = await fetch("/api/classes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nome: nome }),
  });
  if (r.ok) {
    document.getElementById("classe-nome").value = "";
    msg("msg-classe", "Classe criada!", "ok");
    carregar();
  } else {
    const d = await r.json().catch(() => ({}));
    msg("msg-classe", d.erro || "Erro ao criar classe.", "erro");
  }
});

// Salvar todos os valores de uma vez
document.getElementById("btn-salvar").addEventListener("click", async () => {
  const inputs = document.querySelectorAll(".valor-input");
  const valores = [];
  inputs.forEach((inp) => {
    valores.push({
      classe_id: Number(inp.dataset.classe),
      perfil_id: Number(inp.dataset.perfil),
      valor: parseFloat(inp.value) || 0,
    });
  });
  const r = await fetch("/api/valores", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ valores: valores }),
  });
  if (r.ok) {
    msg("msg-valores", "Valores salvos com sucesso! ✅", "ok");
  } else {
    const d = await r.json().catch(() => ({}));
    msg("msg-valores", d.erro || "Erro ao salvar valores.", "erro");
  }
});

document.getElementById("form-perfil").addEventListener("submit", async (e) => {
  e.preventDefault();
  const titulo = document.getElementById("perfil-desc").value.trim();
  if (!titulo) { msg("msg-perfil", "Dê um título ao perfil.", "erro"); return; }
  const r = await fetch("/api/perfis", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ titulo: titulo }),
  });
  if (r.ok) {
    document.getElementById("perfil-desc").value = "";
    msg("msg-perfil", "Perfil criado!", "ok");
    carregar();
  } else {
    const d = await r.json().catch(() => ({}));
    msg("msg-perfil", d.erro || "Erro ao criar perfil.", "erro");
  }
});

document.getElementById("btn-sair").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "/";
});

carregar();
