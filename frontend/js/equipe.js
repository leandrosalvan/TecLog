// TecLog+ — Expandir equipe (perfis + técnicos)

function msg(id, texto, tipo) {
  const el = document.getElementById(id);
  el.textContent = texto;
  el.className = "msg show " + tipo;
}

async function getJSON(url) {
  const r = await fetch(url);
  return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
}
async function postJSON(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: r.ok, data: await r.json().catch(() => ({})) };
}

async function carregar() {
  const { ok, status, data } = await getJSON("/api/equipe");
  if (!ok) {
    if (status === 401) window.location.href = "/";
    return;
  }

  // ---- Select de perfis no form de técnico (exclui o seu perfil principal) ----
  const sel = document.getElementById("tec-perfil");
  sel.innerHTML = "";
  const atribuiveis = data.perfis.filter((p) => !p.principal);
  if (atribuiveis.length === 0) {
    const o = document.createElement("option");
    o.value = "";
    o.textContent = "— crie um perfil acima primeiro —";
    sel.appendChild(o);
  } else {
    atribuiveis.forEach((p) => {
      const o = document.createElement("option");
      o.value = p.id;
      o.textContent = p.descricao || "(sem título)";
      sel.appendChild(o);
    });
  }

  // ---- Técnicos ----
  const ulT = document.getElementById("lista-tecnicos");
  ulT.innerHTML = "";
  if (data.tecnicos.length === 0) {
    ulT.innerHTML = '<li class="empty">Nenhum técnico cadastrado ainda.</li>';
  } else {
    data.tecnicos.forEach((t) => {
      const li = document.createElement("li");
      li.className = "list-item";

      const info = document.createElement("div");
      info.className = "li-info";
      info.innerHTML =
        '<div class="li-main">' + t.nome + "</div>" +
        '<div class="li-sub">' + t.email + (t.telefone ? " · 📞 " + t.telefone : "") +
        " · " + (t.perfil_titulo || "sem perfil") + "</div>";

      const acts = document.createElement("div");
      acts.className = "li-actions";

      const bEd = document.createElement("button");
      bEd.className = "btn-act editar";
      bEd.textContent = "Editar";
      bEd.addEventListener("click", () => modoEdicaoTecnico(li, t, atribuiveis));
      acts.appendChild(bEd);

      const bEx = document.createElement("button");
      bEx.className = "btn-act excluir";
      bEx.textContent = "Excluir";
      bEx.addEventListener("click", () => excluirTecnico(t));
      acts.appendChild(bEx);

      li.appendChild(info);
      li.appendChild(acts);
      ulT.appendChild(li);
    });
  }
}

// Editar um técnico (inline: nome, e-mail, perfil e senha opcional)
function modoEdicaoTecnico(li, t, perfis) {
  li.classList.add("editing");
  li.innerHTML = "";

  const nome = document.createElement("input");
  nome.className = "edit-input";
  nome.type = "text";
  nome.value = t.nome;
  nome.placeholder = "Nome";

  const email = document.createElement("input");
  email.className = "edit-input";
  email.type = "email";
  email.value = t.email;
  email.placeholder = "E-mail";

  const tel = document.createElement("input");
  tel.className = "edit-input";
  tel.type = "tel";
  tel.value = t.telefone || "";
  tel.placeholder = "Telefone / contato";

  const sel = document.createElement("select");
  sel.className = "edit-input";
  perfis.forEach((p) => {
    const o = document.createElement("option");
    o.value = p.id;
    o.textContent = p.descricao || "(sem título)";
    if (p.id === t.perfil_id) o.selected = true;
    sel.appendChild(o);
  });

  const senha = document.createElement("input");
  senha.className = "edit-input";
  senha.type = "text";
  senha.value = "";
  senha.placeholder = "Nova senha (em branco = manter)";

  const salvar = document.createElement("button");
  salvar.className = "btn-act salvar";
  salvar.textContent = "Salvar";
  salvar.addEventListener("click", async () => {
    const body = {
      nome: nome.value,
      email: email.value,
      telefone: tel.value || null,
      perfil_id: sel.value ? Number(sel.value) : null,
    };
    if (senha.value.trim()) body.senha = senha.value;
    const r = await fetch("/api/equipe/" + t.id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      msg("msg-tecnico", "Técnico atualizado.", "ok");
      carregar();
    } else {
      const d = await r.json().catch(() => ({}));
      msg("msg-tecnico", d.erro || "Erro ao salvar.", "erro");
    }
  });

  const cancelar = document.createElement("button");
  cancelar.className = "btn-act";
  cancelar.textContent = "Cancelar";
  cancelar.addEventListener("click", carregar);

  li.appendChild(nome);
  li.appendChild(email);
  li.appendChild(tel);
  li.appendChild(sel);
  li.appendChild(senha);
  li.appendChild(salvar);
  li.appendChild(cancelar);
  nome.focus();
}

// Excluir um técnico (com confirmação)
async function excluirTecnico(t) {
  if (!confirm('Excluir o técnico "' + t.nome + '"?')) return;
  const r = await fetch("/api/equipe/" + t.id, { method: "DELETE" });
  if (r.ok) {
    msg("msg-tecnico", "Técnico excluído.", "ok");
    carregar();
  } else {
    const d = await r.json().catch(() => ({}));
    msg("msg-tecnico", d.erro || "Erro ao excluir.", "erro");
  }
}

// Adicionar técnico
document.getElementById("form-tecnico").addEventListener("submit", async (e) => {
  e.preventDefault();
  const perfilVal = document.getElementById("tec-perfil").value;
  const { ok, data } = await postJSON("/api/equipe", {
    nome: document.getElementById("tec-nome").value,
    email: document.getElementById("tec-email").value,
    telefone: document.getElementById("tec-tel").value || null,
    senha: document.getElementById("tec-senha").value,
    perfil_id: perfilVal ? Number(perfilVal) : null,
  });
  if (ok) {
    document.getElementById("form-tecnico").reset();
    msg("msg-tecnico", "Técnico adicionado com sucesso!", "ok");
    carregar();
  } else {
    msg("msg-tecnico", data.erro || "Erro ao adicionar técnico.", "erro");
  }
});

document.getElementById("btn-sair").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "/";
});

carregar();
