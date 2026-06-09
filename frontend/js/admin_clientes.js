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

  const nome = document.createElement("input");
  nome.className = "edit-input"; nome.type = "text"; nome.value = c.nome;

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

  li.appendChild(campo("Nome / empresa", nome));
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
      telefone: tel.value || null,
      plano: plano.value,
      limite_tecnicos: limite.value === "" ? null : Number(limite.value),
      vencimento: venc.value || null,
    };
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
      email: document.getElementById("c-email").value,
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
    toggleValorCriacao(document.getElementById("c-plano").value);
    msg("msg-cliente", "Acesso criado com sucesso! ✅", "ok");
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
