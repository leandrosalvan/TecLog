# TecLog+

Sistema web (mobile-first) para o **terceirizado** controlar, junto com seus **quarteirizados**, as **Ordens de Serviço (O.S.)** executadas — registro paralelo ao sistema do provedor, com controle de valores por perfil técnico e de O.S. repetidas.

## Stack
- **Backend:** Flask (Python) — API + serve o frontend.
- **Frontend:** HTML/CSS/JS puro, mobile-first (roda nos navegadores de iOS e Android).
- **Banco:** SQLite (`teclog.db`, criado automaticamente).

## Como rodar (local)
```bash
pip install -r requirements.txt
python run.py
```
Abra **http://127.0.0.1:5001** (NÃO abra o index.html direto).

## Estrutura
```
TecLog+/
├── run.py                # inicia o servidor (porta 5001)
├── schema.sql            # tabelas do banco
├── requirements.txt
├── backend/
│   ├── app.py            # rotas (auth + API)
│   └── database.py       # conexão SQLite
└── frontend/
    ├── index.html        # login
    ├── cadastro.html     # cadastro do terceirizado
    ├── dashboard.html    # painel
    ├── css/style.css
    └── js/{auth,dashboard}.js
```

## Conceitos
- **Papéis:** `terceirizado` (gestor + técnico) e `quarteirizado` (equipe).
- **Perfis técnicos:** `tec1` (terceirizado, valor cheio), `tec2`, `tec3`... (repasse parcial por contrato).
- **Valores:** matriz **classe de serviço × perfil técnico** (aba de Valores).
- **Classes padrão criadas no cadastro:** INSTALAÇÃO (100), SUPORTE (50), DEVICES (30) — editáveis.
- **O.S. repetida:** marcada pelo terceirizado a partir do relatório do provedor → gera notificação ao quarteirizado.

## Status (v1 — em construção)
- [x] Fundação: banco, servidor, cadastro/login do terceirizado, painel
- [ ] Expandir equipe (criar quarteirizados + perfis tec2/tec3...)
- [ ] Aba de Valores (matriz classe × perfil)
- [ ] Registrar O.S. (cliente + classe + valor automático)
- [ ] Listagem/filtros de O.S. por técnico e ciclo
- [ ] Marcar O.S. repetida + notificações
