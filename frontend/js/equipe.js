// TecLog+ — Expandir equipe (perfis + técnicos)

function msg(id, texto, tipo) {
  const el = document.getElementById(id);
  el.textContent = texto;
  el.className = "msg show " + tipo;
}

function setFormHabilitado(form, on) {
  form.querySelectorAll("input, select, button").forEach((el) => { el.disabled = !on; });
  form.style.opacity = on ? "1" : ".55";
}

let DOMINIO = "";

function slug(s) {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
// Inicial de todos os nomes + último por inteiro
function localEmail(nome, sobrenome) {
  const partes = ((nome || "") + " " + (sobrenome || "")).trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "";
  if (partes.length === 1) return slug(partes[0]);
  return partes.slice(0, -1).map((p) => slug(p).slice(0, 1)).join("") + slug(partes[partes.length - 1]);
}
function atualizarPreviewEmail() {
  const lp = localEmail(document.getElementById("tec-nome").value, document.getElementById("tec-sobrenome").value);
  document.getElementById("tec-email").value = (lp && DOMINIO) ? (lp + "@" + DOMINIO) : "";
}
// Divide "Nome completo" em nome (1ª palavra) + sobrenome (resto)
function splitNome(full) {
  const p = (full || "").trim().split(/\s+/).filter(Boolean);
  return { nome: p[0] || "", sobrenome: p.slice(1).join(" ") };
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
  DOMINIO = data.dominio || "";

  // ---- Select de perfis: só perfis PRONTOS (com ≥1 valor > 0), exclui o principal ----
  const sel = document.getElementById("tec-perfil");
  const trava = document.getElementById("trava-perfil");
  const form = document.getElementById("form-tecnico");
  sel.innerHTML = "";
  const atribuiveis = data.perfis.filter((p) => !p.principal);
  const prontos = atribuiveis.filter((p) => p.pronto);

  if (prontos.length === 0) {
    trava.style.display = "block";
    trava.innerHTML =
      atribuiveis.length === 0
        ? '⚠️ Antes de adicionar técnicos, crie um <strong>perfil</strong> e defina os <strong>valores</strong> dele na aba <a href="/valores">💰 Valores</a>.'
        : '⚠️ Você tem perfis, mas nenhum com valores definidos. Defina ao menos um valor de um perfil na aba <a href="/valores">💰 Valores</a> para liberar o cadastro de técnicos.';
    const o = document.createElement("option");
    o.value = "";
    o.textContent = "— nenhum perfil pronto —";
    sel.appendChild(o);
    setFormHabilitado(form, false);
  } else {
    trava.style.display = "none";
    prontos.forEach((p) => {
      const o = document.createElement("option");
      o.value = p.id;
      o.textContent = p.descricao || "(sem título)";
      sel.appendChild(o);
    });
    setFormHabilitado(form, true);
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
      bEd.addEventListener("click", () => modoEdicaoTecnico(li, t, prontos));
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

// Editar um técnico (inline). E-mail fixo/cinza com botão "Redefinir e-mail".
function modoEdicaoTecnico(li, t, perfis) {
  li.classList.add("editing");
  li.innerHTML = "";

  const partes = splitNome(t.nome);
  const nome = document.createElement("input");
  nome.className = "edit-input"; nome.type = "text"; nome.value = partes.nome; nome.placeholder = "Nome";

  const sobre = document.createElement("input");
  sobre.className = "edit-input"; sobre.type = "text"; sobre.value = partes.sobrenome; sobre.placeholder = "Sobrenome";

  const dom = t.email.split("@")[1] || "";
  const email = document.createElement("input");
  email.className = "edit-input auto"; email.type = "text"; email.value = t.email; email.readOnly = true;
  let regenerar = false;
  const bRedef = document.createElement("button");
  bRedef.type = "button"; bRedef.className = "btn-act"; bRedef.textContent = "Redefinir e-mail";
  bRedef.addEventListener("click", () => {
    regenerar = true;
    const lp = localEmail(nome.value, sobre.value); // relê o nome e regenera pela regra de criação
    email.value = (lp || "?") + "@" + dom; // prévia; nº de conflito é resolvido ao salvar
    bRedef.textContent = "✓ e-mail será regerado";
  });

  const tel = document.createElement("input");
  tel.className = "edit-input";
  tel.type = "tel";
  tel.value = t.telefone || "";
  tel.placeholder = "Telefone / contato";

  const sel = document.createElement("select");
  sel.className = "edit-input";
  // Mantém o perfil atual do técnico como opção (mesmo sem valores definidos)
  const atualNaoPronto = t.perfil_id && !perfis.some((p) => p.id === t.perfil_id);
  if (!t.perfil_id) {
    const o = document.createElement("option");
    o.value = ""; o.textContent = "— sem perfil (manter) —"; o.selected = true;
    sel.appendChild(o);
  }
  if (atualNaoPronto) {
    const o = document.createElement("option");
    o.value = t.perfil_id;
    o.textContent = (t.perfil_titulo || "(sem título)") + " — atual (sem valores)";
    o.selected = true;
    sel.appendChild(o);
  }
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
      sobrenome: sobre.value,
      telefone: tel.value || null,
      perfil_id: sel.value ? Number(sel.value) : null,
    };
    if (regenerar) body.regenerar_email = true;
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
  li.appendChild(sobre);
  li.appendChild(email);
  li.appendChild(bRedef);
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
document.getElementById("tec-nome").addEventListener("input", atualizarPreviewEmail);
document.getElementById("tec-sobrenome").addEventListener("input", atualizarPreviewEmail);

document.getElementById("form-tecnico").addEventListener("submit", async (e) => {
  e.preventDefault();
  const perfilVal = document.getElementById("tec-perfil").value;
  const { ok, data } = await postJSON("/api/equipe", {
    nome: document.getElementById("tec-nome").value,
    sobrenome: document.getElementById("tec-sobrenome").value,
    telefone: document.getElementById("tec-tel").value || null,
    senha: document.getElementById("tec-senha").value,
    perfil_id: perfilVal ? Number(perfilVal) : null,
  });
  if (ok) {
    document.getElementById("form-tecnico").reset();
    document.getElementById("tec-senha").value = "123456";
    document.getElementById("tec-email").value = "";
    msg("msg-tecnico", "Técnico criado! Login: " + data.email, "ok");
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
