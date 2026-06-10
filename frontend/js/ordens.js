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
let SELECIONADOS = null; // Set de nomes de técnicos visíveis (null = todos)
const LIMITE_OS = 5;     // qtd mostrada no resumo (o resto abre no modal)
const LIMITE_TEC = 5;    // técnicos na prévia (o resto abre no modal)

function render(data) {
  ULTIMO = data;
  PAPEL = data.papel;
  SELECIONADOS = null; // novo período sempre começa mostrando todos
  document.getElementById("periodo-aplicado").textContent =
    "Período: " + dataBRfull(data.de) + " a " + dataBRfull(data.ate);

  const resumo = document.getElementById("resumo");
  const blocoTec = document.getElementById("bloco-tecnicos");

  if (data.papel === "terceirizado") {
    document.getElementById("subtitulo").textContent =
      "Visão de toda a equipe. Filtre por período.";
    resumo.innerHTML =
      statCard("Faturamento (bruto)", brl(data.resumo.bruto)) +
      statCard("Repasse à equipe", brl(data.resumo.repasse_equipe)) +
      statCard("Faturamento (líquido)", brl(data.resumo.liquido), true) +
      statCardDuplo("Total de O.S.", data.resumo.qtd, "Sinalizadas", data.resumo.sinalizadas);
    renderResumoTecnicos(data);
    blocoTec.style.display = "block";
  } else {
    document.getElementById("subtitulo").textContent = "Suas O.S. e ganhos.";
    resumo.innerHTML =
      statCard("Meus ganhos", brl(data.resumo.meus_ganhos), true) +
      statCard("Minhas O.S.", data.resumo.qtd);
    blocoTec.style.display = "none";
  }

  renderListaOS(data);
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

// "Por técnico": prévia com LIMITE_TEC; "Ver mais" abre todos no modal
function renderResumoTecnicos(data) {
  const ul = document.getElementById("lista-tecnicos");
  const todos = document.getElementById("tec-todos");
  const exp = document.getElementById("tec-expandir");
  ul.innerHTML = "";
  exp.innerHTML = "";

  const tecs = data.resumo.por_tecnico;
  if (tecs.length === 0) {
    ul.innerHTML = '<li class="empty">Nenhuma O.S. no período.</li>';
    todos.parentElement.style.display = "none";
    return;
  }
  todos.parentElement.style.display = "";
  if (!SELECIONADOS) SELECIONADOS = new Set(tecs.map((t) => t.tecnico));
  todos.checked = tecs.every((t) => SELECIONADOS.has(t.tecnico));

  tecs.slice(0, LIMITE_TEC).forEach((t) => ul.appendChild(tecLi(t)));

  if (tecs.length > LIMITE_TEC) {
    const btn = document.createElement("button");
    btn.className = "btn-expandir";
    btn.textContent = "▼ Ver mais (" + tecs.length + ")";
    btn.addEventListener("click", abrirModalTec);
    exp.appendChild(btn);
  }
}

function onTecToggle(tec, checked) {
  if (!SELECIONADOS) SELECIONADOS = new Set(ULTIMO.resumo.por_tecnico.map((t) => t.tecnico));
  if (checked) SELECIONADOS.add(tec); else SELECIONADOS.delete(tec);
  renderResumoTecnicos(ULTIMO);
  if (document.getElementById("modal-tec").style.display !== "none") renderModalTec();
  renderListaOS(ULTIMO);
}

// Modal com TODOS os técnicos (mesmos checkboxes/ícones da prévia)
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
  (ULTIMO.resumo.por_tecnico || []).forEach((t) => ul.appendChild(tecLi(t)));
}

// Monta um item <li> de O.S.
function osLi(o, papel) {
  const li = document.createElement("li");
  li.className = "list-item";

  const info = document.createElement("div");
  info.className = "li-info";
  info.innerHTML =
    '<div class="li-main">' + o.cliente + "</div>" +
    '<div class="li-sub">' + o.classe + "</div>";

  const right = document.createElement("div");
  right.className = "li-actions";

  const tagTxt =
    papel === "terceirizado"
      ? o.tecnico + " · " + dataBR(o.data_execucao) + " · " + brl(o.valor_repasse)
      : dataBR(o.data_execucao) + " · " + brl(o.valor_repasse);
  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = tagTxt;
  right.appendChild(tag);

  // Só o dono pode sinalizar O.S.
  if (papel === "terceirizado") {
    const alerta = document.createElement("button");
    alerta.className = "btn-alerta" + (o.sinalizada ? " ativo" : "");
    alerta.textContent = "⚠";
    alerta.title = o.sinalizada ? "Sinalizada — ver/editar" : "Sinalizar";
    alerta.addEventListener("click", () => abrirSinal(o));
    right.appendChild(alerta);
  }

  li.appendChild(info);
  li.appendChild(right);
  return li;
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

// Atalhos de período
document.querySelectorAll("[data-atalho]").forEach((b) => {
  b.addEventListener("click", () => {
    const tipo = b.dataset.atalho;
    const hoje = new Date();
    if (tipo === "hoje") {
      document.getElementById("f-de").value = iso(hoje);
    } else {
      const ini = new Date();
      ini.setDate(ini.getDate() - (Number(tipo) - 1));
      document.getElementById("f-de").value = iso(ini);
    }
    document.getElementById("f-ate").value = iso(hoje);
    carregarCustom();
  });
});

document.getElementById("btn-filtrar").addEventListener("click", carregarCustom);

// Mini-modal de PDF por técnico
document.getElementById("pdf-gerar").addEventListener("click", gerarRelatorioPDF);
document.getElementById("pdf-cancelar").addEventListener("click", fecharModalPdf);
document.getElementById("modal-pdf-fechar").addEventListener("click", fecharModalPdf);
document.getElementById("modal-pdf").addEventListener("click", (e) => {
  if (e.target.id === "modal-pdf") fecharModalPdf();
});

// Selecionar/desmarcar todos os técnicos
document.getElementById("tec-todos").addEventListener("change", function () {
  const tecs = (ULTIMO && ULTIMO.resumo.por_tecnico) || [];
  SELECIONADOS = this.checked ? new Set(tecs.map((t) => t.tecnico)) : new Set();
  renderResumoTecnicos(ULTIMO);
  if (document.getElementById("modal-tec").style.display !== "none") renderModalTec();
  renderListaOS(ULTIMO);
});

// Modal "Por técnico"
document.getElementById("modal-tec-fechar").addEventListener("click", fecharModalTec);
document.getElementById("modal-tec-vermenos").addEventListener("click", fecharModalTec);
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

document.getElementById("btn-sair").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "/";
});

// Início — padrão: últimos 30 dias
(function () {
  const hoje = new Date();
  const ini = new Date();
  ini.setDate(ini.getDate() - 29);
  document.getElementById("f-de").value = iso(ini);
  document.getElementById("f-ate").value = iso(hoje);
  carregarCustom();
})();
