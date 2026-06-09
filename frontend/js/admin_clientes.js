// TecLog+ — Backoffice: clientes (criar, listar, buscar, editar, suspender, excluir)

const LIMITE_PADRAO = {
  Starter: 5, Standard: 10, Advanced: 20, Professional: 30,
  Premium: 40, Enterprise: "", Teste: 5,
};

function msg(id, texto, tipo) {
  const el = document.getElementById(id);
  el.textContent = texto;
  el.className = "msg show " + tipo;
}
function dataBR(s) {
  if (!s) return "sem vencimento";
  const p = s.split("-");
  return p[2] + "/" + p[1] + "/" + p[0];
}
function slug(s) {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
function localEmail(nome, sobrenome) {
  const partes = ((nome || "") + " " + (sobrenome || "")).trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "";
  if (partes.length === 1) return slug(partes[0]);
  return partes.slice(0, -1).map((p) => slug(p).slice(0, 1)).join("") + slug(partes[partes.length - 1]);
}
function previewEmailLider() {
  const lp = localEmail(document.getElementById("c-nome").value, document.getElementById("c-sobrenome").value);
  const ap = slug(document.getElementById("c-apelido").value);
  document.getElementById("c-email").value = (lp && ap) ? (lp + "@" + ap + ".teclog") : "";
}
function splitNome(full) {
  const p = (full || "").trim().split(/\s+/).filter(Boolean);
  return { nome: p[0] || "", sobrenome: p.slice(1).join(" ") };
}

function planoSelect(idSel, valor) {
  const opts = ["Starter", "Standard", "Advanced", "Professional", "Premium", "Enterprise", "Teste", "Personalizado"];
  return opts.map((o) => '<option value="' + o + '"' + (o === valor ? " selected" : "") + ">" + o + "</option>").join("");
}

let TODOS_CLIENTES = [];

async function carregar() {
  const r = await fetch("/api/admin/clientes");
  if (!r.ok) {
    if (r.status === 401 || r.status === 403) window.location.href = "/";
    return;
  }
  const data = await r.json();
  TODOS_CLIENTES = data.clientes;
  aplicarFiltro();
}

function aplicarFiltro() {
  const t = (document.getElementById("busca-clientes").value || "").trim().toLowerCase();
  const lista = !t ? TODOS_CLIENTES : TODOS_CLIENTES.filter((c) =>
    (c.nome || "").toLowerCase().includes(t) ||
    (c.email || "").toLowerCase().includes(t) ||
    (c.telefone || "").toLowerCase().includes(t)
  );
  renderClientes(lista);
}

function renderClientes(lista) {
  const ul = document.getElementById("lista-clientes");
  ul.innerHTML = "";
  document.getElementById("resumo-clientes").textContent =
    lista.length + (lista.length === 1 ? " cliente" : " clientes");

  if (lista.length === 0) {
    ul.innerHTML = '<li class="empty">Nenhum cliente encontrado.</li>';
    return;
  }

  lista.forEach((c) => {
    const li = document.createElement("li");
    li.className = "cliente-card";

    let st = "ativo", stTxt = "Em dia";
    const a = c.dias_atraso;
    if (!c.ativo) { st = "inativo"; stTxt = "Suspenso (manual)"; }
    else if (c.teste) {
      if (c.estado === "suspenso") { st = "vencido"; stTxt = "Teste expirado"; }
      else { st = "pendente"; stTxt = "Em teste (24h)"; }
    }
    else if (c.estado === "suspenso") { st = "vencido"; stTxt = "Suspenso · " + (a || 0) + "d atraso"; }
    else if (c.estado === "pendente") { st = "pendente"; stTxt = "Pendente · " + (a || 0) + "d atraso"; }
    else if (a != null && a > 0) { stTxt = "Em dia · carência " + a + "d"; }

    const lim = c.limite_tecnicos == null ? "∞" : c.limite_tecnicos;
    li.innerHTML =
      '<div class="li-main">' + c.nome + ' <span class="status ' + st + '">' + stTxt + "</span></div>" +
      '<div class="li-sub">' + c.email + (c.telefone ? " · 📞 " + c.telefone : "") + "</div>" +
      '<div class="li-sub">' + (c.plano || "Sem plano") + " · " + c.tecnicos + "/" + lim +
      " técnicos · vence " + dataBR(c.vencimento) + "</div>";

    const acts = document.createElement("div");
    acts.className = "acts-row";

    const bEq = document.createElement("button");
    bEq.className = "btn-act";
    bEq.textContent = "👥 Equipe (" + c.tecnicos + ")";
    bEq.addEventListener("click", () => window.open("/admin/equipe?cliente=" + c.id, "_blank"));
    acts.appendChild(bEq);

    const bEd = document.createElement("button");
    bEd.className = "btn-act editar";
    bEd.textContent = "Editar";
    bEd.addEventListener("click", () => modoEdicao(li, c));
    acts.appendChild(bEd);

    const bTog = document.createElement("button");
    bTog.className = "btn-act" + (c.ativo ? "" : " salvar");
    bTog.textContent = c.ativo ? "Suspender" : "Reativar";
    bTog.addEventListener("click", () => toggleAtivo(c));
    acts.appendChild(bTog);

    const bEx = document.createElement("button");
    bEx.className = "btn-act excluir";
    bEx.textContent = "Excluir";
    bEx.addEventListener("click", () => excluir(c));
    acts.appendChild(bEx);

    li.appendChild(acts);
    ul.appendChild(li);
  });
}

document.getElementById("busca-clientes").addEventListener("input", aplicarFiltro);

async function toggleAtivo(c) {
  const acao = c.ativo ? "Suspender" : "Reativar";
  if (!confirm(acao + ' o acesso de "' + c.nome + '"?')) return;
  const r = await fetch("/api/admin/clientes/" + c.id, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ativo: !c.ativo }),
  });
  if (r.ok) carregar();
}

async function excluir(c) {
  if (!confirm('EXCLUIR a conta de "' + c.nome + '"?\n\nIsso apaga TUDO (técnicos, O.S., dados) e não tem volta.')) return;
  const r = await fetch("/api/admin/clientes/" + c.id, { method: "DELETE" });
  if (r.ok) carregar();
  else { const d = await r.json().catch(() => ({})); alert(d.erro || "Erro ao excluir."); }
}

function campo(label, el) {
  const wrap = document.createElement("div");
  wrap.style.marginTop = "8px";
  const l = document.createElement("label");
  l.textContent = label;
  l.style.margin = "0 0 4px";
  wrap.appendChild(l);
  wrap.appendChild(el);
  return wrap;
}

function modoEdicao(li, c) {
  li.innerHTML = "";

  const partes = splitNome(c.nome);
  const nome = document.createElement("input");
  nome.className = "edit-input"; nome.type = "text"; nome.value = partes.nome;

  const sobre = document.createElement("input");
  sobre.className = "edit-input"; sobre.type = "text"; sobre.value = partes.sobrenome;

  const apelido = document.createElement("input");
  apelido.className = "edit-input"; apelido.type = "text"; apelido.value = c.apelido || "";
  apelido.placeholder = "Apelido da empresa";

  const domAntigo = (c.email || "").split("@")[1] || "";
  const email = document.createElement("input");
  email.className = "edit-input auto"; email.type = "text"; email.value = c.email || ""; email.readOnly = true;
  let regenerar = false;
  const bRedef = document.createElement("button");
  bRedef.type = "button"; bRedef.className = "btn-act"; bRedef.textContent = "Redefinir e-mail";
  bRedef.addEventListener("click", () => {
    regenerar = true;
    const lp = localEmail(nome.value, sobre.value); // relê o nome e regenera pela regra de criação
    const dom = slug(apelido.value) ? slug(apelido.value) + ".teclog" : domAntigo;
    email.value = (lp || "?") + "@" + dom; // prévia; nº de conflito é resolvido ao salvar
    bRedef.textContent = "✓ e-mail será regerado";
  });
  const emailCampo = campo("E-mail (login)", email);
  emailCampo.appendChild(bRedef);

  const tel = document.createElement("input");
  tel.className = "edit-input"; tel.type = "tel"; tel.value = c.telefone || "";
  tel.placeholder = "Telefone / contato";

  const plano = document.createElement("select");
  plano.className = "edit-input";
  plano.innerHTML = planoSelect("ep", c.plano || "Personalizado");

  const limite = document.createElement("input");
  limite.className = "edit-input"; limite.type = "number"; limite.min = "0";
  limite.value = c.limite_tecnicos == null ? "" : c.limite_tecnicos;
  limite.placeholder = "em branco = sem limite";

  const valor = document.createElement("input");
  valor.className = "edit-input"; valor.type = "number"; valor.min = "0"; valor.step = "0.01";
  valor.value = c.valor_personalizado != null ? c.valor_personalizado : "";
  valor.placeholder = "Valor mensal (R$)";
  const valorCampo = campo("Valor mensal do plano (R$)", valor);
  valorCampo.style.display = plano.value === "Personalizado" ? "" : "none";

  plano.addEventListener("change", () => {
    if (LIMITE_PADRAO[plano.value] != null) limite.value = LIMITE_PADRAO[plano.value];
    valorCampo.style.display = plano.value === "Personalizado" ? "" : "none";
  });

  const venc = document.createElement("input");
  venc.className = "edit-input"; venc.type = "date"; venc.value = c.vencimento || "";

  const senha = document.createElement("input");
  senha.className = "edit-input"; senha.type = "text";
  senha.placeholder = "Nova senha (em branco = manter)";

  li.appendChild(campo("Nome", nome));
  li.appendChild(campo("Sobrenome", sobre));
  li.appendChild(campo("Apelido da empresa", apelido));
  li.appendChild(emailCampo);
  li.appendChild(campo("Telefone / contato", tel));
  li.appendChild(campo("Plano (upgrade)", plano));
  li.appendChild(valorCampo);
  li.appendChild(campo("Limite de técnicos (logins extras)", limite));
  li.appendChild(campo("Vence em", venc));
  li.appendChild(campo("Nova senha", senha));

  const acts = document.createElement("div");
  acts.className = "acts-row";
  const salvar = document.createElement("button");
  salvar.className = "btn-act salvar"; salvar.textContent = "Salvar";
  salvar.addEventListener("click", async () => {
    const body = {
      nome: nome.value,
      sobrenome: sobre.value,
      apelido: apelido.value,
      telefone: tel.value || null,
      plano: plano.value,
      limite_tecnicos: limite.value === "" ? null : Number(limite.value),
      vencimento: venc.value || null,
    };
    if (regenerar) body.regenerar_email = true;
    if (plano.value === "Personalizado") body.valor_personalizado = valor.value || null;
    if (senha.value.trim()) body.senha = senha.value;
    const r = await fetch("/api/admin/clientes/" + c.id, {
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

// Mostra/esconde o campo de valor do plano personalizado (criação)
function toggleValorCriacao(plano) {
  const mostra = plano === "Personalizado";
  document.getElementById("c-valor").style.display = mostra ? "" : "none";
  document.getElementById("c-valor-label").style.display = mostra ? "" : "none";
  if (!mostra) document.getElementById("c-valor").value = "";
}

// Auto-preenche o limite ao escolher o plano (criação) + campo de valor custom
document.getElementById("c-plano").addEventListener("change", function () {
  if (LIMITE_PADRAO[this.value] != null) document.getElementById("c-limite").value = LIMITE_PADRAO[this.value];
  toggleValorCriacao(this.value);
});

["c-nome", "c-sobrenome", "c-apelido"].forEach((id) =>
  document.getElementById(id).addEventListener("input", previewEmailLider));

// Criar cliente
document.getElementById("form-cliente").addEventListener("submit", async (e) => {
  e.preventDefault();
  const limVal = document.getElementById("c-limite").value;
  const planoVal = document.getElementById("c-plano").value;
  const r = await fetch("/api/admin/clientes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nome: document.getElementById("c-nome").value,
      sobrenome: document.getElementById("c-sobrenome").value,
      apelido: document.getElementById("c-apelido").value,
      telefone: document.getElementById("c-tel").value || null,
      senha: document.getElementById("c-senha").value,
      plano: planoVal,
      limite_tecnicos: limVal === "" ? null : Number(limVal),
      vencimento: document.getElementById("c-venc").value || null,
      valor_personalizado: planoVal === "Personalizado" ? (document.getElementById("c-valor").value || null) : null,
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (r.ok) {
    document.getElementById("form-cliente").reset();
    document.getElementById("c-limite").value = 5;
    document.getElementById("c-senha").value = "123456";
    document.getElementById("c-email").value = "";
    toggleValorCriacao(document.getElementById("c-plano").value);
    msg("msg-cliente", "Acesso criado! Login do líder: " + d.email, "ok");
    carregar();
  } else {
    msg("msg-cliente", d.erro || "Erro ao criar acesso.", "erro");
  }
});

document.getElementById("btn-sair").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "/";
});

carregar();
