// TecLog+ — Registrar O.S. (criar + listar as do dia, editar/excluir)

let CLASSES = [];
let PAPEL = "terceirizado";

function msg(texto, tipo) {
  const el = document.getElementById("msg-os");
  el.textContent = texto;
  el.className = "msg show " + tipo;
}

function msgHTML(html, tipo) {
  const el = document.getElementById("msg-os");
  el.innerHTML = html;
  el.className = "msg show " + tipo;
}

function limparMsg() {
  const el = document.getElementById("msg-os");
  el.textContent = "";
  el.className = "msg";
}

function valorDaClasse(id) {
  const c = CLASSES.find((x) => x.id === Number(id));
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
    msgHTML(avisoZero(), "erro");
    if (btn) btn.disabled = true;
  } else {
    limparMsg();
    if (btn) btn.disabled = false;
  }
}

function brl(v) {
  return "R$ " + (Number(v) || 0).toFixed(2).replace(".", ",");
}

function hojeStr() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return d.getFullYear() + "-" + mm + "-" + dd;
}

function opcoesClasse(selecionada) {
  return CLASSES.map(
    (c) =>
      '<option value="' + c.id + '"' + (c.id === selecionada ? " selected" : "") + ">" + c.nome + "</option>"
  ).join("");
}

async function carregarFormData() {
  const r = await fetch("/api/os/form-data");
  if (!r.ok) {
    if (r.status === 401) window.location.href = "/";
    return;
  }
  const data = await r.json();
  CLASSES = data.classes;
  PAPEL = data.papel || "terceirizado";
  const sel = document.getElementById("os-classe");
  if (CLASSES.length === 0) {
    sel.innerHTML = '<option value="">— crie uma classe na aba Valores —</option>';
  } else {
    sel.innerHTML =
      '<option value="">Selecione…</option>' +
      CLASSES.map((c) =>
        '<option value="' + c.id + '">' + c.nome +
        ((Number(c.valor) || 0) <= 0 ? " — sem valor" : "") + "</option>"
      ).join("");
  }
  document.getElementById("os-data").value = hojeStr();
}

async function carregarLista() {
  const r = await fetch("/api/os/hoje");
  if (!r.ok) return;
  const data = await r.json();
  const ul = document.getElementById("lista-os");
  ul.innerHTML = "";

  document.getElementById("resumo").textContent =
    data.os.length + (data.os.length === 1 ? " O.S. · " : " O.S. · ") + brl(data.total);

  if (data.os.length === 0) {
    ul.innerHTML = '<li class="empty">Nenhuma O.S. registrada hoje ainda.</li>';
    return;
  }

  data.os.forEach((o) => {
    const li = document.createElement("li");
    li.className = "list-item";

    const info = document.createElement("div");
    info.className = "li-info";
    info.innerHTML =
      '<div class="li-main">' + o.cliente + "</div>" +
      '<div class="li-sub">' + o.classe + " · " + brl(o.valor_repasse) + "</div>";

    const acts = document.createElement("div");
    acts.className = "li-actions";
    const bEd = document.createElement("button");
    bEd.className = "btn-act editar";
    bEd.textContent = "Editar";
    bEd.addEventListener("click", () => modoEdicao(li, o));
    const bEx = document.createElement("button");
    bEx.className = "btn-act excluir";
    bEx.textContent = "Excluir";
    bEx.addEventListener("click", () => excluirOS(o));
    acts.appendChild(bEd);
    acts.appendChild(bEx);

    li.appendChild(info);
    li.appendChild(acts);
    ul.appendChild(li);
  });
}

// Edição inline de uma O.S.
function modoEdicao(li, o) {
  li.classList.add("editing");
  li.innerHTML = "";

  const cliente = document.createElement("input");
  cliente.className = "edit-input";
  cliente.type = "text";
  cliente.value = o.cliente;
  cliente.placeholder = "Cliente";

  const classe = document.createElement("select");
  classe.className = "edit-input";
  classe.innerHTML = opcoesClasse(o.classe_id);

  const dataInp = document.createElement("input");
  dataInp.className = "edit-input";
  dataInp.type = "date";
  dataInp.value = o.data_execucao;

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
      msg("O.S. atualizada.", "ok");
      carregarLista();
    } else {
      const d = await r.json().catch(() => ({}));
      msg(d.erro || "Erro ao salvar.", "erro");
    }
  });

  const cancelar = document.createElement("button");
  cancelar.className = "btn-act";
  cancelar.textContent = "Cancelar";
  cancelar.addEventListener("click", carregarLista);

  li.appendChild(cliente);
  li.appendChild(classe);
  li.appendChild(dataInp);
  li.appendChild(salvar);
  li.appendChild(cancelar);
  cliente.focus();
}

async function excluirOS(o) {
  if (!confirm('Excluir a O.S. do cliente "' + o.cliente + '"?')) return;
  const r = await fetch("/api/os/" + o.id, { method: "DELETE" });
  if (r.ok) {
    msg("O.S. excluída.", "ok");
    carregarLista();
  } else {
    const d = await r.json().catch(() => ({}));
    msg(d.erro || "Erro ao excluir.", "erro");
  }
}

document.getElementById("os-classe").addEventListener("change", avaliarClasse);

// Criar O.S.
document.getElementById("form-os").addEventListener("submit", async (e) => {
  e.preventDefault();
  const selVal = document.getElementById("os-classe").value;
  if (selVal && valorDaClasse(selVal) <= 0) {
    msgHTML(avisoZero(), "erro");
    return;
  }
  const r = await fetch("/api/os", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cliente: document.getElementById("os-cliente").value,
      classe_id: document.getElementById("os-classe").value
        ? Number(document.getElementById("os-classe").value)
        : null,
      data: document.getElementById("os-data").value,
    }),
  });
  if (r.ok) {
    document.getElementById("os-cliente").value = "";
    document.getElementById("os-classe").value = "";
    document.getElementById("os-data").value = hojeStr();
    msg("O.S. registrada! ✅", "ok");
    carregarLista();
    document.getElementById("os-cliente").focus();
  } else {
    const d = await r.json().catch(() => ({}));
    msg(d.erro || "Erro ao registrar.", "erro");
  }
});

document.getElementById("btn-sair").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "/";
});

(async function () {
  await carregarFormData();
  await carregarLista();
})();
