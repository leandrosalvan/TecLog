// TecLog+ — Aba de Valores (classes de serviço + matriz classe × perfil)

function msg(id, texto, tipo) {
  const el = document.getElementById(id);
  el.textContent = texto;
  el.className = "msg show " + tipo;
}

function fmtVal(v) {
  return (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
      (p.principal ? " (você)" : "") +
      (!p.principal && !p.pronto ? ' <span class="status pendente">⚠️ sem valores</span>' : "") +
      "</div>";

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

    if (!p.principal) {
      const ed = document.createElement("button");
      ed.className = "btn-act editar"; ed.textContent = "Editar";
      ed.addEventListener("click", () => modoEdicaoPerfil(li, p));
      actions.appendChild(ed);

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

// ---------- Matriz de valores: um card por classe (travado; "Editar" libera) ----------
function buildClasseCard(cls, perfis, valoresClasse) {
  const card = document.createElement("div");
  card.className = "section";

  // ---- Modo visualização (valores só leitura) ----
  function renderView() {
    card.innerHTML = "";
    const head = document.createElement("div");
    head.className = "classe-head";
    const titulo = document.createElement("h3");
    titulo.textContent = cls.nome;
    const acts = document.createElement("div");
    acts.className = "li-actions";
    const bEd = document.createElement("button");
    bEd.className = "btn-act editar"; bEd.textContent = "Editar";
    bEd.addEventListener("click", renderEdit);
    const bEx = document.createElement("button");
    bEx.className = "btn-act excluir"; bEx.textContent = "Excluir";
    bEx.addEventListener("click", () => excluirClasse(cls));
    acts.appendChild(bEd); acts.appendChild(bEx);
    head.appendChild(titulo); head.appendChild(acts);
    card.appendChild(head);

    perfis.forEach((p) => {
      const row = document.createElement("div");
      row.className = "valor-row";
      const lab = document.createElement("label");
      lab.textContent = (p.descricao || "(sem título)") + (p.principal ? " (você)" : "");
      const v = valoresClasse[String(p.id)] != null ? valoresClasse[String(p.id)] : 0;
      const view = document.createElement("div");
      view.className = "valor-view" + (Number(v) ? "" : " zero");
      view.textContent = "R$ " + fmtVal(v);
      row.appendChild(lab); row.appendChild(view);
      card.appendChild(row);
    });

    const domV = Number(cls.adicional_domingo) || 0;
    const rowDom = document.createElement("div");
    rowDom.className = "valor-row dom-row";
    const labDom = document.createElement("label");
    labDom.innerHTML = '🗓️ Domingo <span class="dom-hint">(extra por tarefa)</span>';
    const viewDom = document.createElement("div");
    viewDom.className = "valor-view" + (domV ? "" : " zero");
    viewDom.textContent = "+R$ " + fmtVal(domV);
    rowDom.appendChild(labDom); rowDom.appendChild(viewDom);
    card.appendChild(rowDom);
  }

  // ---- Modo edição (nome + valores; setas de R$5) ----
  function renderEdit() {
    card.innerHTML = "";
    const head = document.createElement("div");
    head.className = "classe-head";
    const nomeInp = document.createElement("input");
    nomeInp.className = "edit-input"; nomeInp.value = cls.nome; nomeInp.placeholder = "Nome da classe";
    head.appendChild(nomeInp);
    card.appendChild(head);

    const inputs = [];
    perfis.forEach((p) => {
      const row = document.createElement("div");
      row.className = "valor-row";
      const lab = document.createElement("label");
      lab.textContent = (p.descricao || "(sem título)") + (p.principal ? " (você)" : "");
      const field = document.createElement("div");
      field.className = "valor-field";
      const cifra = document.createElement("span"); cifra.textContent = "R$";
      const inp = document.createElement("input");
      inp.type = "number"; inp.step = "5"; inp.min = "0"; inp.className = "valor-input";
      inp.value = valoresClasse[String(p.id)] != null ? valoresClasse[String(p.id)] : 0;
      inp.dataset.perfil = p.id;
      inputs.push(inp);
      field.appendChild(cifra); field.appendChild(inp);
      row.appendChild(lab); row.appendChild(field);
      card.appendChild(row);
    });

    // adicional de domingo (extra por tarefa, vale pra classe inteira)
    const rowDom = document.createElement("div");
    rowDom.className = "valor-row dom-row";
    const labDom = document.createElement("label");
    labDom.innerHTML = '🗓️ Domingo <span class="dom-hint">(extra por tarefa)</span>';
    const fieldDom = document.createElement("div");
    fieldDom.className = "valor-field";
    const cifraDom = document.createElement("span"); cifraDom.textContent = "+R$";
    const domInp = document.createElement("input");
    domInp.type = "number"; domInp.step = "5"; domInp.min = "0"; domInp.className = "valor-input";
    domInp.value = cls.adicional_domingo != null ? cls.adicional_domingo : 0;
    fieldDom.appendChild(cifraDom); fieldDom.appendChild(domInp);
    rowDom.appendChild(labDom); rowDom.appendChild(fieldDom);
    card.appendChild(rowDom);

    const acts = document.createElement("div");
    acts.className = "li-actions"; acts.style.marginTop = "10px";
    const bSave = document.createElement("button");
    bSave.className = "btn-act salvar"; bSave.textContent = "Salvar";
    bSave.addEventListener("click", async () => {
      // 1) nome + adicional de domingo da classe
      const rn = await fetch("/api/classes/" + cls.id, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nomeInp.value.trim() || cls.nome, adicional_domingo: domInp.value || 0 }),
      });
      if (!rn.ok) {
        const d = await rn.json().catch(() => ({}));
        msg("msg-valores", d.erro || "Erro ao salvar a classe.", "erro");
        return;
      }
      // 2) valores da classe
      const valores = inputs.map((inp) => ({
        classe_id: cls.id,
        perfil_id: Number(inp.dataset.perfil),
        valor: parseFloat(inp.value) || 0,
      }));
      const r = await fetch("/api/valores", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valores: valores }),
      });
      if (r.ok) { msg("msg-valores", "Valores salvos com sucesso! ✅", "ok"); carregar(); }
      else { const d = await r.json().catch(() => ({})); msg("msg-valores", d.erro || "Erro ao salvar valores.", "erro"); }
    });
    const bCancel = document.createElement("button");
    bCancel.className = "btn-act"; bCancel.textContent = "Cancelar";
    bCancel.addEventListener("click", renderView);
    acts.appendChild(bSave); acts.appendChild(bCancel);
    card.appendChild(acts);
    nomeInp.focus();
  }

  renderView();
  return card;
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
    return;
  }
  data.classes.forEach((cls) => {
    const valoresClasse = data.valores[String(cls.id)] || {};
    matriz.appendChild(buildClasseCard(cls, data.perfis, valoresClasse));
  });
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
    msg("msg-classe", "Classe criada! Clique em Editar nela para definir os valores.", "ok");
    carregar();
  } else {
    const d = await r.json().catch(() => ({}));
    msg("msg-classe", d.erro || "Erro ao criar classe.", "erro");
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
    msg("msg-perfil", "Perfil criado! Clique em Editar numa classe para definir os valores dele.", "ok");
    carregar();
  } else {
    const d = await r.json().catch(() => ({}));
    msg("msg-perfil", d.erro || "Erro ao criar perfil.", "erro");
  }
});

// Reajustar valores das O.S. já lançadas (perfil atual + valores atuais)
document.getElementById("btn-reajustar").addEventListener("click", async () => {
  if (!confirm("Reajustar os valores de TODAS as O.S. já lançadas com base no perfil atual de cada técnico e na tabela de valores atual?\n\nIsso atualiza os relatórios.")) return;
  const el = document.getElementById("msg-reajuste");
  el.textContent = "Reajustando…"; el.className = "msg show ok";
  const r = await fetch("/api/os/reajustar", { method: "POST" });
  const d = await r.json().catch(() => ({}));
  if (r.ok) {
    el.textContent = "✅ " + d.atualizadas + " O.S. reajustadas pelo perfil atual.";
    el.className = "msg show ok";
  } else {
    el.textContent = d.erro || "Erro ao reajustar.";
    el.className = "msg show erro";
  }
});

document.getElementById("btn-sair").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "/";
});

carregar();
