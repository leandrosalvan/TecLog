// TecLog+ — Ordens de Serviço (ciclo configurável + período + relatório)

let DIA_CICLO = null;
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
function msg(texto, tipo) {
  const el = document.getElementById("msg-ciclo");
  el.textContent = texto;
  el.className = "msg show " + tipo;
}

function setModoAtivo(modo) {
  document.querySelectorAll(".modo").forEach((b) => {
    b.classList.toggle("ativo", b.dataset.modo === String(modo));
  });
  document.getElementById("bloco-personalizado").style.display =
    modo === "custom" ? "block" : "none";
}

function render(data) {
  PAPEL = data.papel;
  document.getElementById("periodo-aplicado").textContent =
    "Período: " + dataBRfull(data.de) + " a " + dataBRfull(data.ate);

  const resumo = document.getElementById("resumo");
  const blocoTec = document.getElementById("bloco-tecnicos");

  if (data.papel === "terceirizado") {
    document.getElementById("subtitulo").textContent =
      "Visão de toda a equipe. Filtre por ciclo ou período.";
    resumo.innerHTML =
      statCard("Faturamento (bruto)", brl(data.resumo.bruto)) +
      statCard("Repasse à equipe", brl(data.resumo.repasse_equipe)) +
      statCard("Sua margem", brl(data.resumo.margem), true) +
      statCard("Total de O.S.", data.resumo.qtd);

    const ul = document.getElementById("lista-tecnicos");
    ul.innerHTML = "";
    if (data.resumo.por_tecnico.length === 0) {
      ul.innerHTML = '<li class="empty">Nenhuma O.S. no período.</li>';
    } else {
      data.resumo.por_tecnico.forEach((t) => {
        const li = document.createElement("li");
        li.className = "list-item";
        li.innerHTML =
          '<div class="li-info"><div class="li-main">' + t.tecnico + "</div>" +
          '<div class="li-sub">' + t.qtd + " O.S.</div></div>" +
          '<span class="tag">' + brl(t.repasse) + "</span>";
        ul.appendChild(li);
      });
    }
    blocoTec.style.display = "block";
  } else {
    document.getElementById("subtitulo").textContent = "Suas O.S. e ganhos.";
    resumo.innerHTML =
      statCard("Meus ganhos", brl(data.resumo.meus_ganhos), true) +
      statCard("Minhas O.S.", data.resumo.qtd);
    blocoTec.style.display = "none";
  }

  const ulOs = document.getElementById("lista-os");
  ulOs.innerHTML = "";
  if (data.os.length === 0) {
    ulOs.innerHTML = '<li class="empty">Nenhuma O.S. no período.</li>';
    return;
  }
  data.os.forEach((o) => {
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
      data.papel === "terceirizado"
        ? o.tecnico + " · " + dataBR(o.data_execucao) + " · " + brl(o.valor_repasse)
        : dataBR(o.data_execucao) + " · " + brl(o.valor_repasse);
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = tagTxt;
    right.appendChild(tag);

    // Só o dono pode sinalizar O.S.
    if (data.papel === "terceirizado") {
      const alerta = document.createElement("button");
      alerta.className = "btn-alerta" + (o.sinalizada ? " ativo" : "");
      alerta.textContent = "⚠";
      alerta.title = o.sinalizada ? "Sinalizada — ver/editar" : "Sinalizar";
      alerta.addEventListener("click", () => abrirSinal(o));
      right.appendChild(alerta);
    }

    li.appendChild(info);
    li.appendChild(right);
    ulOs.appendChild(li);
  });
}

function recarregar() {
  const ativo = document.querySelector(".modo.ativo");
  const modo = ativo ? ativo.dataset.modo : "custom";
  if (modo === "custom") carregarCustom();
  else carregarCiclo(Number(modo));
}

async function carregarCiclo(offset) {
  if (!DIA_CICLO) {
    document.getElementById("periodo-aplicado").textContent =
      PAPEL === "terceirizado"
        ? "Defina o dia de início do ciclo acima para usar este filtro."
        : "O gestor ainda não definiu o dia do ciclo.";
    return;
  }
  const r = await fetch("/api/relatorio?ciclo=" + offset);
  if (!r.ok) {
    if (r.status === 401) window.location.href = "/";
    return;
  }
  render(await r.json());
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

// Botões de modo
document.querySelectorAll(".modo").forEach((b) => {
  b.addEventListener("click", () => {
    const modo = b.dataset.modo;
    setModoAtivo(modo);
    if (modo === "custom") {
      if (!document.getElementById("f-de").value) {
        document.getElementById("f-de").value = hojeStr();
        document.getElementById("f-ate").value = hojeStr();
      }
      carregarCustom();
    } else {
      carregarCiclo(Number(modo));
    }
  });
});

// Atalhos do modo personalizado
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

// Salvar dia do ciclo (dono)
document.getElementById("btn-ciclo").addEventListener("click", async () => {
  const dia = document.getElementById("dia-ciclo").value;
  const r = await fetch("/api/ciclo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dia_ciclo: Number(dia) }),
  });
  const d = await r.json().catch(() => ({}));
  if (r.ok) {
    DIA_CICLO = d.dia_ciclo;
    msg("Ciclo salvo! Começa todo dia " + d.dia_ciclo + ".", "ok");
    setModoAtivo("0");
    carregarCiclo(0);
  } else {
    msg(d.erro || "Erro ao salvar.", "erro");
  }
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

// Início
(async function () {
  const r = await fetch("/api/ciclo");
  if (!r.ok) {
    if (r.status === 401) window.location.href = "/";
    return;
  }
  const cfg = await r.json();
  DIA_CICLO = cfg.dia_ciclo;
  PAPEL = cfg.papel;

  if (cfg.papel === "terceirizado") {
    document.getElementById("bloco-config").style.display = "block";
    if (DIA_CICLO) document.getElementById("dia-ciclo").value = DIA_CICLO;
  }

  if (DIA_CICLO) {
    setModoAtivo("0");
    carregarCiclo(0);
  } else {
    // sem ciclo definido: começa no modo personalizado (hoje)
    setModoAtivo("custom");
    document.getElementById("f-de").value = hojeStr();
    document.getElementById("f-ate").value = hojeStr();
    carregarCustom();
  }
})();
