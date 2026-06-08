// TecLog+ — login e cadastro
function mostrarMsg(texto, tipo) {
  const el = document.getElementById("msg");
  el.textContent = texto;
  el.className = "msg show " + tipo;
}

async function postJSON(url, body) {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, data };
}

// ---- Login ----
const formLogin = document.getElementById("form-login");
if (formLogin) {
  formLogin.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btn-entrar");
    btn.disabled = true;
    const { ok, data } = await postJSON("/api/login", {
      email: document.getElementById("email").value,
      senha: document.getElementById("senha").value,
    });
    if (ok) {
      window.location.href = data.admin ? "/admin" : "/dashboard";
    } else {
      mostrarMsg(data.erro || "Não foi possível entrar.", "erro");
      btn.disabled = false;
    }
  });
}

// ---- Cadastro ----
const formCadastro = document.getElementById("form-cadastro");
if (formCadastro) {
  formCadastro.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btn-criar");
    btn.disabled = true;
    const { ok, data } = await postJSON("/api/cadastro", {
      nome: document.getElementById("nome").value,
      email: document.getElementById("email").value,
      senha: document.getElementById("senha").value,
    });
    if (ok) {
      window.location.href = "/dashboard";
    } else {
      mostrarMsg(data.erro || "Não foi possível criar a conta.", "erro");
      btn.disabled = false;
    }
  });
}
