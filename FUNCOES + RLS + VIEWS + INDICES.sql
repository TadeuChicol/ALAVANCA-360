-- ============================================================
-- ALAVANCA 360® — SCHEMA DE INTEGRAÇÕES E AUTOMAÇÕES (FASE 2)
-- ============================================================
-- Rode este arquivo DEPOIS de sql/schema.sql e sql/schema_financeiro.sql.
-- Guarda, por clínica: credenciais de conexão (tokens OAuth do
-- Google, número do WhatsApp Business, etc.) e as regras de
-- automação que cada clínica decide ativar.
-- ============================================================

-- ============================================================
-- 1. TABELA: integracoes_clinica
-- Uma linha por clínica. Guarda o "estado" de cada integração
-- (conectado ou não) e os tokens de acesso (nunca a senha do
-- Google, apenas o token OAuth emitido pelo próprio Google).
-- ============================================================
create table if not exists public.integracoes_clinica (
    id uuid primary key default gen_random_uuid(),
    clinica_id uuid not null unique references public.clinicas(id) on delete cascade,

    -- Google (Agenda + Planilhas), conectado via OAuth do navegador
    google_conectado boolean default false,
    google_email_conectado text,
    google_refresh_token text,          -- gerado pelo fluxo OAuth (armazenado só criptografado no Google)
    google_calendar_id text,            -- id do Google Agenda da clínica
    google_sheet_id text,               -- id da planilha (import/exportação de custos)

    -- WhatsApp (Meta Cloud API oficial)
    whatsapp_conectado boolean default false,
    whatsapp_numero text,
    whatsapp_phone_number_id text,      -- id técnico exigido pela Meta Cloud API
    whatsapp_waba_id text,

    -- E-mail transacional (Resend/Brevo)
    email_conectado boolean default false,
    email_remetente text,

    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

alter table public.integracoes_clinica enable row level security;

create policy "acesso_por_clinica_integracoes_select"
    on public.integracoes_clinica for select
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
create policy "acesso_por_clinica_integracoes_insert"
    on public.integracoes_clinica for insert
    with check (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
create policy "acesso_por_clinica_integracoes_update"
    on public.integracoes_clinica for update
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
create policy "acesso_por_clinica_integracoes_delete"
    on public.integracoes_clinica for delete
    using (public.is_consultoria_admin());

-- ============================================================
-- 2. TABELA: automacoes_config
-- Regras de automação que cada clínica pode ligar/desligar,
-- com os parâmetros de disparo (quantos dias/horas antes etc.).
-- ============================================================
create table if not exists public.automacoes_config (
    id uuid primary key default gen_random_uuid(),
    clinica_id uuid not null references public.clinicas(id) on delete cascade,
    tipo text not null check (tipo in (
        'lembrete_consulta',
        'confirmacao_agendamento',
        'recall_manutencao',
        'aniversario',
        'pesquisa_satisfacao',
        'recuperacao_no_show'
    )),
    ativo boolean default false,
    canal text default 'whatsapp' check (canal in ('whatsapp', 'email', 'ambos')),
    antecedencia_horas numeric,          -- ex.: 24 (lembrete D-1), 2 (lembrete 2h antes)
    intervalo_dias numeric,              -- ex.: 180 (recall a cada 6 meses)
    mensagem_modelo text,                -- texto com variáveis {{paciente}}, {{data}}, {{clinica}}
    created_at timestamptz default now(),
    unique (clinica_id, tipo, canal)
);

alter table public.automacoes_config enable row level security;

create policy "acesso_por_clinica_automacoes_select"
    on public.automacoes_config for select
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
create policy "acesso_por_clinica_automacoes_insert"
    on public.automacoes_config for insert
    with check (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
create policy "acesso_por_clinica_automacoes_update"
    on public.automacoes_config for update
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
create policy "acesso_por_clinica_automacoes_delete"
    on public.automacoes_config for delete
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());

-- ============================================================
-- 3. TABELA: automacoes_log
-- Histórico de disparos (útil para auditoria e para o
-- Dashboard Vivo mostrar taxa de entrega/abertura).
-- ============================================================
create table if not exists public.automacoes_log (
    id uuid primary key default gen_random_uuid(),
    clinica_id uuid not null references public.clinicas(id) on delete cascade,
    tipo text,
    paciente_id uuid references public.pacientes(id) on delete set null,
    canal text,
    status text default 'enviado' check (status in ('enviado', 'falhou', 'lido', 'respondido')),
    detalhe text,
    created_at timestamptz default now()
);

alter table public.automacoes_log enable row level security;

create policy "acesso_por_clinica_automacoeslog_select"
    on public.automacoes_log for select
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
create policy "acesso_por_clinica_automacoeslog_insert"
    on public.automacoes_log for insert
    with check (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());

-- ============================================================
-- FIM DO SCHEMA DE INTEGRAÇÕES.
-- O envio efetivo das mensagens (chamada às APIs do WhatsApp/
-- Google/E-mail) roda em uma Supabase Edge Function agendada via
-- pg_cron — veja docs/GUIA_AUTOMACOES.md para o passo a passo.
-- ============================================================
