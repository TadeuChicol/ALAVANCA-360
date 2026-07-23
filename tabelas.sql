-- ============================================================
-- SCRIPT 1: CRIAR TABELAS (executar primeiro)
-- ============================================================

create table if not exists public.clinicas (
    id uuid primary key default gen_random_uuid(),
    owner_user_id uuid references auth.users(id) on delete cascade,
    nome text not null,
    endereco text,
    telefone text,
    email text,
    logo_url text,
    ativo boolean default true,
    created_at timestamptz default now()
);

create table if not exists public.config_global (
    id text primary key default 'global',
    consultoria_nome text,
    logo_url text,
    primary_color text default '#3b82f6',
    secondary_color text default '#1e293b',
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create table if not exists public.pacientes (
    id uuid primary key default gen_random_uuid(),
    clinica_id uuid not null references public.clinicas(id) on delete cascade,
    nome text not null,
    cpf text,
    telefone text,
    email text,
    data_nascimento date,
    observacoes text,
    ativo boolean default true,
    created_at timestamptz default now()
);

create table if not exists public.profissionais (
    id uuid primary key default gen_random_uuid(),
    clinica_id uuid not null references public.clinicas(id) on delete cascade,
    nome text not null,
    especialidade text,
    registro_profissional text,
    telefone text,
    email text,
    ativo boolean default true,
    created_at timestamptz default now()
);

create table if not exists public.agendamentos (
    id uuid primary key default gen_random_uuid(),
    clinica_id uuid not null references public.clinicas(id) on delete cascade,
    paciente_id uuid references public.pacientes(id) on delete set null,
    paciente_nome text,
    profissional_id uuid references public.profissionais(id) on delete set null,
    data_hora timestamptz not null,
    status text default 'agendado',
    observacao text,
    created_at timestamptz default now()
);

create table if not exists public.prontuario_evolutivo (
    id uuid primary key default gen_random_uuid(),
    clinica_id uuid not null references public.clinicas(id) on delete cascade,
    paciente_id uuid not null references public.pacientes(id) on delete cascade,
    descricao text not null,
    travado boolean default false,
    created_at timestamptz default now()
);

create table if not exists public.documentos_emitidos (
    id uuid primary key default gen_random_uuid(),
    clinica_id uuid not null references public.clinicas(id) on delete cascade,
    paciente_id uuid references public.pacientes(id) on delete set null,
    tipo text not null check (tipo in ('orcamento', 'receituario')),
    conteudo text,
    created_at timestamptz default now()
);

create table if not exists public.insumos (
    id uuid primary key default gen_random_uuid(),
    clinica_id uuid not null references public.clinicas(id) on delete cascade,
    nome text not null,
    apresentacao text,
    quantidade_apresentacao numeric default 1,
    unidade_medida text,
    preco_apresentacao numeric default 0,
    custo_unitario numeric generated always as
        (case when quantidade_apresentacao > 0
              then round(preco_apresentacao / quantidade_apresentacao, 5)
              else 0 end) stored,
    observacao text,
    codigo_externo text,
    ativo boolean default true,
    created_at timestamptz default now()
);

create table if not exists public.servicos (
    id uuid primary key default gen_random_uuid(),
    clinica_id uuid not null references public.clinicas(id) on delete cascade,
    nome text not null,
    categoria text,
    tempo_medio_min numeric default 0,
    custo_servico_externo numeric default 0,
    custo_radiografia numeric default 0,
    outros_custos_diretos numeric default 0,
    preco_convenio numeric default 0,
    preco_particular numeric default 0,
    codigo_externo text,
    ativo boolean default true,
    created_at timestamptz default now()
);

create table if not exists public.mapa_insumos_servicos (
    id uuid primary key default gen_random_uuid(),
    clinica_id uuid not null references public.clinicas(id) on delete cascade,
    servico_id uuid not null references public.servicos(id) on delete cascade,
    insumo_id uuid not null references public.insumos(id) on delete cascade,
    quantidade_consumida numeric default 0,
    created_at timestamptz default now()
);

create table if not exists public.custos_fixos (
    id uuid primary key default gen_random_uuid(),
    clinica_id uuid not null references public.clinicas(id) on delete cascade,
    nome_item text not null,
    valor_mensal numeric default 0,
    created_at timestamptz default now()
);

create table if not exists public.kit_operacao_itens (
    id uuid primary key default gen_random_uuid(),
    clinica_id uuid not null references public.clinicas(id) on delete cascade,
    cenario text default 'Atual',
    item text not null,
    apresentacao text,
    valor_unitario numeric default 0,
    quantidade_mes numeric default 0,
    created_at timestamptz default now()
);

create table if not exists public.config_precificacao (
    id uuid primary key default gen_random_uuid(),
    clinica_id uuid not null references public.clinicas(id) on delete cascade,
    modalidade text not null check (modalidade in ('convenio', 'particular')),
    pro_labore_desejado numeric default 0,
    horas_dia numeric default 8,
    dias_mes numeric default 22,
    margem_desejada_pct numeric default 0,
    imposto_pct numeric default 0,
    taxa_maquininha_pct numeric default 0,
    procedimentos_mes_kit numeric default 176,
    created_at timestamptz default now(),
    unique (clinica_id, modalidade)
);

create table if not exists public.atendimentos (
    id uuid primary key default gen_random_uuid(),
    clinica_id uuid not null references public.clinicas(id) on delete cascade,
    paciente_id uuid references public.pacientes(id) on delete set null,
    paciente_nome text,
    servico_id uuid references public.servicos(id) on delete set null,
    servico_nome text,
    profissional_id uuid references public.profissionais(id) on delete set null,
    tipo_pagamento text not null check (tipo_pagamento in ('convenio', 'particular', 'misto')),
    valor_convenio numeric default 0,
    valor_particular numeric default 0,
    valor_total_cobrado numeric generated always as
        (coalesce(valor_convenio,0) + coalesce(valor_particular,0)) stored,
    data_atendimento date default current_date,
    observacao text,
    created_at timestamptz default now()
);

create table if not exists public.integracoes_clinica (
    id uuid primary key default gen_random_uuid(),
    clinica_id uuid not null references public.clinicas(id) on delete cascade,
    tipo text not null check (tipo in ('google', 'whatsapp', 'email')),
    config jsonb default '{}',
    ativo boolean default true,
    created_at timestamptz default now(),
    unique (clinica_id, tipo)
);

create table if not exists public.automacoes_config (
    id uuid primary key default gen_random_uuid(),
    clinica_id uuid not null references public.clinicas(id) on delete cascade,
    tipo text not null check (tipo in ('lembrete', 'recall', 'aniversario', 'satisfacao', 'no-show')),
    ativo boolean default false,
    config jsonb default '{}',
    created_at timestamptz default now()
);

create table if not exists public.automacoes_log (
    id uuid primary key default gen_random_uuid(),
    clinica_id uuid not null references public.clinicas(id) on delete cascade,
    automacao_id uuid references public.automacoes_config(id) on delete set null,
    tipo text not null,
    destino text,
    status text default 'pendente',
    erro text,
    created_at timestamptz default now()
);
