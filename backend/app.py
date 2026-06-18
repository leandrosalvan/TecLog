"""TecLog+ — servidor Flask (API + frontend estático)."""
import os
import re
import unicodedata
from datetime import date, datetime, timedelta
from functools import wraps
from flask import Flask, request, jsonify, session, send_from_directory, Response, redirect
from werkzeug.security import generate_password_hash, check_password_hash

from .database import get_db, init_db

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")

# Classes pré-definidas no cadastro + valor inicial do perfil tec1 (terceirizado)
CLASSES_PADRAO = [("INSTALAÇÃO", 0), ("SUPORTE", 0), ("DEVICES", 0)]  # nascem zeradas: o Líder define os valores reais


# Helpers de data/hora agnósticos ao banco (SQLite/Postgres). Usa o fuso do servidor
# (no Render, definir TZ=America/Sao_Paulo).
def _hoje():
    return datetime.now().strftime("%Y-%m-%d")


def _agora():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _mais_24h():
    return (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d %H:%M:%S")


def _garantir_admin():
    """Cria a conta de dono na 1ª subida (produção), a partir de ADMIN_EMAIL/ADMIN_SENHA.
    Não faz nada se ADMIN_SENHA não estiver definida (ex.: ambiente local)."""
    senha = os.environ.get("ADMIN_SENHA")
    if not senha:
        return
    email = os.environ.get("ADMIN_EMAIL", "admin@teclog.com").strip().lower()
    try:
        conn = get_db()
        try:
            if conn.execute("SELECT id FROM usuarios WHERE is_admin = 1").fetchone():
                return
            conn.execute(
                "INSERT INTO usuarios (nome, email, senha_hash, papel, is_admin) "
                "VALUES (?, ?, ?, 'terceirizado', 1)",
                ("Administrador TecLog+", email, generate_password_hash(senha)),
            )
            conn.commit()
        finally:
            conn.close()
    except Exception:
        pass


app = Flask(__name__, static_folder=None)
app.secret_key = os.environ.get("SECRET_KEY", "teclog-dev-secret-trocar-em-producao")

init_db()
_garantir_admin()


# ----------------------------------------------------------------------------
# Helpers de autenticação
# ----------------------------------------------------------------------------
def login_required(f):
    @wraps(f)
    def wrap(*args, **kwargs):
        if not session.get("uid"):
            return jsonify({"erro": "Não autenticado"}), 401
        return f(*args, **kwargs)
    return wrap


def terceirizado_required(f):
    @wraps(f)
    def wrap(*args, **kwargs):
        if session.get("papel") != "terceirizado" or session.get("is_admin"):
            return jsonify({"erro": "Você não tem permissão para isso."}), 403
        return f(*args, **kwargs)
    return wrap


def admin_required(f):
    @wraps(f)
    def wrap(*args, **kwargs):
        if not session.get("is_admin"):
            return jsonify({"erro": "Acesso restrito ao dono da plataforma."}), 403
        return f(*args, **kwargs)
    return wrap


# Régua de inadimplência (dias de atraso após o vencimento)
CARENCIA_DIAS = 7      # até 7 dias: nada acontece
SUSPENSAO_DIAS = 15    # acima de 15 dias: somente leitura
MSG_PENDENTE = "Há uma pendência no seu cadastro. Regularize para manter o acesso completo."
MSG_SUSPENSO = "Acesso somente leitura: cadastro com pendência. Fale com o suporte para regularizar."
MSG_TESTE = "Seu período de teste expirou. Fale com o suporte para contratar e liberar o acesso completo."


def _estado_assinatura(conn, ativo, vencimento, plano, teste_expira):
    """Calcula o estado a partir dos dados do dono."""
    if not ativo:
        return {"estado": "suspenso", "dias_atraso": None}
    # Plano TESTE: expira em 24h e suspende direto (sem carência)
    if plano and plano.strip().lower() == "teste" and teste_expira:
        agora = _agora()
        if agora > teste_expira:
            return {"estado": "suspenso", "dias_atraso": None, "teste": True}
        return {"estado": "ok", "dias_atraso": None, "teste": True}
    # Planos normais: régua de carência/pendência por dias de atraso
    if vencimento:
        hoje = date.fromisoformat(_hoje())
        try:
            venc = date.fromisoformat(vencimento)
        except ValueError:
            return {"estado": "ok", "dias_atraso": None}
        atraso = (hoje - venc).days
        if atraso > SUSPENSAO_DIAS:
            return {"estado": "suspenso", "dias_atraso": atraso}
        if atraso > CARENCIA_DIAS:
            return {"estado": "pendente", "dias_atraso": atraso}
        return {"estado": "ok", "dias_atraso": atraso}
    return {"estado": "ok", "dias_atraso": None}


def _status_conta(conn, uid):
    """Estado da conta (o dono dela): 'ok' | 'pendente' (aviso) | 'suspenso' (só leitura)."""
    u = conn.execute("SELECT papel, terceirizado_id FROM usuarios WHERE id = ?", (uid,)).fetchone()
    if not u:
        return {"estado": "ok", "dias_atraso": None}
    dono_id = uid if u["papel"] == "terceirizado" else u["terceirizado_id"]
    dono = conn.execute(
        "SELECT ativo, vencimento, plano, teste_expira FROM usuarios WHERE id = ?", (dono_id,)
    ).fetchone()
    if not dono:
        return {"estado": "suspenso", "dias_atraso": None, "mensagem": MSG_SUSPENSO}
    st = _estado_assinatura(conn, dono["ativo"], dono["vencimento"], dono["plano"], dono["teste_expira"])
    if st["estado"] == "suspenso":
        st["mensagem"] = MSG_TESTE if st.get("teste") else MSG_SUSPENSO
    elif st["estado"] == "pendente":
        st["mensagem"] = MSG_PENDENTE
    return st


@app.before_request
def _bloqueia_escrita_se_suspenso():
    """Suspenso (manual ou +15 dias de atraso) = somente leitura: bloqueia escrita."""
    if request.method not in ("POST", "PATCH", "PUT", "DELETE"):
        return
    if not request.path.startswith("/api/") or request.path in ("/api/login", "/api/logout"):
        return
    if session.get("is_admin"):
        return
    uid = session.get("uid")
    if not uid:
        return
    conn = get_db()
    try:
        if _status_conta(conn, uid)["estado"] == "suspenso":
            return jsonify({"erro": MSG_SUSPENSO}), 403
    finally:
        conn.close()


def _desloca_meses(d, n):
    """Retorna a data 'd' deslocada de n meses (n negativo = para trás). dia 1-28."""
    m = d.month - 1 + n
    y = d.year + m // 12
    m = m % 12 + 1
    return date(y, m, d.day)


def _ciclo_range(hoje, dia, offset):
    """(início, fim) do ciclo. offset 0 = atual, 1 = anterior, 2 = -2 ciclos..."""
    if hoje.day >= dia:
        inicio_atual = date(hoje.year, hoje.month, dia)
    else:
        inicio_atual = _desloca_meses(date(hoje.year, hoje.month, dia), -1)
    inicio = _desloca_meses(inicio_atual, -offset)
    fim = _desloca_meses(inicio, 1) - timedelta(days=1)
    return inicio, fim


# ----------------------------------------------------------------------------
# Páginas (frontend)
# ----------------------------------------------------------------------------
@app.route("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/cadastro")
def cadastro_page():
    # Cadastro público desativado: redireciona para a página de planos.
    return redirect("/planos")


@app.route("/home")
def home_page():
    # Home do app: Relatório de Ganhos + registro de O.S.
    return send_from_directory(FRONTEND_DIR, "home.html")


@app.route("/dashboard")
def dashboard_page():
    # Dashboard antiga virou a Home (/home).
    return redirect("/home")


@app.route("/equipe")
def equipe_page():
    return send_from_directory(FRONTEND_DIR, "equipe.html")


@app.route("/valores")
def valores_page():
    return send_from_directory(FRONTEND_DIR, "valores.html")


@app.route("/registrar")
def registrar_page():
    # Registro de O.S. unificado na Home (/home).
    return redirect("/home")


@app.route("/ordens")
def ordens_page():
    # Rota antiga mantida para compatibilidade.
    return redirect("/home")


@app.route("/notificacoes")
def notificacoes_page():
    return send_from_directory(FRONTEND_DIR, "notificacoes.html")


@app.route("/perfil")
def perfil_page():
    return send_from_directory(FRONTEND_DIR, "perfil.html")


@app.route("/admin")
def admin_page():
    return send_from_directory(FRONTEND_DIR, "admin.html")


@app.route("/admin/equipe")
def admin_equipe_page():
    return send_from_directory(FRONTEND_DIR, "admin_equipe.html")


@app.route("/admin/clientes")
def admin_clientes_page():
    return send_from_directory(FRONTEND_DIR, "admin_clientes.html")


@app.route("/admin/conta")
def admin_conta_page():
    return send_from_directory(FRONTEND_DIR, "admin_conta.html")


@app.route("/admin/financas")
def admin_financas_page():
    return send_from_directory(FRONTEND_DIR, "admin_financas.html")


@app.route("/planos")
def planos_page():
    return send_from_directory(FRONTEND_DIR, "planos.html")


@app.route("/uploads/<path:filename>")
def uploads(filename):
    return send_from_directory(UPLOADS_DIR, filename)


@app.route("/<path:filename>")
def arquivos(filename):
    return send_from_directory(FRONTEND_DIR, filename)


# ----------------------------------------------------------------------------
# Autenticação
# ----------------------------------------------------------------------------
def _slug(s):
    """minúsculo, sem acento, só letras/números."""
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]", "", s.lower())


def _dominio_equipe(apelido_ou_nome):
    """Domínio dos e-mails da equipe, a partir do apelido da empresa: 'FullNet' -> fullnet.teclog"""
    return (_slug(apelido_ou_nome) or "equipe") + ".teclog"


def _local_email(nome, sobrenome):
    """Parte antes do @: inicial de todos os nomes + último por inteiro. 'João Pedro Silva' -> jpsilva"""
    partes = [p for p in (str(nome or "") + " " + str(sobrenome or "")).split() if p.strip()]
    if not partes:
        return ""
    if len(partes) == 1:
        return _slug(partes[0])
    iniciais = "".join(_slug(p)[:1] for p in partes[:-1])
    return iniciais + _slug(partes[-1])


def _gerar_email_login(conn, apelido_ou_nome, nome, sobrenome, excluir_id=None):
    """Gera e-mail/login único no padrão da equipe: local@apelido.teclog (jsilva, jsilva2, ...).
    excluir_id: id de usuário a ignorar na checagem de conflito (pra regenerar o próprio e-mail)."""
    local = _local_email(nome, sobrenome) or "user"
    dominio = _dominio_equipe(apelido_ou_nome)
    email = local + "@" + dominio
    n = 1
    while True:
        r = conn.execute("SELECT id FROM usuarios WHERE email = ?", (email,)).fetchone()
        if r is None or r["id"] == excluir_id:
            return email
        n += 1
        email = local + str(n) + "@" + dominio


def _parse_valor(v):
    """Converte um valor monetário (str/num, com vírgula ou ponto) em float ou None."""
    if v is None:
        return None
    s = str(v).strip().replace("R$", "").replace(" ", "").replace(",", ".")
    if s == "":
        return None
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def _criar_terceirizado(conn, nome, email, senha, vencimento=None, plano=None, limite=None,
                        telefone=None, teste_expira=None, valor_personalizado=None, apelido=None):
    """Cria um terceirizado completo (usuário + perfil principal + classes/valores padrão). Retorna o id."""
    cur = conn.execute(
        "INSERT INTO usuarios (nome, email, telefone, senha_hash, papel, vencimento, plano, limite_tecnicos, teste_expira, valor_personalizado, apelido) "
        "VALUES (?, ?, ?, ?, 'terceirizado', ?, ?, ?, ?, ?, ?)",
        (nome, email, telefone, generate_password_hash(senha), vencimento, plano, limite, teste_expira, valor_personalizado, apelido),
    )
    terc_id = cur.lastrowid
    cur = conn.execute(
        "INSERT INTO perfis (terceirizado_id, codigo, descricao, ordem) VALUES (?, '', ?, 1)",
        (terc_id, nome),
    )
    perfil_principal = cur.lastrowid
    conn.execute("UPDATE usuarios SET perfil_id = ? WHERE id = ?", (perfil_principal, terc_id))
    for nome_cls, valor in CLASSES_PADRAO:
        c = conn.execute(
            "INSERT INTO classes_servico (terceirizado_id, nome) VALUES (?, ?)",
            (terc_id, nome_cls),
        )
        conn.execute(
            "INSERT INTO valores (classe_id, perfil_id, valor) VALUES (?, ?, ?)",
            (c.lastrowid, perfil_principal, valor),
        )
    return terc_id


@app.post("/api/cadastro")
def api_cadastro():
    # Cadastro público DESATIVADO — as contas são criadas pelo dono da plataforma.
    return jsonify({"erro": "O cadastro é feito pela nossa equipe. Conheça os planos e fale com a gente."}), 403


@app.post("/api/login")
def api_login():
    data = request.get_json(force=True) or {}
    email = (data.get("email") or "").strip().lower()
    senha = data.get("senha") or ""

    conn = get_db()
    try:
        u = conn.execute("SELECT * FROM usuarios WHERE email = ?", (email,)).fetchone()
        if not u or not check_password_hash(u["senha_hash"], senha):
            return jsonify({"erro": "E-mail ou senha inválidos."}), 401
        # Entra mesmo se suspenso/vencido (modo somente leitura é tratado nas escritas).
        session["uid"] = u["id"]
        session["papel"] = u["papel"]
        session["is_admin"] = bool(u["is_admin"])
        if u["is_admin"]:
            return jsonify({"ok": True, "admin": True})
        return jsonify({"ok": True, "papel": u["papel"]})
    finally:
        conn.close()


@app.post("/api/logout")
def api_logout():
    session.clear()
    return jsonify({"ok": True})


@app.get("/api/me")
def api_me():
    uid = session.get("uid")
    if not uid:
        return jsonify({"erro": "Não autenticado"}), 401
    conn = get_db()
    try:
        u = conn.execute(
            "SELECT id, nome, email, papel FROM usuarios WHERE id = ?", (uid,)
        ).fetchone()
        if not u:
            session.clear()
            return jsonify({"erro": "Não autenticado"}), 401
        d = dict(u)
        d["status"] = _status_conta(conn, uid)
        return jsonify(d)
    finally:
        conn.close()


@app.get("/api/perfil")
@login_required
def api_meus_dados_get():
    uid = session["uid"]
    conn = get_db()
    try:
        u = conn.execute(
            "SELECT nome, email, telefone, papel FROM usuarios WHERE id = ?", (uid,)
        ).fetchone()
        if not u:
            return jsonify({"erro": "Não autenticado"}), 401
        return jsonify(dict(u))
    finally:
        conn.close()


@app.patch("/api/perfil")
@login_required
def api_meus_dados_editar():
    uid = session["uid"]
    data = request.get_json(force=True) or {}
    telefone = (data.get("telefone") or "").strip() or None
    conn = get_db()
    try:
        conn.execute("UPDATE usuarios SET telefone = ? WHERE id = ?", (telefone, uid))
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


# ----------------------------------------------------------------------------
# Painel do DONO da plataforma — gestão de clientes (terceirizados)
# ----------------------------------------------------------------------------
@app.get("/api/admin/clientes")
@login_required
@admin_required
def api_admin_clientes():
    conn = get_db()
    try:
        clientes = []
        for r in conn.execute(
            "SELECT u.id, u.nome, u.email, u.telefone, u.ativo, u.vencimento, u.plano, u.limite_tecnicos, u.teste_expira, u.valor_personalizado, u.apelido, u.criado_em, "
            "(SELECT COUNT(*) FROM usuarios q WHERE q.terceirizado_id = u.id AND q.papel='quarteirizado') AS tecnicos "
            "FROM usuarios u WHERE u.papel='terceirizado' AND u.is_admin = 0 "
            "ORDER BY u.ativo DESC, u.nome"
        ):
            d = dict(r)
            d["ativo"] = bool(r["ativo"])
            d["valor_personalizado"] = float(r["valor_personalizado"]) if r["valor_personalizado"] is not None else None
            est = _estado_assinatura(conn, r["ativo"], r["vencimento"], r["plano"], r["teste_expira"])
            d["estado"] = est["estado"]
            d["dias_atraso"] = est.get("dias_atraso")
            d["teste"] = est.get("teste", False)
            clientes.append(d)
        return jsonify({"clientes": clientes})
    finally:
        conn.close()


@app.post("/api/admin/clientes")
@login_required
@admin_required
def api_admin_criar():
    data = request.get_json(force=True) or {}
    nome = (data.get("nome") or "").strip()
    sobrenome = (data.get("sobrenome") or "").strip()
    apelido = (data.get("apelido") or "").strip()
    senha = data.get("senha") or ""
    telefone = (data.get("telefone") or "").strip() or None
    vencimento = (data.get("vencimento") or "").strip() or None
    plano = (data.get("plano") or "").strip() or None
    limite = data.get("limite_tecnicos")
    limite = int(limite) if str(limite).isdigit() else None
    valor = _parse_valor(data.get("valor_personalizado")) if (plano or "").strip().lower() == "personalizado" else None
    if not nome or not sobrenome or not apelido or not senha:
        return jsonify({"erro": "Preencha nome, sobrenome, apelido da empresa e senha."}), 400
    if not _slug(apelido):
        return jsonify({"erro": "Apelido da empresa inválido (use letras ou números)."}), 400
    if len(senha) < 4:
        return jsonify({"erro": "A senha precisa ter pelo menos 4 caracteres."}), 400
    conn = get_db()
    try:
        teste_expira = None
        if plano and plano.strip().lower() == "teste":
            teste_expira = _mais_24h()
        email = _gerar_email_login(conn, apelido, nome, sobrenome)
        nome_completo = (nome + " " + sobrenome).strip()
        _criar_terceirizado(conn, nome_completo, email, senha, vencimento, plano, limite, telefone, teste_expira, valor, apelido)
        conn.commit()
        return jsonify({"ok": True, "email": email})
    finally:
        conn.close()


@app.patch("/api/admin/clientes/<int:cid>")
@login_required
@admin_required
def api_admin_editar(cid):
    data = request.get_json(force=True) or {}
    conn = get_db()
    try:
        c = conn.execute(
            "SELECT id FROM usuarios WHERE id = ? AND papel='terceirizado' AND is_admin = 0", (cid,)
        ).fetchone()
        if not c:
            return jsonify({"erro": "Cliente não encontrado."}), 404
        email_gerado = None
        if "ativo" in data:
            conn.execute("UPDATE usuarios SET ativo = ? WHERE id = ?", (1 if data["ativo"] else 0, cid))
        if "vencimento" in data:
            venc = (data.get("vencimento") or "").strip() or None
            conn.execute("UPDATE usuarios SET vencimento = ? WHERE id = ?", (venc, cid))
        if "plano" in data:
            plano = (data.get("plano") or "").strip() or None
            atual = conn.execute("SELECT plano FROM usuarios WHERE id = ?", (cid,)).fetchone()
            era_teste = bool(atual and (atual["plano"] or "").strip().lower() == "teste")
            conn.execute("UPDATE usuarios SET plano = ? WHERE id = ?", (plano, cid))
            if plano and plano.strip().lower() == "teste" and not era_teste:
                # começou um novo teste agora -> 24h
                exp = _mais_24h()
                conn.execute("UPDATE usuarios SET teste_expira = ? WHERE id = ?", (exp, cid))
            # saiu do Personalizado -> zera o valor custom
            if not (plano and plano.strip().lower() == "personalizado"):
                conn.execute("UPDATE usuarios SET valor_personalizado = NULL WHERE id = ?", (cid,))
        if "valor_personalizado" in data:
            val = _parse_valor(data.get("valor_personalizado"))
            conn.execute("UPDATE usuarios SET valor_personalizado = ? WHERE id = ?", (val, cid))
        if "limite_tecnicos" in data:
            lim = data.get("limite_tecnicos")
            lim = int(lim) if str(lim).isdigit() else None
            conn.execute("UPDATE usuarios SET limite_tecnicos = ? WHERE id = ?", (lim, cid))
        if "telefone" in data:
            tel = (data.get("telefone") or "").strip() or None
            conn.execute("UPDATE usuarios SET telefone = ? WHERE id = ?", (tel, cid))
        if "apelido" in data:
            ap = (data.get("apelido") or "").strip()
            if ap and not _slug(ap):
                return jsonify({"erro": "Apelido da empresa inválido (use letras ou números)."}), 400
            conn.execute("UPDATE usuarios SET apelido = ? WHERE id = ?", (ap or None, cid))
        nome_in = (data.get("nome") or "").strip()
        sobre_in = (data.get("sobrenome") or "").strip()
        nome_completo = (nome_in + " " + sobre_in).strip()
        if nome_completo:
            conn.execute("UPDATE usuarios SET nome = ? WHERE id = ?", (nome_completo, cid))
            # mantém o nome do perfil principal igual ao nome do cliente
            dono = conn.execute("SELECT perfil_id FROM usuarios WHERE id = ?", (cid,)).fetchone()
            if dono and dono["perfil_id"]:
                conn.execute("UPDATE perfis SET descricao = ? WHERE id = ?", (nome_completo, dono["perfil_id"]))
        # Redefinir e-mail = reler nome/sobrenome e regenerar pela regra de criação (com nº no conflito)
        if data.get("regenerar_email") and nome_in:
            row = conn.execute("SELECT nome, apelido FROM usuarios WHERE id = ?", (cid,)).fetchone()
            email_gerado = _gerar_email_login(conn, row["apelido"] or row["nome"], nome_in, sobre_in, excluir_id=cid)
            conn.execute("UPDATE usuarios SET email = ? WHERE id = ?", (email_gerado, cid))
        if data.get("senha"):
            if len(data["senha"]) < 4:
                return jsonify({"erro": "A senha precisa ter pelo menos 4 caracteres."}), 400
            conn.execute(
                "UPDATE usuarios SET senha_hash = ? WHERE id = ?",
                (generate_password_hash(data["senha"]), cid),
            )
        conn.commit()
        return jsonify({"ok": True, "email": email_gerado})
    finally:
        conn.close()


@app.post("/api/admin/senha")
@login_required
@admin_required
def api_admin_senha():
    uid = session["uid"]
    data = request.get_json(force=True) or {}
    atual = data.get("atual") or ""
    nova = data.get("nova") or ""
    if len(nova) < 4:
        return jsonify({"erro": "A nova senha precisa ter pelo menos 4 caracteres."}), 400
    conn = get_db()
    try:
        u = conn.execute("SELECT senha_hash FROM usuarios WHERE id = ?", (uid,)).fetchone()
        if not u or not check_password_hash(u["senha_hash"], atual):
            return jsonify({"erro": "Senha atual incorreta."}), 403
        conn.execute("UPDATE usuarios SET senha_hash = ? WHERE id = ?",
                     (generate_password_hash(nova), uid))
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


@app.delete("/api/admin/clientes/<int:cid>")
@login_required
@admin_required
def api_admin_excluir(cid):
    conn = get_db()
    try:
        c = conn.execute(
            "SELECT id FROM usuarios WHERE id = ? AND papel='terceirizado' AND is_admin = 0", (cid,)
        ).fetchone()
        if not c:
            return jsonify({"erro": "Cliente não encontrado."}), 404
        users = [r["id"] for r in conn.execute(
            "SELECT id FROM usuarios WHERE id = ? OR terceirizado_id = ?", (cid, cid))]
        oss = [r["id"] for r in conn.execute(
            "SELECT id FROM ordens_servico WHERE terceirizado_id = ?", (cid,))]
        perfis = [r["id"] for r in conn.execute(
            "SELECT id FROM perfis WHERE terceirizado_id = ?", (cid,))]
        # quebra o ciclo de FK usuarios.perfil_id <-> perfis.terceirizado_id
        conn.execute("UPDATE usuarios SET perfil_id = NULL WHERE id = ? OR terceirizado_id = ?", (cid, cid))
        if users:
            q = ",".join("?" * len(users)); conn.execute(f"DELETE FROM notificacoes WHERE usuario_id IN ({q})", users)
        if oss:
            q = ",".join("?" * len(oss)); conn.execute(f"DELETE FROM notificacoes WHERE os_id IN ({q})", oss)
        conn.execute("DELETE FROM ordens_servico WHERE terceirizado_id = ?", (cid,))
        if perfis:
            q = ",".join("?" * len(perfis)); conn.execute(f"DELETE FROM valores WHERE perfil_id IN ({q})", perfis)
        conn.execute("DELETE FROM clientes WHERE terceirizado_id = ?", (cid,))
        conn.execute("DELETE FROM perfis WHERE terceirizado_id = ?", (cid,))
        conn.execute("DELETE FROM classes_servico WHERE terceirizado_id = ?", (cid,))
        conn.execute("DELETE FROM usuarios WHERE terceirizado_id = ?", (cid,))  # técnicos primeiro
        conn.execute("DELETE FROM usuarios WHERE id = ?", (cid,))               # depois o cliente
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


@app.get("/api/admin/clientes/<int:cid>/equipe")
@login_required
@admin_required
def api_admin_equipe(cid):
    conn = get_db()
    try:
        cliente = conn.execute(
            "SELECT id, nome, email, telefone FROM usuarios "
            "WHERE id = ? AND papel = 'terceirizado' AND is_admin = 0", (cid,)
        ).fetchone()
        if not cliente:
            return jsonify({"erro": "Cliente não encontrado."}), 404
        tecnicos = [dict(r) for r in conn.execute(
            "SELECT u.id, u.nome, u.email, u.telefone, p.descricao AS perfil_titulo "
            "FROM usuarios u LEFT JOIN perfis p ON p.id = u.perfil_id "
            "WHERE u.terceirizado_id = ? AND u.papel = 'quarteirizado' ORDER BY u.nome",
            (cid,)
        )]
        return jsonify({"cliente": dict(cliente), "tecnicos": tecnicos})
    finally:
        conn.close()


@app.patch("/api/admin/tecnicos/<int:tid>")
@login_required
@admin_required
def api_admin_tecnico_editar(tid):
    data = request.get_json(force=True) or {}
    nome = (data.get("nome") or "").strip()
    telefone = (data.get("telefone") or "").strip() or None
    senha = data.get("senha") or ""
    if not nome:
        return jsonify({"erro": "Informe o nome."}), 400
    conn = get_db()
    try:
        t = conn.execute(
            "SELECT id FROM usuarios WHERE id = ? AND papel = 'quarteirizado'", (tid,)
        ).fetchone()
        if not t:
            return jsonify({"erro": "Técnico não encontrado."}), 404
        if senha:
            if len(senha) < 4:
                return jsonify({"erro": "A senha precisa ter pelo menos 4 caracteres."}), 400
            conn.execute("UPDATE usuarios SET nome = ?, telefone = ?, senha_hash = ? WHERE id = ?",
                         (nome, telefone, generate_password_hash(senha), tid))
        else:
            conn.execute("UPDATE usuarios SET nome = ?, telefone = ? WHERE id = ?", (nome, telefone, tid))
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


# ----------------------------------------------------------------------------
# Equipe (perfis de repasse + quarteirizados) — só o terceirizado
# ----------------------------------------------------------------------------
@app.get("/api/equipe")
@login_required
@terceirizado_required
def api_equipe_listar():
    terc = session["uid"]
    conn = get_db()
    try:
        owner = conn.execute("SELECT perfil_id, nome, apelido FROM usuarios WHERE id = ?", (terc,)).fetchone()
        principal_id = owner["perfil_id"] if owner else None
        dominio = _dominio_equipe((owner["apelido"] or owner["nome"]) if owner else "")

        prontos = _perfis_prontos_ids(conn, terc)
        perfis = []
        for r in conn.execute(
            "SELECT id, descricao, ordem FROM perfis "
            "WHERE terceirizado_id = ? AND ativo = 1 "
            "ORDER BY (id <> ?), ordem, id",  # principal sempre primeiro
            (terc, principal_id if principal_id is not None else -1)
        ):
            d = dict(r)
            d["principal"] = (r["id"] == principal_id)
            d["pronto"] = (r["id"] in prontos)
            perfis.append(d)

        tecnicos = [dict(r) for r in conn.execute(
            "SELECT u.id, u.nome, u.email, u.telefone, u.ativo, "
            "       p.id AS perfil_id, p.descricao AS perfil_titulo "
            "FROM usuarios u LEFT JOIN perfis p ON p.id = u.perfil_id "
            "WHERE u.terceirizado_id = ? AND u.papel = 'quarteirizado' "
            "ORDER BY u.nome", (terc,)
        )]
        return jsonify({"perfis": perfis, "tecnicos": tecnicos, "dominio": dominio})
    finally:
        conn.close()


@app.post("/api/perfis")
@login_required
@terceirizado_required
def api_perfil_criar():
    terc = session["uid"]
    data = request.get_json(force=True) or {}
    titulo = (data.get("titulo") or data.get("descricao") or "").strip()
    if not titulo:
        return jsonify({"erro": "Dê um título ao perfil."}), 400
    conn = get_db()
    try:
        nova_ordem = conn.execute(
            "SELECT COALESCE(MAX(ordem), 0) + 1 AS n FROM perfis WHERE terceirizado_id = ?", (terc,)
        ).fetchone()["n"]
        cur = conn.execute(
            "INSERT INTO perfis (terceirizado_id, codigo, descricao, ordem) VALUES (?, '', ?, ?)",
            (terc, titulo, nova_ordem),
        )
        perfil_id = cur.lastrowid
        # Cria a coluna do perfil na matriz de valores (zerada) para cada classe
        for c in conn.execute(
            "SELECT id FROM classes_servico WHERE terceirizado_id = ?", (terc,)
        ):
            conn.execute(
                "INSERT OR IGNORE INTO valores (classe_id, perfil_id, valor) VALUES (?, ?, 0)",
                (c["id"], perfil_id),
            )
        conn.commit()
        return jsonify({"ok": True, "id": perfil_id})
    finally:
        conn.close()


@app.post("/api/equipe")
@login_required
@terceirizado_required
def api_tecnico_criar():
    terc = session["uid"]
    data = request.get_json(force=True) or {}
    nome = (data.get("nome") or "").strip()
    sobrenome = (data.get("sobrenome") or "").strip()
    senha = data.get("senha") or ""
    telefone = (data.get("telefone") or "").strip() or None
    perfil_id = data.get("perfil_id") or None
    perfil_id = int(perfil_id) if perfil_id else None

    if not nome or not sobrenome:
        return jsonify({"erro": "Preencha nome e sobrenome."}), 400
    if len(senha) < 4:
        return jsonify({"erro": "A senha precisa ter pelo menos 4 caracteres."}), 400

    conn = get_db()
    try:
        # Limite de técnicos do plano (NULL = sem limite)
        lim_row = conn.execute("SELECT limite_tecnicos, nome, apelido FROM usuarios WHERE id = ?", (terc,)).fetchone()
        limite = lim_row["limite_tecnicos"] if lim_row else None
        if limite is not None:
            atual = conn.execute(
                "SELECT COUNT(*) AS c FROM usuarios WHERE terceirizado_id = ? AND papel='quarteirizado'", (terc,)
            ).fetchone()["c"]
            if atual >= limite:
                return jsonify({"erro": "Limite de técnicos do seu plano atingido. Fale com o suporte para liberar mais logins."}), 403
        # Trava: precisa de um perfil com valores definidos (≥1 > 0)
        erro = _validar_perfil_para_tecnico(conn, terc, perfil_id)
        if erro:
            return jsonify({"erro": erro}), 400
        # E-mail gerado automaticamente (único) no padrão da equipe do líder
        email = _gerar_email_login(conn, lim_row["apelido"] or lim_row["nome"], nome, sobrenome)
        nome_completo = (nome + " " + sobrenome).strip()
        conn.execute(
            "INSERT INTO usuarios (nome, email, telefone, senha_hash, papel, terceirizado_id, perfil_id) "
            "VALUES (?, ?, ?, ?, 'quarteirizado', ?, ?)",
            (nome_completo, email, telefone, generate_password_hash(senha), terc, perfil_id),
        )
        conn.commit()
        return jsonify({"ok": True, "email": email})
    finally:
        conn.close()


@app.patch("/api/perfis/<int:perfil_id>")
@login_required
@terceirizado_required
def api_perfil_editar(perfil_id):
    terc = session["uid"]
    data = request.get_json(force=True) or {}
    titulo = (data.get("titulo") or data.get("descricao") or "").strip()
    if not titulo:
        return jsonify({"erro": "Dê um título ao perfil."}), 400
    conn = get_db()
    try:
        p = conn.execute(
            "SELECT id FROM perfis WHERE id = ? AND terceirizado_id = ?", (perfil_id, terc)
        ).fetchone()
        if not p:
            return jsonify({"erro": "Perfil não encontrado."}), 404
        owner = conn.execute("SELECT perfil_id FROM usuarios WHERE id = ?", (terc,)).fetchone()
        if owner and owner["perfil_id"] == perfil_id:
            return jsonify({"erro": "O nome do seu perfil principal vem do seu cadastro e não é editável aqui."}), 400
        conn.execute("UPDATE perfis SET descricao = ? WHERE id = ?", (titulo, perfil_id))
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


@app.delete("/api/perfis/<int:perfil_id>")
@login_required
@terceirizado_required
def api_perfil_excluir(perfil_id):
    terc = session["uid"]
    conn = get_db()
    try:
        p = conn.execute(
            "SELECT id FROM perfis WHERE id = ? AND terceirizado_id = ?", (perfil_id, terc)
        ).fetchone()
        if not p:
            return jsonify({"erro": "Perfil não encontrado."}), 404
        owner = conn.execute("SELECT perfil_id FROM usuarios WHERE id = ?", (terc,)).fetchone()
        if owner and owner["perfil_id"] == perfil_id:
            return jsonify({"erro": "O seu perfil principal não pode ser excluído."}), 400
        em_uso = conn.execute(
            "SELECT COUNT(*) AS c FROM usuarios WHERE perfil_id = ?", (perfil_id,)
        ).fetchone()["c"]
        if em_uso:
            return jsonify({"erro": "Há técnicos usando este perfil. Troque o perfil deles antes de excluir."}), 400
        conn.execute("DELETE FROM valores WHERE perfil_id = ?", (perfil_id,))
        conn.execute("DELETE FROM perfis WHERE id = ?", (perfil_id,))
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


@app.patch("/api/equipe/<int:tecnico_id>")
@login_required
@terceirizado_required
def api_tecnico_editar(tecnico_id):
    terc = session["uid"]
    data = request.get_json(force=True) or {}
    nome = (data.get("nome") or "").strip()
    sobrenome = (data.get("sobrenome") or "").strip()
    senha = data.get("senha") or ""
    telefone = (data.get("telefone") or "").strip() or None
    perfil_id = data.get("perfil_id") or None
    perfil_id = int(perfil_id) if perfil_id else None
    regenerar = bool(data.get("regenerar_email"))
    nome_completo = (nome + " " + sobrenome).strip()

    if not nome_completo:
        return jsonify({"erro": "Preencha nome e sobrenome."}), 400

    conn = get_db()
    try:
        t = conn.execute(
            "SELECT id, perfil_id FROM usuarios WHERE id = ? AND terceirizado_id = ? AND papel = 'quarteirizado'",
            (tecnico_id, terc),
        ).fetchone()
        if not t:
            return jsonify({"erro": "Técnico não encontrado."}), 404
        # Só valida o perfil se está MUDANDO (mantém o atual mesmo que ainda não esteja "pronto")
        if perfil_id != t["perfil_id"]:
            erro = _validar_perfil_para_tecnico(conn, terc, perfil_id)
            if erro:
                return jsonify({"erro": erro}), 400
        if senha and len(senha) < 4:
            return jsonify({"erro": "A senha precisa ter pelo menos 4 caracteres."}), 400

        conn.execute("UPDATE usuarios SET nome = ?, telefone = ?, perfil_id = ? WHERE id = ?",
                     (nome_completo, telefone, perfil_id, tecnico_id))
        if senha:
            conn.execute("UPDATE usuarios SET senha_hash = ? WHERE id = ?",
                         (generate_password_hash(senha), tecnico_id))
        # Redefinir e-mail = reler nome/sobrenome e regenerar pela regra de criação (com nº no conflito)
        novo_email = None
        if regenerar:
            dono = conn.execute("SELECT nome, apelido FROM usuarios WHERE id = ?", (terc,)).fetchone()
            novo_email = _gerar_email_login(conn, dono["apelido"] or dono["nome"], nome, sobrenome, excluir_id=tecnico_id)
            conn.execute("UPDATE usuarios SET email = ? WHERE id = ?", (novo_email, tecnico_id))
        conn.commit()
        return jsonify({"ok": True, "email": novo_email})
    finally:
        conn.close()


@app.delete("/api/equipe/<int:tecnico_id>")
@login_required
@terceirizado_required
def api_tecnico_excluir(tecnico_id):
    terc = session["uid"]
    conn = get_db()
    try:
        t = conn.execute(
            "SELECT id FROM usuarios WHERE id = ? AND terceirizado_id = ? AND papel = 'quarteirizado'",
            (tecnico_id, terc),
        ).fetchone()
        if not t:
            return jsonify({"erro": "Técnico não encontrado."}), 404
        tem_os = conn.execute(
            "SELECT COUNT(*) AS c FROM ordens_servico WHERE tecnico_id = ?", (tecnico_id,)
        ).fetchone()["c"]
        if tem_os:
            return jsonify({"erro": "Este técnico tem O.S. registradas e não pode ser excluído."}), 400
        conn.execute("DELETE FROM usuarios WHERE id = ?", (tecnico_id,))
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


@app.post("/api/perfis/<int:perfil_id>/mover")
@login_required
@terceirizado_required
def api_perfil_mover(perfil_id):
    terc = session["uid"]
    data = request.get_json(force=True) or {}
    direcao = data.get("direcao")
    conn = get_db()
    try:
        owner = conn.execute("SELECT perfil_id FROM usuarios WHERE id = ?", (terc,)).fetchone()
        principal_id = owner["perfil_id"] if owner else None

        # O perfil principal é fixo no topo — não entra na reordenação
        if perfil_id == principal_id:
            return jsonify({"erro": "O perfil principal fica sempre no topo."}), 400

        ids = [r["id"] for r in conn.execute(
            "SELECT id FROM perfis WHERE terceirizado_id = ? AND ativo = 1 AND id <> ? "
            "ORDER BY ordem, id",
            (terc, principal_id if principal_id is not None else -1)
        )]
        if perfil_id not in ids:
            return jsonify({"erro": "Perfil não encontrado."}), 404
        idx = ids.index(perfil_id)
        alvo = idx - 1 if direcao == "subir" else idx + 1
        if 0 <= alvo < len(ids):
            ids[idx], ids[alvo] = ids[alvo], ids[idx]
            # principal mantém ordem 1; os demais seguem a partir de 2
            if principal_id is not None:
                conn.execute("UPDATE perfis SET ordem = 1 WHERE id = ?", (principal_id,))
            for pos, pid in enumerate(ids, start=2):
                conn.execute("UPDATE perfis SET ordem = ? WHERE id = ?", (pos, pid))
            conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


# ----------------------------------------------------------------------------
# Classes de serviço + matriz de Valores (classe × perfil) — só o terceirizado
# ----------------------------------------------------------------------------
def _perfis_prontos_ids(conn, terc):
    """IDs dos perfis com pelo menos um valor > 0 (prontos p/ receber técnicos)."""
    return {r["perfil_id"] for r in conn.execute(
        "SELECT DISTINCT v.perfil_id FROM valores v "
        "JOIN classes_servico c ON c.id = v.classe_id "
        "WHERE c.terceirizado_id = ? AND v.valor > 0", (terc,)
    )}


def _validar_perfil_para_tecnico(conn, terc, perfil_id):
    """Valida o perfil que será atribuído a um técnico. Retorna msg de erro ou None."""
    if not perfil_id:
        return "Atribua um perfil ao técnico. Crie um perfil e defina seus valores na aba Valores."
    p = conn.execute(
        "SELECT id, descricao FROM perfis WHERE id = ? AND terceirizado_id = ?", (perfil_id, terc)
    ).fetchone()
    if not p:
        return "Perfil inválido."
    owner = conn.execute("SELECT perfil_id FROM usuarios WHERE id = ?", (terc,)).fetchone()
    if owner and owner["perfil_id"] == perfil_id:
        return "O seu perfil principal não pode ser atribuído a um técnico."
    if perfil_id not in _perfis_prontos_ids(conn, terc):
        nome = p["descricao"] or "(sem título)"
        return 'Defina ao menos um valor (> 0) para o perfil "' + nome + '" na aba Valores antes de usá-lo.'
    return None


def _perfis_ordenados(conn, terc):
    owner = conn.execute("SELECT perfil_id FROM usuarios WHERE id = ?", (terc,)).fetchone()
    principal_id = owner["perfil_id"] if owner else None
    prontos = _perfis_prontos_ids(conn, terc)
    perfis = []
    for r in conn.execute(
        "SELECT id, descricao FROM perfis WHERE terceirizado_id = ? AND ativo = 1 "
        "ORDER BY (id <> ?), ordem, id",
        (terc, principal_id if principal_id is not None else -1)
    ):
        perfis.append({
            "id": r["id"],
            "descricao": r["descricao"],
            "principal": r["id"] == principal_id,
            "pronto": r["id"] in prontos,
        })
    return perfis


@app.get("/api/valores")
@login_required
@terceirizado_required
def api_valores_listar():
    terc = session["uid"]
    conn = get_db()
    try:
        classes = []
        for r in conn.execute(
            "SELECT id, nome, adicional_domingo FROM classes_servico WHERE terceirizado_id = ? AND ativo = 1 ORDER BY id",
            (terc,)
        ):
            d = dict(r)
            d["adicional_domingo"] = float(r["adicional_domingo"]) if r["adicional_domingo"] is not None else 0.0
            classes.append(d)
        perfis = _perfis_ordenados(conn, terc)
        matriz = {}
        for r in conn.execute(
            "SELECT v.classe_id, v.perfil_id, v.valor FROM valores v "
            "JOIN classes_servico c ON c.id = v.classe_id WHERE c.terceirizado_id = ?",
            (terc,)
        ):
            matriz.setdefault(str(r["classe_id"]), {})[str(r["perfil_id"])] = r["valor"]
        return jsonify({"classes": classes, "perfis": perfis, "valores": matriz})
    finally:
        conn.close()


@app.post("/api/classes")
@login_required
@terceirizado_required
def api_classe_criar():
    terc = session["uid"]
    data = request.get_json(force=True) or {}
    nome = (data.get("nome") or "").strip()
    adc = _parse_valor(data.get("adicional_domingo")) or 0
    if adc < 0:
        adc = 0
    if not nome:
        return jsonify({"erro": "Dê um nome à classe de serviço."}), 400
    conn = get_db()
    try:
        cur = conn.execute(
            "INSERT INTO classes_servico (terceirizado_id, nome, adicional_domingo) VALUES (?, ?, ?)", (terc, nome, adc)
        )
        classe_id = cur.lastrowid
        for p in conn.execute(
            "SELECT id FROM perfis WHERE terceirizado_id = ? AND ativo = 1", (terc,)
        ):
            conn.execute(
                "INSERT OR IGNORE INTO valores (classe_id, perfil_id, valor) VALUES (?, ?, 0)",
                (classe_id, p["id"]),
            )
        conn.commit()
        return jsonify({"ok": True, "id": classe_id})
    finally:
        conn.close()


@app.patch("/api/classes/<int:classe_id>")
@login_required
@terceirizado_required
def api_classe_editar(classe_id):
    terc = session["uid"]
    data = request.get_json(force=True) or {}
    nome = (data.get("nome") or "").strip()
    if not nome:
        return jsonify({"erro": "Dê um nome à classe de serviço."}), 400
    conn = get_db()
    try:
        c = conn.execute(
            "SELECT id FROM classes_servico WHERE id = ? AND terceirizado_id = ?", (classe_id, terc)
        ).fetchone()
        if not c:
            return jsonify({"erro": "Classe não encontrada."}), 404
        conn.execute("UPDATE classes_servico SET nome = ? WHERE id = ?", (nome, classe_id))
        if "adicional_domingo" in data:
            adc = _parse_valor(data.get("adicional_domingo")) or 0
            if adc < 0:
                adc = 0
            conn.execute("UPDATE classes_servico SET adicional_domingo = ? WHERE id = ?", (adc, classe_id))
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


@app.delete("/api/classes/<int:classe_id>")
@login_required
@terceirizado_required
def api_classe_excluir(classe_id):
    terc = session["uid"]
    conn = get_db()
    try:
        c = conn.execute(
            "SELECT id FROM classes_servico WHERE id = ? AND terceirizado_id = ?", (classe_id, terc)
        ).fetchone()
        if not c:
            return jsonify({"erro": "Classe não encontrada."}), 404
        tem_os = conn.execute(
            "SELECT COUNT(*) AS c FROM ordens_servico WHERE classe_id = ?", (classe_id,)
        ).fetchone()["c"]
        if tem_os:
            return jsonify({"erro": "Esta classe tem O.S. registradas e não pode ser excluída."}), 400
        conn.execute("DELETE FROM valores WHERE classe_id = ?", (classe_id,))
        conn.execute("DELETE FROM classes_servico WHERE id = ?", (classe_id,))
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


@app.post("/api/valores")
@login_required
@terceirizado_required
def api_valores_salvar():
    terc = session["uid"]
    data = request.get_json(force=True) or {}
    itens = data.get("valores") or []
    conn = get_db()
    try:
        classes_validas = {r["id"] for r in conn.execute(
            "SELECT id FROM classes_servico WHERE terceirizado_id = ?", (terc,))}
        perfis_validos = {r["id"] for r in conn.execute(
            "SELECT id FROM perfis WHERE terceirizado_id = ?", (terc,))}
        for it in itens:
            cid = it.get("classe_id")
            pid = it.get("perfil_id")
            try:
                valor = float(it.get("valor") or 0)
            except (TypeError, ValueError):
                valor = 0
            if valor < 0:
                valor = 0
            if cid in classes_validas and pid in perfis_validos:
                conn.execute(
                    "INSERT INTO valores (classe_id, perfil_id, valor) VALUES (?, ?, ?) "
                    "ON CONFLICT(classe_id, perfil_id) DO UPDATE SET valor = excluded.valor",
                    (cid, pid, valor),
                )
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


# ----------------------------------------------------------------------------
# Ordens de Serviço (registro manual) — terceirizado e técnicos
# ----------------------------------------------------------------------------
def _ctx_os(conn, uid):
    """Contexto do usuário logado para registrar O.S.: dono da operação e perfis."""
    u = conn.execute(
        "SELECT id, papel, terceirizado_id, perfil_id FROM usuarios WHERE id = ?", (uid,)
    ).fetchone()
    if not u:
        return None
    dono_id = u["id"] if u["papel"] == "terceirizado" else u["terceirizado_id"]
    dono = conn.execute("SELECT perfil_id FROM usuarios WHERE id = ?", (dono_id,)).fetchone()
    return {
        "dono_id": dono_id,
        "papel": u["papel"],
        "perfil_usuario": u["perfil_id"],
        "perfil_principal": dono["perfil_id"] if dono else None,
    }


def _erro_valor_zero(papel, nome_classe):
    """Mensagem de trava quando o valor (classe × perfil) é R$ 0,00."""
    if papel == "terceirizado":
        return ('A classe "' + nome_classe + '" está com valor R$ 0,00 para o seu perfil. '
                'Defina os valores na aba Valores antes de registrar a O.S.')
    return ('A classe "' + nome_classe + '" ainda está sem valor definido para o seu perfil. '
            'Peça ao líder da equipe para configurar os valores antes de registrar a O.S.')


def _valor_de(conn, classe_id, perfil_id):
    if not perfil_id:
        return 0
    r = conn.execute(
        "SELECT valor FROM valores WHERE classe_id = ? AND perfil_id = ?", (classe_id, perfil_id)
    ).fetchone()
    return r["valor"] if r else 0


def _eh_domingo(data_str):
    try:
        return date.fromisoformat((data_str or "")[:10]).weekday() == 6
    except (TypeError, ValueError):
        return False


def _adicional_domingo(conn, classe_id):
    r = conn.execute("SELECT adicional_domingo FROM classes_servico WHERE id = ?", (classe_id,)).fetchone()
    return float(r["adicional_domingo"]) if r and r["adicional_domingo"] is not None else 0.0


def _get_or_create_cliente(conn, dono_id, nome, tipo):
    cli = conn.execute(
        "SELECT id FROM clientes WHERE terceirizado_id = ? AND lower(nome) = lower(?)",
        (dono_id, nome),
    ).fetchone()
    if cli:
        return cli["id"]
    cur = conn.execute(
        "INSERT INTO clientes (terceirizado_id, nome, tipo) VALUES (?, ?, ?)",
        (dono_id, nome, tipo),
    )
    return cur.lastrowid


@app.get("/api/os/form-data")
@login_required
def api_os_formdata():
    uid = session["uid"]
    conn = get_db()
    try:
        ctx = _ctx_os(conn, uid)
        classes = []
        for r in conn.execute(
            "SELECT id, nome FROM classes_servico WHERE terceirizado_id = ? AND ativo = 1 ORDER BY id",
            (ctx["dono_id"],)
        ):
            classes.append({
                "id": r["id"],
                "nome": r["nome"],
                "valor": _valor_de(conn, r["id"], ctx["perfil_usuario"]),
            })
        hoje = _hoje()
        return jsonify({"classes": classes, "hoje": hoje, "papel": ctx["papel"]})
    finally:
        conn.close()


@app.post("/api/os")
@login_required
def api_os_criar():
    uid = session["uid"]
    data = request.get_json(force=True) or {}
    cliente_nome = (data.get("cliente") or "").strip()
    classe_id = data.get("classe_id")
    data_exec = (data.get("data") or "").strip()

    if not cliente_nome:
        return jsonify({"erro": "Informe o nome do cliente."}), 400
    if not classe_id:
        return jsonify({"erro": "Selecione a classe de serviço."}), 400

    conn = get_db()
    try:
        ctx = _ctx_os(conn, uid)
        dono_id = ctx["dono_id"]
        cls = conn.execute(
            "SELECT id FROM classes_servico WHERE id = ? AND terceirizado_id = ?",
            (classe_id, dono_id),
        ).fetchone()
        if not cls:
            return jsonify({"erro": "Classe inválida."}), 400
        if not data_exec:
            data_exec = _hoje()

        valor_repasse = _valor_de(conn, classe_id, ctx["perfil_usuario"])
        valor_cheio = _valor_de(conn, classe_id, ctx["perfil_principal"])
        # Trava: não registra O.S. com valor zerado (perfil sem valor para esta classe)
        if not valor_repasse or valor_repasse <= 0:
            nome_cls = conn.execute("SELECT nome FROM classes_servico WHERE id = ?", (classe_id,)).fetchone()["nome"]
            return jsonify({"erro": _erro_valor_zero(ctx["papel"], nome_cls)}), 400
        # Adicional de domingo (entra no repasse e no faturamento)
        if _eh_domingo(data_exec):
            adc = _adicional_domingo(conn, classe_id)
            valor_repasse = float(valor_repasse or 0) + adc
            valor_cheio = float(valor_cheio or 0) + adc

        cliente_id = _get_or_create_cliente(conn, dono_id, cliente_nome, None)
        conn.execute(
            "INSERT INTO ordens_servico "
            "(terceirizado_id, tecnico_id, cliente_id, classe_id, data_execucao, valor_repasse, valor_cheio) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (dono_id, uid, cliente_id, classe_id, data_exec, valor_repasse, valor_cheio),
        )
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


@app.get("/api/os/hoje")
@login_required
def api_os_hoje():
    uid = session["uid"]
    conn = get_db()
    try:
        hoje = _hoje()
        rows = [dict(r) for r in conn.execute(
            "SELECT o.id, cl.nome AS cliente, cl.tipo AS tipo, o.classe_id, "
            "       cs.nome AS classe, o.data_execucao, o.valor_repasse "
            "FROM ordens_servico o "
            "JOIN clientes cl ON cl.id = o.cliente_id "
            "JOIN classes_servico cs ON cs.id = o.classe_id "
            "WHERE o.tecnico_id = ? AND o.data_execucao = ? "
            "ORDER BY o.id DESC", (uid, hoje)
        )]
        total = sum((r["valor_repasse"] or 0) for r in rows)
        return jsonify({"os": rows, "total": total, "hoje": hoje})
    finally:
        conn.close()


@app.patch("/api/os/<int:os_id>")
@login_required
def api_os_editar(os_id):
    uid = session["uid"]
    data = request.get_json(force=True) or {}
    cliente_nome = (data.get("cliente") or "").strip()
    classe_id = data.get("classe_id")
    data_exec = (data.get("data") or "").strip()

    if not cliente_nome:
        return jsonify({"erro": "Informe o nome do cliente."}), 400
    if not classe_id:
        return jsonify({"erro": "Selecione a classe de serviço."}), 400

    conn = get_db()
    try:
        o = conn.execute(
            "SELECT id FROM ordens_servico WHERE id = ? AND tecnico_id = ?", (os_id, uid)
        ).fetchone()
        if not o:
            return jsonify({"erro": "O.S. não encontrada."}), 404
        ctx = _ctx_os(conn, uid)
        dono_id = ctx["dono_id"]
        cls = conn.execute(
            "SELECT id FROM classes_servico WHERE id = ? AND terceirizado_id = ?",
            (classe_id, dono_id),
        ).fetchone()
        if not cls:
            return jsonify({"erro": "Classe inválida."}), 400
        if not data_exec:
            data_exec = _hoje()

        valor_repasse = _valor_de(conn, classe_id, ctx["perfil_usuario"])
        valor_cheio = _valor_de(conn, classe_id, ctx["perfil_principal"])
        if not valor_repasse or valor_repasse <= 0:
            nome_cls = conn.execute("SELECT nome FROM classes_servico WHERE id = ?", (classe_id,)).fetchone()["nome"]
            return jsonify({"erro": _erro_valor_zero(ctx["papel"], nome_cls)}), 400
        if _eh_domingo(data_exec):
            adc = _adicional_domingo(conn, classe_id)
            valor_repasse = float(valor_repasse or 0) + adc
            valor_cheio = float(valor_cheio or 0) + adc

        cliente_id = _get_or_create_cliente(conn, dono_id, cliente_nome, None)
        conn.execute(
            "UPDATE ordens_servico SET cliente_id = ?, classe_id = ?, data_execucao = ?, "
            "valor_repasse = ?, valor_cheio = ? WHERE id = ?",
            (cliente_id, classe_id, data_exec, valor_repasse, valor_cheio, os_id),
        )
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


@app.delete("/api/os/<int:os_id>")
@login_required
def api_os_excluir(os_id):
    uid = session["uid"]
    conn = get_db()
    try:
        o = conn.execute(
            "SELECT id FROM ordens_servico WHERE id = ? AND tecnico_id = ?", (os_id, uid)
        ).fetchone()
        if not o:
            return jsonify({"erro": "O.S. não encontrada."}), 404
        conn.execute("DELETE FROM notificacoes WHERE os_id = ?", (os_id,))
        conn.execute("DELETE FROM ordens_servico WHERE id = ?", (os_id,))
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


@app.post("/api/os/reajustar")
@login_required
@terceirizado_required
def api_os_reajustar():
    """Recalcula valor_repasse/valor_cheio de TODAS as O.S. do dono com base no
    perfil ATUAL de cada técnico e na tabela de valores atual. Útil quando um técnico
    teve o perfil corrigido depois de já ter lançado O.S."""
    terc = session["uid"]
    conn = get_db()
    try:
        dono = conn.execute("SELECT perfil_id FROM usuarios WHERE id = ?", (terc,)).fetchone()
        principal = dono["perfil_id"] if dono else None
        # Matriz de valores do dono: (classe_id, perfil_id) -> valor
        matriz = {}
        for r in conn.execute(
            "SELECT v.classe_id, v.perfil_id, v.valor FROM valores v "
            "JOIN classes_servico c ON c.id = v.classe_id WHERE c.terceirizado_id = ?", (terc,)):
            matriz[(r["classe_id"], r["perfil_id"])] = r["valor"]
        # Perfil atual do dono + de cada técnico
        perfil_de = {}
        for r in conn.execute("SELECT id, perfil_id FROM usuarios WHERE id = ? OR terceirizado_id = ?", (terc, terc)):
            perfil_de[r["id"]] = r["perfil_id"]
        # Adicional de domingo por classe
        adc_de = {}
        for r in conn.execute("SELECT id, adicional_domingo FROM classes_servico WHERE terceirizado_id = ?", (terc,)):
            adc_de[r["id"]] = float(r["adicional_domingo"]) if r["adicional_domingo"] is not None else 0.0
        oss = [dict(r) for r in conn.execute(
            "SELECT id, tecnico_id, classe_id, data_execucao FROM ordens_servico WHERE terceirizado_id = ?", (terc,))]
        n = 0
        for o in oss:
            pf = perfil_de.get(o["tecnico_id"])
            vr = float(matriz.get((o["classe_id"], pf), 0) or 0)
            vc = float(matriz.get((o["classe_id"], principal), 0) or 0)
            if _eh_domingo(o["data_execucao"]):
                adc = adc_de.get(o["classe_id"], 0.0)
                vr += adc
                vc += adc
            conn.execute("UPDATE ordens_servico SET valor_repasse = ?, valor_cheio = ? WHERE id = ?",
                         (vr, vc, o["id"]))
            n += 1
        conn.commit()
        return jsonify({"ok": True, "atualizadas": n})
    finally:
        conn.close()


@app.get("/api/relatorio")
@login_required
def api_relatorio():
    uid = session["uid"]
    de = request.args.get("de") or ""
    ate = request.args.get("ate") or ""
    ciclo = request.args.get("ciclo")
    conn = get_db()
    try:
        u = conn.execute("SELECT papel, terceirizado_id FROM usuarios WHERE id = ?", (uid,)).fetchone()
        papel = u["papel"] if u else "quarteirizado"
        hoje_s = _hoje()

        if ciclo is not None and ciclo != "":
            dono_id = uid if papel == "terceirizado" else u["terceirizado_id"]
            dono = conn.execute("SELECT dia_ciclo FROM usuarios WHERE id = ?", (dono_id,)).fetchone()
            dia = dono["dia_ciclo"] if dono else None
            if dia:
                try:
                    offset = int(ciclo)
                except (TypeError, ValueError):
                    offset = 0
                ini, fim = _ciclo_range(date.fromisoformat(hoje_s), dia, offset)
                de, ate = ini.isoformat(), fim.isoformat()
            else:
                de, ate = (de or hoje_s), (ate or hoje_s)
        else:
            de, ate = (de or hoje_s), (ate or hoje_s)

        if papel == "terceirizado":
            rows = [dict(r) for r in conn.execute(
                "SELECT o.id, o.data_execucao, us.nome AS tecnico, "
                "       cl.nome AS cliente, cs.nome AS classe, o.sinalizada, "
                "       o.valor_repasse, o.valor_cheio, (o.tecnico_id = ?) AS eh_dono "
                "FROM ordens_servico o "
                "JOIN usuarios us ON us.id = o.tecnico_id "
                "JOIN clientes cl ON cl.id = o.cliente_id "
                "JOIN classes_servico cs ON cs.id = o.classe_id "
                "WHERE o.terceirizado_id = ? AND o.data_execucao BETWEEN ? AND ? "
                "ORDER BY o.data_execucao DESC, o.id DESC",
                (uid, uid, de, ate)
            )]
            bruto = sum((r["valor_cheio"] or 0) for r in rows)
            repasse_equipe = sum((r["valor_repasse"] or 0) for r in rows if not r["eh_dono"])
            # Margem (lucro do líder) = soma da diferença (cheio − repasse) por O.S.
            # A O.S. feita pelo próprio líder dá margem 0 (cheio = repasse do seu perfil).
            margem = sum((r["valor_cheio"] or 0) - (r["valor_repasse"] or 0) for r in rows)
            por = {}
            for r in rows:
                t = r["tecnico"]
                por.setdefault(t, {"tecnico": t, "qtd": 0, "repasse": 0})
                por[t]["qtd"] += 1
                por[t]["repasse"] += (r["valor_repasse"] or 0)
            resumo = {
                "qtd": len(rows),
                "bruto": bruto,
                "repasse_equipe": repasse_equipe,
                "margem": margem,
                "liquido": bruto - repasse_equipe,  # o que sobra pro líder (próprio cheio + margem)
                "sinalizadas": sum(1 for r in rows if r["sinalizada"]),
                "por_tecnico": sorted(por.values(), key=lambda x: -x["repasse"]),
            }
        else:
            rows = [dict(r) for r in conn.execute(
                "SELECT o.id, o.data_execucao, cl.nome AS cliente, cs.nome AS classe, o.valor_repasse "
                "FROM ordens_servico o "
                "JOIN clientes cl ON cl.id = o.cliente_id "
                "JOIN classes_servico cs ON cs.id = o.classe_id "
                "WHERE o.tecnico_id = ? AND o.data_execucao BETWEEN ? AND ? "
                "ORDER BY o.data_execucao DESC, o.id DESC",
                (uid, de, ate)
            )]
            resumo = {
                "qtd": len(rows),
                "meus_ganhos": sum((r["valor_repasse"] or 0) for r in rows),
            }

        return jsonify({"papel": papel, "de": de, "ate": ate, "os": rows, "resumo": resumo})
    finally:
        conn.close()


@app.get("/api/ciclo")
@login_required
def api_ciclo_get():
    uid = session["uid"]
    conn = get_db()
    try:
        u = conn.execute("SELECT papel, terceirizado_id FROM usuarios WHERE id = ?", (uid,)).fetchone()
        dono_id = uid if u["papel"] == "terceirizado" else u["terceirizado_id"]
        dono = conn.execute("SELECT dia_ciclo FROM usuarios WHERE id = ?", (dono_id,)).fetchone()
        return jsonify({"dia_ciclo": dono["dia_ciclo"] if dono else None, "papel": u["papel"]})
    finally:
        conn.close()


@app.post("/api/ciclo")
@login_required
@terceirizado_required
def api_ciclo_set():
    uid = session["uid"]
    data = request.get_json(force=True) or {}
    try:
        dia = int(data.get("dia_ciclo"))
    except (TypeError, ValueError):
        return jsonify({"erro": "Dia inválido."}), 400
    if dia < 1 or dia > 28:
        return jsonify({"erro": "Escolha um dia entre 1 e 28."}), 400
    conn = get_db()
    try:
        conn.execute("UPDATE usuarios SET dia_ciclo = ? WHERE id = ?", (dia, uid))
        conn.commit()
        return jsonify({"ok": True, "dia_ciclo": dia})
    finally:
        conn.close()


# ----------------------------------------------------------------------------
# Sinalização de O.S. (alerta/lembrete do dono, com descrição e imagem)
# ----------------------------------------------------------------------------
@app.post("/api/os/<int:os_id>/sinalizar")
@login_required
@terceirizado_required
def api_os_sinalizar(os_id):
    uid = session["uid"]
    descricao = (request.form.get("descricao") or "").strip()
    if not descricao:
        return jsonify({"erro": "Escreva uma descrição para a sinalização."}), 400
    conn = get_db()
    try:
        o = conn.execute(
            "SELECT tecnico_id FROM ordens_servico WHERE id = ? AND terceirizado_id = ?",
            (os_id, uid),
        ).fetchone()
        if not o:
            return jsonify({"erro": "O.S. não encontrada."}), 404

        agora = _agora()
        arquivo = request.files.get("imagem")
        if arquivo and arquivo.filename:
            dados = arquivo.read()
            conn.execute(
                "UPDATE ordens_servico SET sinalizada = 1, sinal_descricao = ?, "
                "sinal_imagem = 'img', sinal_imagem_dados = ?, sinal_por = ?, sinal_em = ? WHERE id = ?",
                (descricao, dados, uid, agora, os_id),
            )
        else:
            conn.execute(
                "UPDATE ordens_servico SET sinalizada = 1, sinal_descricao = ?, "
                "sinal_por = ?, sinal_em = ? WHERE id = ?",
                (descricao, uid, agora, os_id),
            )

        # Notifica o técnico responsável pela O.S. (se não for o próprio dono).
        # Re-sinalizar reseta o "visto" para o técnico reconfirmar.
        if o["tecnico_id"] != uid:
            existe = conn.execute(
                "SELECT id FROM notificacoes WHERE usuario_id = ? AND os_id = ?",
                (o["tecnico_id"], os_id),
            ).fetchone()
            if existe:
                conn.execute(
                    "UPDATE notificacoes SET titulo = ?, mensagem = ?, lida = 0, "
                    "confirmada = 0, confirmada_em = NULL, criado_em = ? WHERE id = ?",
                    ("O.S. sinalizada", descricao, agora, existe["id"]),
                )
            else:
                conn.execute(
                    "INSERT INTO notificacoes (usuario_id, os_id, titulo, mensagem, criado_em) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (o["tecnico_id"], os_id, "O.S. sinalizada", descricao, agora),
                )

        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


@app.get("/api/os/<int:os_id>/sinal")
@login_required
@terceirizado_required
def api_os_sinal_get(os_id):
    uid = session["uid"]
    conn = get_db()
    try:
        o = conn.execute(
            "SELECT sinalizada, sinal_descricao, sinal_imagem, sinal_em, tecnico_id "
            "FROM ordens_servico WHERE id = ? AND terceirizado_id = ?",
            (os_id, uid),
        ).fetchone()
        if not o:
            return jsonify({"erro": "O.S. não encontrada."}), 404
        visto = None
        if o["tecnico_id"] != uid:
            n = conn.execute(
                "SELECT confirmada, confirmada_em FROM notificacoes WHERE usuario_id = ? AND os_id = ?",
                (o["tecnico_id"], os_id),
            ).fetchone()
            if n:
                visto = {"confirmada": bool(n["confirmada"]), "em": n["confirmada_em"]}
        return jsonify({
            "sinalizada": bool(o["sinalizada"]),
            "descricao": o["sinal_descricao"] or "",
            "imagem": ("/api/os/%d/imagem" % os_id) if o["sinal_imagem"] else None,
            "em": o["sinal_em"],
            "visto": visto,
        })
    finally:
        conn.close()


@app.delete("/api/os/<int:os_id>/sinalizar")
@login_required
@terceirizado_required
def api_os_sinal_del(os_id):
    uid = session["uid"]
    conn = get_db()
    try:
        o = conn.execute(
            "SELECT id FROM ordens_servico WHERE id = ? AND terceirizado_id = ?",
            (os_id, uid),
        ).fetchone()
        if not o:
            return jsonify({"erro": "O.S. não encontrada."}), 404
        conn.execute(
            "UPDATE ordens_servico SET sinalizada = 0, sinal_descricao = NULL, "
            "sinal_imagem = NULL, sinal_imagem_dados = NULL, sinal_por = NULL, sinal_em = NULL WHERE id = ?",
            (os_id,),
        )
        conn.execute("DELETE FROM notificacoes WHERE os_id = ?", (os_id,))
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


@app.get("/api/os/<int:os_id>/imagem")
@login_required
def api_os_imagem(os_id):
    uid = session["uid"]
    conn = get_db()
    try:
        o = conn.execute(
            "SELECT terceirizado_id, tecnico_id, sinal_imagem_dados FROM ordens_servico WHERE id = ?",
            (os_id,),
        ).fetchone()
        if not o or not o["sinal_imagem_dados"]:
            return jsonify({"erro": "Sem imagem."}), 404
        u = conn.execute("SELECT papel FROM usuarios WHERE id = ?", (uid,)).fetchone()
        if u and u["papel"] == "terceirizado":
            permitido = o["terceirizado_id"] == uid
        else:
            permitido = o["tecnico_id"] == uid
        if not permitido:
            return jsonify({"erro": "Sem permissão."}), 403
        dados = o["sinal_imagem_dados"]
        if isinstance(dados, memoryview):
            dados = dados.tobytes()
        return Response(bytes(dados), mimetype="image/jpeg")
    finally:
        conn.close()


@app.get("/api/notificacoes")
@login_required
def api_notificacoes():
    uid = session["uid"]
    conn = get_db()
    try:
        rows = []
        for r in conn.execute(
            "SELECT n.id, n.confirmada, n.confirmada_em, n.criado_em, "
            "       o.id AS os_id, cl.nome AS cliente, cs.nome AS classe, o.data_execucao, "
            "       o.sinal_descricao AS descricao, o.sinal_imagem, us.nome AS de_quem "
            "FROM notificacoes n "
            "JOIN ordens_servico o ON o.id = n.os_id "
            "JOIN clientes cl ON cl.id = o.cliente_id "
            "JOIN classes_servico cs ON cs.id = o.classe_id "
            "LEFT JOIN usuarios us ON us.id = o.sinal_por "
            "WHERE n.usuario_id = ? "
            "ORDER BY n.confirmada ASC, n.criado_em DESC",
            (uid,)
        ):
            d = dict(r)
            d["imagem"] = ("/api/os/%d/imagem" % r["os_id"]) if r["sinal_imagem"] else None
            d.pop("sinal_imagem", None)
            d["confirmada"] = bool(r["confirmada"])
            rows.append(d)
        return jsonify({"notificacoes": rows})
    finally:
        conn.close()


@app.post("/api/notificacoes/<int:nid>/visto")
@login_required
def api_notificacao_visto(nid):
    uid = session["uid"]
    conn = get_db()
    try:
        n = conn.execute(
            "SELECT id FROM notificacoes WHERE id = ? AND usuario_id = ?", (nid, uid)
        ).fetchone()
        if not n:
            return jsonify({"erro": "Notificação não encontrada."}), 404
        agora = _agora()
        conn.execute(
            "UPDATE notificacoes SET lida = 1, confirmada = 1, confirmada_em = ? WHERE id = ?",
            (agora, nid),
        )
        conn.commit()
        return jsonify({"ok": True})
    finally:
        conn.close()


@app.get("/api/notificacoes/contagem")
@login_required
def api_notificacoes_contagem():
    uid = session["uid"]
    conn = get_db()
    try:
        n = conn.execute(
            "SELECT COUNT(*) AS c FROM notificacoes WHERE usuario_id = ? AND confirmada = 0", (uid,)
        ).fetchone()["c"]
        return jsonify({"pendentes": n})
    finally:
        conn.close()
