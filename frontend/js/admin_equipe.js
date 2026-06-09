// TecLog+ — Backoffice: equipe de um cliente (ver técnicos, buscar, editar)

let TECNICOS = [];
let CLIENTE = null;

function getCid() {
  return new URLSearchParams(window.location.search).get("cliente");
}

async function carregar() {
  const cid = getCid();
  if (!cid) {
    window.location.href = "/admin";
    return;
  }
  const r = await fetch("/api/admin/clientes/" + cid + "/equipe");
  if (!r.ok) {
    if (r.status === 401 || r.status === 403) window.location.href = "/";
    else document.getElementById("titulo").textContent = "Cliente não encontrado";
    return;
  }
  const data = await r.json();
  CLIENTE = data.cliente;
  TECNICOS = data.tecnicos;
  document.getElementById("titulo").textContent = "Equipe de " + CLIENTE.nome;
  document.getElementById("subtitulo").textContent =
    CLIENTE.email + (CLIENTE.telefone ? " · 📞 " + CLIENTE.telefone : "");
  document.title = "TecLog+ · Equipe de " + CLIENTE.nome;
  aplicarFiltro();
}

function aplicarFiltro() {
  const t = (document.getElementById("busca-tec").value || "").trim().toLowerCase();
  const lista = !t ? TECNICOS : TECNICOS.filter((x) =>
    (x.nome || "").toLowerCase().includes(t) ||
    (x.email || "").toLowerCase().includes(t) ||
    (x.telefone || "").toLowerCase().includes(t)
  );
  render(lista);
}

function render(lista) {
  const ul = document.getElementById("lista-tec");
  ul.innerHTML = "";
  document.getElementById("resumo-tec").textContent =
    lista.length + (lista.length === 1 ? " técnico" : " técnicos");

  if (lista.length === 0) {
    ul.innerHTML = '<li class="empty">Nenhum técnico encontrado.</li>';
    return;
  }

  lista.forEach((t) => {
    const li = document.createElement("li");
    li.className = "cliente-card";
    li.innerHTML =
      '<div class="li-main">' + t.nome + "</div>" +
      '<div class="li-sub">' + t.email + (t.telefone ? " · 📞 " + t.telefone : "") + "</div>" +
      '<div class="li-sub">' + (t.perfil_titulo || "sem perfil") + "</div>";

    const acts = document.createElement("div");
    acts.className = "acts-row";
    const bEd = document.createElement("button");
    bEd.className = "btn-act editar";
    bEd.textContent = "Editar";
    bEd.addEventListener("click", () => modoEdicao(li, t));
    acts.appendChild(bEd);

    li.appendChild(acts);
    ul.appendChild(li);
  });
}

function campo(label, el) {
  const w = document.createElement("div");
  w.style.marginTop = "8px";
  const l = document.createElement("label");
  l.textContent = label;
  l.style.margin = "0 0 4px";
  w.appendChild(l);
  w.appendChild(el);
  return w;
}

function modoEdicao(li, t) {
  li.innerHTML = "";

  const nome = document.createElement("input");
  nome.className = "edit-input"; nome.type = "text"; nome.value = t.nome;

  const email = document.createElement("input");
  email.className = "edit-input"; email.type = "email"; email.value = t.email; email.disabled = true;

  const tel = document.createElement("input");
  tel.className = "edit-input"; tel.type = "tel"; tel.value = t.telefone || ""; tel.placeholder = "Telefone / contato";

  const senha = document.createElement("input");
  senha.className = "edit-input"; senha.type = "text"; senha.placeholder = "Nova senha (em branco = manter)";

  li.appendChild(campo("Nome", nome));
  li.appendChild(campo("E-mail (login) — só leitura", email));
  li.appendChild(campo("Telefone / contato", tel));
  li.appendChild(campo("Nova senha", senha));

  const acts = document.createElement("div");
  acts.className = "acts-row";
  const salvar = document.createElement("button");
  salvar.className = "btn-act salvar"; salvar.textContent = "Salvar";
  salvar.addEventListener("click", async () => {
    const body = { nome: nome.value, telefone: tel.value || null };
    if (senha.value.trim()) body.senha = senha.value;
    const r = await fetch("/api/admin/tecnicos/" + t.id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) carregar();
    else { const d = await r.json().catch(() => ({})); alert(d.erro || "Erro ao salvar."); }
  });
  const cancelar = document.createElement("button");
  cancelar.className = "btn-act"; cancelar.textContent = "Cancelar";
  cancelar.addEventListener("click", carregar);
  acts.appendChild(salvar);
  acts.appendChild(cancelar);
  li.appendChild(acts);
}

document.getElementById("busca-tec").addEventListener("input", aplicarFiltro);
document.getElementById("btn-sair").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "/";
});

carregar();
