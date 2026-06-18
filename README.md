# TecLog+

Sistema web (mobile-first) para **terceirizados** controlarem, junto com seus **quarteirizados**, as **Ordens de Serviço (O.S.)** executadas — registro paralelo ao sistema do provedor, com controle de valores por perfil técnico, repasses, sinalizações e relatórios de ganhos.

## Stack
- **Backend:** Flask (Python 3.12 em produção; local pode rodar em 3.12+)
- **Frontend:** HTML/CSS/JS puro, mobile-first (iOS/Android)
- **Banco:** SQLite local (`teclog.db`, criado automaticamente) ou PostgreSQL em produção (`DATABASE_URL`)
- **Deploy:** Render (configurado em `render.yaml` / `Procfile`)

## Como rodar (local)
```bash
pip install -r requirements.txt
python run.py
```
Abra **http://127.0.0.1:5001** (não abra o `index.html` direto).

## Estrutura
```
TecLog+/
├── run.py                     # inicia o servidor (porta 5001)
├── schema.sql                 # tabelas SQLite
├── schema_pg.sql              # tabelas PostgreSQL
├── requirements.txt
├── render.yaml / Procfile     # deploy Render
├── backend/
│   ├── app.py                 # rotas da API + serve o frontend
│   └── database.py            # conexão SQLite/Postgres
└── frontend/
    ├── index.html             # login
    ├── home.html              # Home / Relatório de Ganhos + registrar O.S.
    ├── equipe.html            # expandir equipe (técnicos/quarteirizados)
    ├── valores.html           # matriz classe de serviço × perfil técnico
    ├── notificacoes.html      # avisas de O.S. sinalizadas/repetidas
    ├── perfil.html            # meus dados
    ├── planos.html            # página de planos (marketing)
    ├── admin.html             # Backoffice do dono da plataforma
    ├── admin_*.html           # clientes, equipe, finanças, conta
    ├── css/style.css
    └── js/{auth,home,equipe,valores,perfil,notificacoes,menu,admin*,aviso}.js
```

## Conceitos
- **Papéis:** `terceirizado` (gestor + técnico) e `quarteirizado` (equipe).
- **Perfis técnicos:** `tec1` (terceirizado, valor cheio), `tec2`, `tec3`... (repasse parcial por contrato).
- **Valores:** matriz **classe de serviço × perfil técnico** (aba de Valores).
- **Classes padrão:** INSTALAÇÃO, SUPORTE, DEVICES — editáveis e com valores zerados até o líder configurar.
- **O.S. repetida/sinalizada:** marcada pelo terceirizado a partir do relatório do provedor → gera notificação ao quarteirizado.
- **Ciclo financeiro:** dia de vencimento e ciclos mensais para relatórios.
- **Planos/Assinatura:** Starter, Pro, Fundador, Teste (24h) e Personalizado — com régua de carência/suspensão.
- **Backoffice:** área do dono da plataforma para criar clientes, gerenciar equipe e acompanhar finanças.

## Rotas principais
- `/` — login
- `/home` — Home (relatório de ganhos + registrar O.S.)
- `/equipe` — gerenciar técnicos
- `/valores` — matriz de valores
- `/notificacoes` — notificações
- `/perfil` — meus dados
- `/planos` — conhecer planos
- `/admin` — Backoffice (dono da plataforma)
- `/ordens`, `/dashboard` e `/registrar` — redirecionam para `/home` (páginas antigas removidas)

## Status (v2.6)
- [x] Fundação: banco, servidor, autenticação
- [x] Cadastro/login do terceirizado e quarteirizado
- [x] Expandir equipe (criar quarteirizados + perfis tec2/tec3...)
- [x] Aba de Valores (matriz classe × perfil)
- [x] Registrar O.S. (cliente + classe + valor automático)
- [x] Listagem/filtros de O.S. por técnico e ciclo/período
- [x] Marcar O.S. repetida/sinalizada + notificações
- [x] Relatório de Ganhos (bruto, repasse, líquido, por técnico)
- [x] Relatório PDF por técnico
- [x] Reajuste de valores por perfil técnico
- [x] Adicional de domingo
- [x] Backoffice: clientes, finanças, equipe do cliente, conta
- [x] Planos, assinatura e régua de carência/suspensão
- [x] Deploy no Render com Postgres
- [x] Home unificada: registrar O.S. + relatório de ganhos + menu lateral
- [ ] Próximos: onboarding, exportações, notificações push

## Variáveis de ambiente (produção)
- `SECRET_KEY` — chave da sessão Flask
- `DATABASE_URL` — URL do Postgres
- `ADMIN_EMAIL` / `ADMIN_SENHA` — cria conta admin automaticamente na 1ª subida
- `TZ=America/Sao_Paulo` — fuso horário
