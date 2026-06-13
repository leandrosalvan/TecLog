// TecLog+ — Ordens de Serviço (ciclo configurável + período + relatório)

let PAPEL = null;

function brl(v) {
  return "R$ " + (Number(v) || 0).toFixed(2).replace(".", ",");
}
function iso(d) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return d.getFullYear() + "-" + mm + "-" + dd;
}
function hojeStr() {
  return iso(new Date());
}
const MESES_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
// Primeiro e último dia do mês atual (para o resumo/faturamento do topo)
function primeiroDiaMes() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-01";
}
function ultimoDiaMes() {
  const d = new Date();
  return iso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}
function nomeMesAtual() {
  const d = new Date();
  return MESES_PT[d.getMonth()] + " de " + d.getFullYear();
}
function dataBR(s) {
  const p = s.split("-");
  return p[2] + "/" + p[1];
}
function dataBRfull(s) {
  const p = s.split("-");
  return p[2] + "/" + p[1] + "/" + p[0];
}
function statCard(lbl, val, destaque) {
  return (
    '<div class="stat' + (destaque ? " destaque" : "") + '">' +
    '<div class="lbl">' + lbl + "</div>" +
    '<div class="val">' + val + "</div></div>"
  );
}
// Card dividido em duas métricas (ex.: Total de O.S. | Sinalizadas)
function statCardDuplo(lbl1, val1, lbl2, val2) {
  return (
    '<div class="stat stat-duplo">' +
    '<div class="metade"><div class="lbl">' + lbl1 + '</div><div class="val">' + val1 + "</div></div>" +
    '<div class="metade"><div class="lbl">' + lbl2 + '</div><div class="val">' + val2 + "</div></div></div>"
  );
}

// ---- PDF por técnico: abre o mini-modal de período e gera ----
let TEC_PDF = null;

function abrirModalPdf(tec) {
  TEC_PDF = tec;
  document.getElementById("modal-pdf-titulo").textContent = "Relatório · " + tec;
  document.getElementById("pdf-de").value = document.getElementById("f-de").value;
  document.getElementById("pdf-ate").value = document.getElementById("f-ate").value;
  document.getElementById("modal-pdf").style.display = "flex";
}

function fecharModalPdf() {
  document.getElementById("modal-pdf").style.display = "none";
}

// Busca o período escolhido, monta o relatório do técnico e abre a impressão (salvar PDF)
async function gerarRelatorioPDF() {
  if (!TEC_PDF) return;
  const de = document.getElementById("pdf-de").value;
  const ate = document.getElementById("pdf-ate").value;
  const r = await fetch("/api/relatorio?de=" + de + "&ate=" + ate);
  if (!r.ok) return;
  const data = await r.json();
  const lista = (data.os || []).filter((o) => o.tecnico === TEC_PDF);
  const ehLider = lista.some((o) => o.eh_dono);   // O.S. do próprio líder (dono)
  const total = lista.reduce((s, o) => s + (Number(o.valor_repasse) || 0), 0);
  const labelValor = ehLider ? "Valor" : "Repasse";
  const papelTxt = ehLider ? "Líder" : "Técnico";
  const linhas = lista.map((o) =>
    "<tr><td>" + o.cliente + "</td><td>" + dataBRfull(o.data_execucao) + "</td><td>" + o.classe +
    "</td><td>" + brl(o.valor_repasse) + "</td><td>" + (o.sinalizada ? "⚠ Repetida" : "") + "</td></tr>"
  ).join("");
  let rodape =
    '<div class="rel-total">Total · ' + lista.length + " O.S. &nbsp;·&nbsp; " + labelValor + ": " + brl(total) + "</div>";
  if (ehLider) {
    rodape +=
      '<div class="rel-extra">Lucro retido (das equipes/técnicos): <b>' + brl(data.resumo.margem || 0) + "</b></div>" +
      '<div class="rel-extra">Faturamento líquido: <b>' + brl(data.resumo.liquido || 0) + "</b></div>";
  }
  document.getElementById("relatorio-tecnico").innerHTML =
    '<div class="rel-head">' +
      '<div class="rel-logo">TecLog<span>+</span></div>' +
      '<div class="rel-titulo">Relatório do ' + papelTxt + "</div>" +
      '<div class="rel-meta"><span><b>' + papelTxt + ":</b> " + TEC_PDF + "</span>" +
      '<span><b>Período:</b> ' + dataBRfull(data.de) + " a " + dataBRfull(data.ate) + "</span></div>" +
    "</div>" +
    '<table class="rel-tab"><thead><tr><th>Cliente</th><th>Data</th><th>Tipo de Atividade</th><th>' + labelValor + '</th><th>Repetida</th></tr></thead><tbody>' +
    (linhas || '<tr><td colspan="5">Nenhuma O.S. no período.</td></tr>') +
    "</tbody></table>" +
    rodape;
  fecharModalPdf();
  document.title = "Relatorio - " + TEC_PDF;
  document.body.classList.add("printing-tecnico");
  window.print();
  document.body.classList.remove("printing-tecnico");
  document.title = "TecLog+ · Relatório de Ganhos";
}
let ULTIMO = null;
let SELECIONADOS = null; // Set de nomes de técnicos visíveis (null = todos / técnico)
let ROSTER = [];         // nomes da equipe inteira (líder + técnicos), líder em 1º
let LIDER_NOME = null;   // nome do líder logado (para a seleção padrão)
const LIMITE_OS = 5;     // qtd mostrada no resumo (o resto abre no modal)

// Cards do topo: SEMPRE faturamento do mês atual (dia 1 ao último dia), equipe completa.
// Independente dos filtros de período/técnico aplicados na lista de O.S. abaixo.
function renderResumo(data) {
  const resumo = document.getElementById("resumo");
  const titulo = document.getElementById("resumo-titulo");

  if (data.papel === "terceirizado") {
    titulo.textContent = "Faturamento de " + nomeMesAtual() + " · toda a equipe";
    resumo.innerHTML =
      statCard("Faturamento (bruto)", brl(data.resumo.bruto)) +
      statCard("Repasse à equipe", brl(data.resumo.repasse_equipe)) +
      statCard("Faturamento (líquido)", brl(data.resumo.liquido), true) +
      statCardDuplo("Total de O.S.", data.resumo.qtd, "Sinalizadas", data.resumo.sinalizadas);
  } else {
    titulo.textContent = "Seus ganhos em " + nomeMesAtual();
    resumo.innerHTML =
      statCard("Meus ganhos", brl(data.resumo.meus_ganhos), true) +
      statCard("Minhas O.S.", data.resumo.qtd);
  }
}

async function carregarResumoMes() {
  const de = primeiroDiaMes();
  const ate = ultimoDiaMes();
  const r = await fetch("/api/relatorio?de=" + de + "&ate=" + ate);
  if (!r.ok) {
    if (r.status === 401) window.location.href = "/";
    return;
  }
  renderResumo(await r.json());
}

// Lista de O.S. (abaixo): respeita os filtros de período/técnico (padrão: hoje + líder).
function render(data) {
  ULTIMO = data;
  PAPEL = data.papel;
  atualizarResumoFiltro(data);
  renderListaOS(data);
}

// Texto-resumo do filtro aplicado (período + seleção de técnicos)
function atualizarResumoFiltro(data) {
  let txt = (data.de === data.ate)
    ? dataBRfull(data.de)
    : dataBRfull(data.de) + " a " + dataBRfull(data.ate);
  if (data.papel === "terceirizado" && SELECIONADOS && ROSTER.length) {
    const n = ROSTER.filter((nome) => SELECIONADOS.has(nome)).length;
    txt += " · " + (n === ROSTER.length ? "todos os técnicos" : n + " de " + ROSTER.length + " técnicos");
  }
  document.getElementById("periodo-aplicado").textContent = txt;
}

// Monta um <li> de técnico (checkbox de filtro + repasse + ícone PDF)
function tecLi(t) {
  const li = document.createElement("li");
  li.className = "list-item";
  const marcado = !SELECIONADOS || SELECIONADOS.has(t.tecnico);
  if (!marcado) li.style.opacity = ".5";

  const lab = document.createElement("label");
  lab.className = "li-info chk-tec";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = marcado;
  cb.dataset.tec = t.tecnico;
  cb.addEventListener("change", () => onTecToggle(t.tecnico, cb.checked));
  const span = document.createElement("span");
  span.innerHTML =
    '<div class="li-main">' + t.tecnico + "</div>" +
    '<div class="li-sub">' + t.qtd + " O.S.</div>";
  lab.appendChild(cb);
  lab.appendChild(span);

  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = brl(t.repasse);

  const bPdf = document.createElement("button");
  bPdf.className = "btn-act";
  bPdf.textContent = "📄";
  bPdf.title = "Gerar PDF deste técnico";
  bPdf.addEventListener("click", () => abrirModalPdf(t.tecnico));

  const right = document.createElement("div");
  right.className = "li-actions";
  right.appendChild(tag);
  right.appendChild(bPdf);

  li.appendChild(lab);
  li.appendChild(right);
  return li;
}

function onTecToggle(tec, checked) {
  if (!SELECIONADOS) SELECIONADOS = new Set();
  if (checked) SELECIONADOS.add(tec); else SELECIONADOS.delete(tec);
  if (document.getElementById("modal-tec").style.display !== "none") renderModalTec();
  renderListaOS(ULTIMO);
  if (ULTIMO) atualizarResumoFiltro(ULTIMO);
}

// Modal "Filtrar por técnico": lista a equipe inteira (roster), com a contagem/repasse do período
function abrirModalTec() {
  renderModalTec();
  document.getElementById("modal-tec").style.display = "flex";
}
function fecharModalTec() {
  document.getElementById("modal-tec").style.display = "none";
}
function renderModalTec() {
  const ul = document.getElementById("modal-tec-lista");
  ul.innerHTML = "";
  // Mapa nome -> {qtd, repasse} do período atual (técnicos sem O.S. ficam zerados)
  const porNome = {};
  ((ULTIMO && ULTIMO.resumo && ULTIMO.resumo.por_tecnico) || []).forEach((t) => (porNome[t.tecnico] = t));
  const nomes = ROSTER.length ? ROSTER : Object.keys(porNome);
  if (nomes.length === 0) {
    ul.innerHTML = '<li class="empty">Nenhum técnico cadastrado.</li>';
  } else {
    nomes.forEach((nome) => ul.appendChild(tecLi(porNome[nome] || { tecnico: nome, qtd: 0, repasse: 0 })));
  }
  const todos = document.getElementById("tec-todos");
  if (todos) todos.checked = nomes.length > 0 && SELECIONADOS && nomes.every((n) => SELECIONADOS.has(n));
}

// Monta um item <li> de O.S.
function osLi(o, papel) {
  const li = document.createElement("li");
  li.className = "list-item os-item";

  const info = document.createElement("div");
  info.className = "li-info";
  info.innerHTML =
    '<div class="li-main">' + o.cliente + "</div>" +
    '<div class="li-sub">' + o.classe + " · " + brl(o.valor_repasse) + "</div>";

  // Linha inferior: nome (líder/técnico) + data, à esquerda; ações (editar/sinalizar), à direita
  const bottom = document.createElement("div");
  bottom.className = "li-bottom";

  const right = document.createElement("div");
  right.className = "li-actions";

  const tagTxt =
    papel === "terceirizado"
      ? o.tecnico + " · " + dataBR(o.data_execucao)
      : dataBR(o.data_execucao);
  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = tagTxt;
  bottom.appendChild(tag);

  // Editar: o líder só edita as próprias O.S. (eh_dono); o técnico edita as suas.
  const podeEditar = papel !== "terceirizado" || o.eh_dono;
  if (podeEditar) {
    const editar = document.createElement("button");
    editar.className = "btn-act";
    editar.textContent = "✏️";
    editar.title = "Editar O.S.";
    editar.addEventListener("click", () => modoEdicaoOS(li, o));
    right.appendChild(editar);
  }

  // Só o dono pode sinalizar O.S.
  if (papel === "terceirizado") {
    const alerta = document.createElement("button");
    alerta.className = "btn-alerta" + (o.sinalizada ? " ativo" : "");
    alerta.textContent = "⚠";
    alerta.title = o.sinalizada ? "Sinalizada — ver/editar" : "Sinalizar";
    alerta.addEventListener("click", () => abrirSinal(o));
    right.appendChild(alerta);
  }

  bottom.appendChild(right);

  li.appendChild(info);
  li.appendChild(bottom);
  return li;
}

// Edição inline de uma O.S. (substitui o <li> por inputs: cliente, classe, data)
function modoEdicaoOS(li, o) {
  li.classList.add("editing");
  li.innerHTML = "";

  const cliente = document.createElement("input");
  cliente.className = "edit-input";
  cliente.type = "text";
  cliente.value = o.cliente;
  cliente.placeholder = "Cliente";

  const classeAtual = CLASSES_OS.find((c) => c.nome === o.classe);
  const classe = document.createElement("select");
  classe.className = "edit-input";
  classe.innerHTML = CLASSES_OS.map(
    (c) =>
      '<option value="' + c.id + '"' +
      (classeAtual && c.id === classeAtual.id ? " selected" : "") +
      ">" + c.nome + "</option>"
  ).join("");

  const dataInp = document.createElement("input");
  dataInp.className = "edit-input";
  dataInp.type = "date";
  dataInp.value = o.data_execucao;

  const erro = document.createElement("div");
  erro.className = "msg";

  const salvar = document.createElement("button");
  salvar.className = "btn-act salvar";
  salvar.textContent = "Salvar";
  salvar.addEventListener("click", async () => {
    const r = await fetch("/api/os/" + o.id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cliente: cliente.value,
        classe_id: classe.value ? Number(classe.value) : null,
        data: dataInp.value,
      }),
    });
    if (r.ok) {
      document.getElementById("modal-os").style.display = "none";
      carregarCustom();    // atualiza a lista filtrada
      carregarResumoMes(); // atualiza os cards do topo (faturamento do mês)
    } else {
      const d = await r.json().catch(() => ({}));
      erro.textContent = d.erro || "Erro ao salvar.";
      erro.className = "msg show erro";
    }
  });

  const cancelar = document.createElement("button");
  cancelar.className = "btn-act";
  cancelar.textContent = "Cancelar";
  cancelar.addEventListener("click", () => carregarCustom());

  li.appendChild(cliente);
  li.appendChild(classe);
  li.appendChild(dataInp);
  li.appendChild(salvar);
  li.appendChild(cancelar);
  li.appendChild(erro);
  cliente.focus();
}

function listaFiltrada(data) {
  let lista = data.os;
  if (data.papel === "terceirizado" && SELECIONADOS) {
    lista = lista.filter((o) => SELECIONADOS.has(o.tecnico));
  }
  return lista;
}

// Lista de O.S. — resumo (LIMITE_OS); "Ver mais" abre a lista completa em modal
function renderListaOS(data) {
  const ulOs = document.getElementById("lista-os");
  const exp = document.getElementById("os-expandir");
  ulOs.innerHTML = "";
  exp.innerHTML = "";

  const lista = listaFiltrada(data);
  document.getElementById("titulo-lista").textContent =
    "O.S. no período (" + lista.length + ")";

  if (lista.length === 0) {
    ulOs.innerHTML = '<li class="empty">Nenhuma O.S. para os técnicos marcados.</li>';
    return;
  }

  lista.slice(0, LIMITE_OS).forEach((o) => ulOs.appendChild(osLi(o, data.papel)));

  if (lista.length > LIMITE_OS) {
    const btn = document.createElement("button");
    btn.className = "btn-expandir";
    btn.textContent = "▼ Ver mais (" + lista.length + ")";
    btn.addEventListener("click", () => abrirModalOS(data));
    exp.appendChild(btn);
  }
}

// Modal com a lista COMPLETA de O.S. (conforme o filtro aplicado)
function abrirModalOS(data) {
  const lista = listaFiltrada(data);
  const ul = document.getElementById("modal-os-lista");
  ul.innerHTML = "";
  lista.forEach((o) => ul.appendChild(osLi(o, data.papel)));
  document.getElementById("modal-os-titulo").textContent =
    "O.S. no período (" + lista.length + ")";
  document.getElementById("modal-os").style.display = "flex";
}

function fecharModalOS() {
  document.getElementById("modal-os").style.display = "none";
}

function recarregar() {
  carregarCustom();
}

async function carregarCustom() {
  const de = document.getElementById("f-de").value;
  const ate = document.getElementById("f-ate").value;
  const r = await fetch("/api/relatorio?de=" + de + "&ate=" + ate);
  if (!r.ok) {
    if (r.status === 401) window.location.href = "/";
    return;
  }
  render(await r.json());
}

// ---------- Filtros (painel + modais) ----------
document.getElementById("btn-filtros").addEventListener("click", () => {
  const p = document.getElementById("filtros-painel");
  p.style.display = p.style.display === "none" ? "flex" : "none";
});

// Por data
function abrirModalData() {
  document.getElementById("modal-data").style.display = "flex";
}
function fecharModalData() {
  document.getElementById("modal-data").style.display = "none";
}
function onDataChange() {
  const de = document.getElementById("f-de").value;
  const ate = document.getElementById("f-ate").value;
  if (de && ate && de <= ate) {
    carregarCustom();
    fecharModalData();
  }
}
document.getElementById("filtro-data").addEventListener("click", abrirModalData);
document.getElementById("modal-data-fechar").addEventListener("click", fecharModalData);
document.getElementById("modal-data").addEventListener("click", (e) => {
  if (e.target.id === "modal-data") fecharModalData();
});
document.getElementById("f-de").addEventListener("change", onDataChange);
document.getElementById("f-ate").addEventListener("change", onDataChange);

// Por técnico
document.getElementById("filtro-tecnico").addEventListener("click", abrirModalTec);

// Limpar filtro: volta ao padrão (hoje + todos os técnicos + líder)
document.getElementById("filtro-limpar").addEventListener("click", () => {
  document.getElementById("f-de").value = hojeStr();
  document.getElementById("f-ate").value = hojeStr();
  if (PAPEL === "terceirizado") SELECIONADOS = new Set(ROSTER);
  document.getElementById("filtros-painel").style.display = "none";
  carregarCustom();
});

// Mini-modal de PDF por técnico
document.getElementById("pdf-gerar").addEventListener("click", gerarRelatorioPDF);
document.getElementById("pdf-cancelar").addEventListener("click", fecharModalPdf);
document.getElementById("modal-pdf-fechar").addEventListener("click", fecharModalPdf);
document.getElementById("modal-pdf").addEventListener("click", (e) => {
  if (e.target.id === "modal-pdf") fecharModalPdf();
});

// Selecionar/desmarcar todos os técnicos
document.getElementById("tec-todos").addEventListener("change", function () {
  SELECIONADOS = this.checked ? new Set(ROSTER) : new Set();
  renderModalTec();
  renderListaOS(ULTIMO);
  if (ULTIMO) atualizarResumoFiltro(ULTIMO);
});

// Modal "Por técnico"
document.getElementById("modal-tec-fechar").addEventListener("click", fecharModalTec);
document.getElementById("modal-tec-aplicar").addEventListener("click", fecharModalTec);
document.getElementById("modal-tec").addEventListener("click", (e) => {
  if (e.target.id === "modal-tec") fecharModalTec();
});

// Modal da lista completa de O.S.
document.getElementById("modal-os-fechar").addEventListener("click", fecharModalOS);
document.getElementById("modal-os-vermenos").addEventListener("click", fecharModalOS);
document.getElementById("modal-os").addEventListener("click", (e) => {
  if (e.target.id === "modal-os") fecharModalOS();
});

// ---------- Sinalização de O.S. ----------
let OS_ATUAL = null;

function msgSinal(t, tipo) {
  const el = document.getElementById("msg-sinal");
  el.textContent = t;
  el.className = "msg show " + tipo;
}

function fecharSinal() {
  document.getElementById("modal").style.display = "none";
  OS_ATUAL = null;
}

function abrirSinal(o) {
  OS_ATUAL = o;
  document.getElementById("modal-cliente").textContent = o.cliente + " · " + o.classe;
  document.getElementById("sinal-desc").value = "";
  document.getElementById("sinal-img").value = "";
  document.getElementById("sinal-preview").innerHTML = "";
  document.getElementById("sinal-status").textContent = "";
  document.getElementById("msg-sinal").className = "msg";
  document.getElementById("sinal-remover").style.display = "none";
  document.getElementById("modal").style.display = "flex";

  fetch("/api/os/" + o.id + "/sinal")
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (!d || !d.sinalizada) return;
      document.getElementById("sinal-desc").value = d.descricao;
      document.getElementById("sinal-remover").style.display = "inline-block";
      if (d.imagem) {
        document.getElementById("sinal-preview").innerHTML =
          '<img src="' + d.imagem + '" alt="anexo" />';
      }
      const st = document.getElementById("sinal-status");
      if (d.visto) {
        if (d.visto.confirmada) {
          st.textContent = "✓ Visto pelo técnico em " + d.visto.em;
          st.style.color = "var(--ok)";
        } else {
          st.textContent = "⏳ Aguardando o visto do técnico…";
          st.style.color = "var(--muted)";
        }
      }
    });
}

// Reduz a imagem no próprio aparelho antes de enviar (leve, mas legível)
function comprimir(file, maxDim, quality) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > h && w > maxDim) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else if (h > maxDim) {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
        const cv = document.createElement("canvas");
        cv.width = w;
        cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        cv.toBlob((b) => resolve(b), "image/jpeg", quality);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

document.getElementById("sinal-img").addEventListener("change", (e) => {
  const f = e.target.files[0];
  if (!f) return;
  document.getElementById("sinal-preview").innerHTML =
    '<img src="' + URL.createObjectURL(f) + '" alt="preview" />';
});

document.getElementById("modal-fechar").addEventListener("click", fecharSinal);
document.getElementById("modal").addEventListener("click", (e) => {
  if (e.target.id === "modal") fecharSinal();
});

document.getElementById("sinal-salvar").addEventListener("click", async () => {
  if (!OS_ATUAL) return;
  const desc = document.getElementById("sinal-desc").value.trim();
  if (!desc) {
    msgSinal("Escreva uma descrição.", "erro");
    return;
  }
  const fd = new FormData();
  fd.append("descricao", desc);
  const file = document.getElementById("sinal-img").files[0];
  if (file) {
    msgSinal("Processando imagem…", "ok");
    const blob = await comprimir(file, 1280, 0.55);
    fd.append("imagem", blob, "sinal.jpg");
  }
  const r = await fetch("/api/os/" + OS_ATUAL.id + "/sinalizar", { method: "POST", body: fd });
  if (r.ok) {
    fecharSinal();
    recarregar();
  } else {
    const d = await r.json().catch(() => ({}));
    msgSinal(d.erro || "Erro ao salvar.", "erro");
  }
});

document.getElementById("sinal-remover").addEventListener("click", async () => {
  if (!OS_ATUAL) return;
  if (!confirm("Remover a sinalização desta O.S.?")) return;
  const r = await fetch("/api/os/" + OS_ATUAL.id + "/sinalizar", { method: "DELETE" });
  if (r.ok) {
    fecharSinal();
    recarregar();
  } else {
    const d = await r.json().catch(() => ({}));
    msgSinal(d.erro || "Erro ao remover.", "erro");
  }
});

// Logout e menu lateral: ver js/menu.js

// ---------- Registrar O.S. (formulário embutido na Home) ----------
let CLASSES_OS = [];

function msgOS(texto, tipo) {
  const el = document.getElementById("msg-os");
  el.textContent = texto;
  el.className = "msg show " + tipo;
}
function msgOSHTML(html, tipo) {
  const el = document.getElementById("msg-os");
  el.innerHTML = html;
  el.className = "msg show " + tipo;
}
function limparMsgOS() {
  const el = document.getElementById("msg-os");
  el.textContent = "";
  el.className = "msg";
}
function valorDaClasse(id) {
  const c = CLASSES_OS.find((x) => x.id === Number(id));
  return c ? Number(c.valor) || 0 : 0;
}
function avisoZero() {
  return PAPEL === "terceirizado"
    ? '⚠️ Esta classe está com valor R$ 0,00 para o seu perfil. Defina os valores na aba <a href="/valores">💰 Valores</a> antes de registrar.'
    : "⚠️ Esta classe ainda está sem valor definido para o seu perfil. Peça ao líder da equipe para configurar os valores.";
}
// Avisa e bloqueia o botão quando a classe selecionada está com valor zerado
function avaliarClasse() {
  const sel = document.getElementById("os-classe");
  const btn = document.querySelector("#form-os button[type=submit]");
  if (sel.value && valorDaClasse(sel.value) <= 0) {
    msgOSHTML(avisoZero(), "erro");
    if (btn) btn.disabled = true;
  } else {
    limparMsgOS();
    if (btn) btn.disabled = false;
  }
}

async function carregarFormOS() {
  const r = await fetch("/api/os/form-data");
  if (!r.ok) {
    if (r.status === 401) window.location.href = "/";
    return;
  }
  const data = await r.json();
  CLASSES_OS = data.classes;
  if (data.papel) PAPEL = data.papel;
  const sel = document.getElementById("os-classe");
  if (CLASSES_OS.length === 0) {
    sel.innerHTML = '<option value="">— crie uma classe na aba Valores —</option>';
  } else {
    sel.innerHTML =
      '<option value="">Selecione…</option>' +
      CLASSES_OS.map((c) =>
        '<option value="' + c.id + '">' + c.nome +
        ((Number(c.valor) || 0) <= 0 ? " — sem valor" : "") + "</option>"
      ).join("");
  }
  document.getElementById("os-data").value = hojeStr();
}

document.getElementById("os-classe").addEventListener("change", avaliarClasse);

document.getElementById("form-os").addEventListener("submit", async (e) => {
  e.preventDefault();
  const selVal = document.getElementById("os-classe").value;
  if (selVal && valorDaClasse(selVal) <= 0) {
    msgOSHTML(avisoZero(), "erro");
    return;
  }
  const r = await fetch("/api/os", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cliente: document.getElementById("os-cliente").value,
      classe_id: selVal ? Number(selVal) : null,
      data: document.getElementById("os-data").value,
    }),
  });
  if (r.ok) {
    document.getElementById("os-cliente").value = "";
    document.getElementById("os-classe").value = "";
    document.getElementById("os-data").value = hojeStr();
    msgOS("O.S. registrada! ✅", "ok");
    carregarCustom();   // atualiza lista filtrada (período/técnico selecionados)
    carregarResumoMes(); // atualiza cards do topo (faturamento do mês, equipe completa)
    document.getElementById("os-cliente").focus();
  } else {
    const d = await r.json().catch(() => ({}));
    msgOS(d.erro || "Erro ao registrar.", "erro");
  }
});

// Descobre papel + nome do líder e carrega o roster da equipe.
// Define a seleção padrão de técnicos (só o líder) e esconde "Por técnico" para técnicos.
async function initFiltros() {
  let me = null;
  try { me = await (await fetch("/api/me")).json(); } catch (e) {}
  if (!me || me.erro) { window.location.href = "/"; return; }
  PAPEL = me.papel;
  if (me.papel !== "terceirizado") {
    document.getElementById("filtro-tecnico").style.display = "none";
    return; // técnico: vê só as próprias O.S., sem filtro por técnico
  }
  LIDER_NOME = me.nome;
  let tecs = [];
  try {
    const eq = await (await fetch("/api/equipe")).json();
    tecs = (eq.tecnicos || []).map((t) => t.nome).sort((a, b) => a.localeCompare(b, "pt-BR"));
  } catch (e) {}
  ROSTER = [LIDER_NOME, ...tecs];
  SELECIONADOS = new Set(ROSTER); // padrão: todos os técnicos + líder
}

// Início — padrão: hoje + só o líder selecionado (cards do topo: mês atual, equipe completa)
(async function () {
  document.getElementById("f-de").value = hojeStr();
  document.getElementById("f-ate").value = hojeStr();
  await initFiltros();
  carregarResumoMes();
  carregarCustom();
  carregarFormOS();
})();
