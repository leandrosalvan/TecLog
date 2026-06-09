// TecLog+ — Backoffice: Finanças (resumo + fluxo de caixa + relatório)

// Planos (de teclog.onrender.com/planos): base mensal, técnicos incluídos e R$ por adicional.
const PLANOS = {
  Starter:       { base: 89.90,  inclui: 5,  add: 12 },
  Standard:      { base: 119.90, inclui: 10, add: 10 },
  Advanced:      { base: 199.90, inclui: 20, add: 9 },
  Professional:  { base: 269.90, inclui: 30, add: 8 },
  Premium:       { base: 329.90, inclui: 40, add: 7 },
  Enterprise:    { base: 389.90, inclui: 50, add: 6 },
  Teste:         { base: 0,      inclui: 0,  add: 0 },
  Personalizado: { base: 0,      inclui: 0,  add: 0 },
};

// Nº de técnicos adicionais cobrados (acima do incluído), pelo limite contratado.
function extrasDe(c) {
  const p = PLANOS[c.plano];
  if (!p || p.add === 0) return 0;
  const contratado = c.limite_tecnicos != null ? c.limite_tecnicos : (c.tecnicos || 0);
  return Math.max(0, contratado - p.inclui);
}

let TODOS = [];

function brl(v) {
  return (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function precoDe(c) {
  if (c.plano === "Personalizado" && c.valor_personalizado != null) return Number(c.valor_personalizado);
  const p = PLANOS[c.plano];
  if (!p) return 0;
  return p.base + extrasDe(c) * p.add;
}
function dataHoje() {
  return new Date().toLocaleDateString("pt-BR");
}

// Categoria de cobrança a partir da régua (estado/dias_atraso/teste/ativo)
function statusInfo(c) {
  if (!c.ativo) return { t: "Suspenso (manual)", k: "inativo", cat: "manual" };
  if (c.teste) {
    if (c.estado === "suspenso") return { t: "Teste expirado", k: "vencido", cat: "expirado" };
    return { t: "Em teste", k: "pendente", cat: "teste" };
  }
  if (c.estado === "suspenso") return { t: "Em atraso · " + (c.dias_atraso || 0) + "d", k: "vencido", cat: "atraso" };
  if (c.estado === "pendente" || (c.dias_atraso != null && c.dias_atraso > 0))
    return { t: "Em carência · " + (c.dias_atraso || 0) + "d", k: "pendente", cat: "carencia" };
  return { t: "Em dia", k: "ativo", cat: "dia" };
}

function statCard(lbl, val, destaque) {
  return '<div class="stat' + (destaque ? " destaque" : "") + '">' +
         '<div class="lbl">' + lbl + '</div>' +
         '<div class="val">' + val + '</div></div>';
}

function renderStats() {
  let total = TODOS.length, teste = 0, carencia = 0, atraso = 0;
  TODOS.forEach((c) => {
    const cat = statusInfo(c).cat;
    if (cat === "teste") teste++;
    else if (cat === "carencia") carencia++;
    else if (cat === "atraso") atraso++;
  });
  document.getElementById("resumo").innerHTML =
    statCard("Clientes cadastrados", total, true) +
    statCard("Em teste", teste) +
    statCard("Em carência", carencia) +
    statCard("Em atraso", atraso);
}

function preencherFiltro() {
  const sel = document.getElementById("filtro-plano");
  const planos = Object.keys(PLANOS);
  sel.innerHTML = '<option value="">Todos os planos</option>' +
    planos.map((p) => '<option value="' + p + '">' + p + "</option>").join("");
}

function aplicar() {
  const fp = document.getElementById("filtro-plano").value;
  const lista = !fp ? TODOS : TODOS.filter((c) => c.plano === fp);

  const ul = document.getElementById("fluxo");
  ul.innerHTML = "";
  document.getElementById("resumo-fluxo").textContent =
    lista.length + (lista.length === 1 ? " cliente" : " clientes");

  if (lista.length === 0) {
    ul.innerHTML = '<li class="empty">Nenhum cliente neste filtro.</li>';
  }

  let receita = 0, inadimplencia = 0;
  lista.forEach((c) => {
    const s = statusInfo(c);
    const preco = precoDe(c);
    if (s.cat === "dia" || s.cat === "carencia") receita += preco;
    if (s.cat === "atraso") inadimplencia += preco;

    const ex = extrasDe(c);
    const exTxt = ex > 0 ? " · +" + ex + (ex === 1 ? " téc. extra" : " téc. extras") : "";
    const li = document.createElement("li");
    li.className = "cliente-card";
    li.innerHTML =
      '<div class="li-main">' + c.nome + ' <span class="status ' + s.k + '">' + s.t + "</span></div>" +
      '<div class="li-sub">' + (c.plano || "Sem plano") + exTxt + " · <strong>" + brl(preco) + "/mês</strong></div>";
    ul.appendChild(li);
  });

  document.getElementById("totais").innerHTML =
    '<div class="totais-linha"><span>Receita prevista (em dia + carência)</span><strong>' + brl(receita) + "/mês</strong></div>" +
    '<div class="totais-linha alerta"><span>Em atraso (suspensos por pagamento)</span><strong>' + brl(inadimplencia) + "/mês</strong></div>";
}

function gerarRelatorio() {
  const sel = document.getElementById("filtro-plano");
  const plano = sel.value || "Todos os planos";
  document.getElementById("print-header").innerHTML =
    '<div class="ph-titulo">TecLog+ · Relatório de Fluxo de Caixa</div>' +
    '<div class="ph-sub">Plano: ' + plano + " · Gerado em " + dataHoje() + "</div>";
  document.title = "TecLog+ Fluxo de Caixa - " + plano + " - " + dataHoje();
  window.print();
  document.title = "TecLog+ · Finanças";
}

async function carregar() {
  const r = await fetch("/api/admin/clientes");
  if (!r.ok) {
    if (r.status === 401 || r.status === 403) window.location.href = "/";
    return;
  }
  const data = await r.json();
  TODOS = data.clientes || [];
  preencherFiltro();
  renderStats();
  aplicar();
}

document.getElementById("filtro-plano").addEventListener("change", aplicar);
document.getElementById("btn-relatorio").addEventListener("click", gerarRelatorio);
document.getElementById("btn-sair").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "/";
});

carregar();
