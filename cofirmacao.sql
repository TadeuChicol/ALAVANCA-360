-- ============================================================
-- ALAVANCA 360® — SCHEMA FINANCEIRO (FASE 2)
-- Módulo: Custos, Insumos, Precificação, Atendimentos e Dashboard Vivo
-- ============================================================
-- Como usar:
-- 1. Rode PRIMEIRO o arquivo sql/schema.sql (base do sistema).
-- 2. Depois, no SQL Editor do Supabase, cole TODO este arquivo
--    e clique em "Run".
-- 3. Esse módulo é 100% multi-tenant: cada clínica só enxerga
--    e edita os próprios insumos, serviços, custos e atendimentos.
-- ============================================================

-- ============================================================
-- 1. TABELA: insumos
-- Catálogo de matérias-primas/produtos consumidos nos
-- procedimentos (ex.: luvas, flúor, ácido hialurônico, botox...).
-- Serve para clínicas de odontologia, estética e saúde em geral.
-- ============================================================
create table if not exists public.insumos (
    id uuid primary key default gen_random_uuid(),
    clinica_id uuid not null references public.clinicas(id) on delete cascade,
    nome text not null,
    apresentacao text,               -- ex.: "Caixa", "Frasco", "Bisnaga"
    quantidade_apresentacao numeric default 1,  -- ex.: 200 (ml/unid/g por embalagem)
    unidade_medida text,             -- ex.: "ml", "g", "unidade"
    preco_apresentacao numeric default 0,       -- preço pago na embalagem inteira
    custo_unitario numeric generated always as
        (case when quantidade_apresentacao > 0
              then round(preco_apresentacao / quantidade_apresentacao, 5)
              else 0 end) stored,   -- calculado automaticamente, sempre atualizado
    observacao text,
    codigo_externo text,             -- código original da planilha de origem (ex.: "INS001"),
                                      -- usado para casar dados na importação de CSV sem retrabalho
    ativo boolean default true,
    created_at timestamptz default now()
);

create index if not exists idx_insumos_codigo_externo on public.insumos(clinica_id, codigo_externo);

alter table public.insumos enable row level security;

create policy "acesso_por_clinica_insumos_select"
    on public.insumos for select
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
create policy "acesso_por_clinica_insumos_insert"
    on public.insumos for insert
    with check (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
create policy "acesso_por_clinica_insumos_update"
    on public.insumos for update
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
create policy "acesso_por_clinica_insumos_delete"
    on public.insumos for delete
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());

-- ============================================================
-- 2. TABELA: servicos
-- Catálogo de procedimentos/serviços oferecidos pela clínica
-- (consulta, limpeza, botox, peeling, exame etc.), com o tempo
-- médio de execução — a base do cálculo de custo por minuto.
-- ============================================================
create table if not exists public.servicos (
    id uuid primary key default gen_random_uuid(),
    clinica_id uuid not null references public.clinicas(id) on delete cascade,
    nome text not null,
    categoria text,                  -- ex.: "Clínico", "Estética Facial", "Prótese"
    tempo_medio_min numeric default 0,
    custo_servico_externo numeric default 0,   -- laboratório, exame terceirizado etc.
    custo_radiografia numeric default 0,
    outros_custos_diretos numeric default 0,
    preco_convenio numeric default 0,          -- preço de venda praticado no convênio
    preco_particular numeric default 0,        -- preço de venda praticado no particular
    codigo_externo text,             -- código original da planilha de origem (ex.: "S001"),
                                      -- usado para casar dados na importação de CSV sem retrabalho
    ativo boolean default true,
    created_at timestamptz default now()
);

create index if not exists idx_servicos_codigo_externo on public.servicos(clinica_id, codigo_externo);

alter table public.servicos enable row level security;

create policy "acesso_por_clinica_servicos_select"
    on public.servicos for select
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
create policy "acesso_por_clinica_servicos_insert"
    on public.servicos for insert
    with check (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
create policy "acesso_por_clinica_servicos_update"
    on public.servicos for update
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
create policy "acesso_por_clinica_servicos_delete"
    on public.servicos for delete
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());

-- ============================================================
-- 3. TABELA: mapa_insumos_servicos
-- Quanto de cada insumo um serviço consome (N:N).
-- Ex.: "Limpeza" consome 4ml de Flúor + 2 unid. de gaze.
-- ============================================================
create table if not exists public.mapa_insumos_servicos (
    id uuid primary key default gen_random_uuid(),
    clinica_id uuid not null references public.clinicas(id) on delete cascade,
    servico_id uuid not null references public.servicos(id) on delete cascade,
    insumo_id uuid not null references public.insumos(id) on delete cascade,
    quantidade_consumida numeric default 0,
    created_at timestamptz default now()
);

alter table public.mapa_insumos_servicos enable row level security;

create policy "acesso_por_clinica_mapa_select"
    on public.mapa_insumos_servicos for select
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
create policy "acesso_por_clinica_mapa_insert"
    on public.mapa_insumos_servicos for insert
    with check (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
create policy "acesso_por_clinica_mapa_update"
    on public.mapa_insumos_servicos for update
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
create policy "acesso_por_clinica_mapa_delete"
    on public.mapa_insumos_servicos for delete
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());

-- ============================================================
-- 4. TABELA: custos_fixos
-- Aluguel, internet, energia, contador, etc. (mensal).
-- ============================================================
create table if not exists public.custos_fixos (
    id uuid primary key default gen_random_uuid(),
    clinica_id uuid not null references public.clinicas(id) on delete cascade,
    nome_item text not null,
    valor_mensal numeric default 0,
    created_at timestamptz default now()
);

alter table public.custos_fixos enable row level security;

create policy "acesso_por_clinica_custosfixos_select"
    on public.custos_fixos for select
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
create policy "acesso_por_clinica_custosfixos_insert"
    on public.custos_fixos for insert
    with check (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
create policy "acesso_por_clinica_custosfixos_update"
    on public.custos_fixos for update
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
create policy "acesso_por_clinica_custosfixos_delete"
    on public.custos_fixos for delete
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());

-- ============================================================
-- 5. TABELA: kit_operacao_itens
-- Consumíveis "de sala" (luvas, máscara, avental, etc.),
-- usados em TODOS os atendimentos, ratreados por minuto.
-- ============================================================
create table if not exists public.kit_operacao_itens (
    id uuid primary key default gen_random_uuid(),
    clinica_id uuid not null references public.clinicas(id) on delete cascade,
    cenario text default 'Atual',      -- "Atual", "Ideal Imediato", "Ideal Futuro"
    item text not null,
    apresentacao text,
    valor_unitario numeric default 0,
    quantidade_mes numeric default 0,
    created_at timestamptz default now()
);

alter table public.kit_operacao_itens enable row level security;

create policy "acesso_por_clinica_kit_select"
    on public.kit_operacao_itens for select
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
create policy "acesso_por_clinica_kit_insert"
    on public.kit_operacao_itens for insert
    with check (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
create policy "acesso_por_clinica_kit_update"
    on public.kit_operacao_itens for update
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
create policy "acesso_por_clinica_kit_delete"
    on public.kit_operacao_itens for delete
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());

-- ============================================================
-- 6. TABELA: config_precificacao
-- Parâmetros do modelo de precificação — 1 linha "convenio"
-- e 1 linha "particular" por clínica.
-- ============================================================
create table if not exists public.config_precificacao (
    id uuid primary key default gen_random_uuid(),
    clinica_id uuid not null references public.clinicas(id) on delete cascade,
    modalidade text not null check (modalidade in ('convenio', 'particular')),
    pro_labore_desejado numeric default 0,
    horas_dia numeric default 8,
    dias_mes numeric default 22,
    margem_desejada_pct numeric default 0,   -- ex.: 30 = 30%
    imposto_pct numeric default 0,
    taxa_maquininha_pct numeric default 0,
    procedimentos_mes_kit numeric default 176, -- para ratrear o kit-operação por minuto
    created_at timestamptz default now(),
    unique (clinica_id, modalidade)
);

alter table public.config_precificacao enable row level security;

create policy "acesso_por_clinica_configprec_select"
    on public.config_precificacao for select
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
create policy "acesso_por_clinica_configprec_insert"
    on public.config_precificacao for insert
    with check (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
create policy "acesso_por_clinica_configprec_update"
    on public.config_precificacao for update
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
create policy "acesso_por_clinica_configprec_delete"
    on public.config_precificacao for delete
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());

-- ============================================================
-- 7. TABELA: atendimentos
-- O "elo perdido" da planilha (aba VENDAS_ATENDIMENTOS que
-- nunca chegou a existir). Registra CADA procedimento realizado
-- em um paciente, por tipo de pagamento — a peça que permite
-- cruzar clientes x custos x margens e alimentar o Dashboard Vivo.
-- ============================================================
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

alter table public.atendimentos enable row level security;

create policy "acesso_por_clinica_atendimentos_select"
    on public.atendimentos for select
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
create policy "acesso_por_clinica_atendimentos_insert"
    on public.atendimentos for insert
    with check (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
create policy "acesso_por_clinica_atendimentos_update"
    on public.atendimentos for update
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
create policy "acesso_por_clinica_atendimentos_delete"
    on public.atendimentos for delete
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());

-- ============================================================
-- 8. VIEW: vw_custo_kit_minuto
-- Custo do kit-operação por minuto, por clínica/cenário
-- (soma dos itens ÷ procedimentos do mês ÷ tempo médio... aqui
-- calculamos o custo/mês e o custo/procedimento é aplicado na
-- view final vw_custo_servico).
-- ============================================================
create or replace view public.vw_custo_kit_mensal
with (security_invoker = true) as
select
    clinica_id,
    cenario,
    sum(valor_unitario * quantidade_mes) as custo_total_mes
from public.kit_operacao_itens
group by clinica_id, cenario;

-- ============================================================
-- 9. VIEW: vw_custo_material_servico
-- Custo de material direto por serviço (soma dos insumos
-- consumidos x custo unitário de cada insumo).
-- ============================================================
create or replace view public.vw_custo_material_servico
with (security_invoker = true) as
select
    m.clinica_id,
    m.servico_id,
    sum(m.quantidade_consumida * i.custo_unitario) as custo_material_direto
from public.mapa_insumos_servicos m
join public.insumos i on i.id = m.insumo_id
group by m.clinica_id, m.servico_id;

-- ============================================================
-- 10. VIEW: vw_custo_servico
-- A grande view que substitui a aba SERVIÇOS_PROCEDIMENTOS da
-- planilha: calcula, PARA CADA SERVIÇO e MODALIDADE, o custo
-- total e a margem — sempre atualizada automaticamente sempre
-- que um insumo, config ou custo fixo mudar de valor.
-- ============================================================
create or replace view public.vw_custo_servico
with (security_invoker = true) as
select
    s.id as servico_id,
    s.clinica_id,
    s.nome as servico_nome,
    s.categoria,
    s.tempo_medio_min,
    cp.modalidade,
    cp.pro_labore_desejado,
    -- custo fixo mensal total da clínica
    coalesce((select sum(cf.valor_mensal) from public.custos_fixos cf where cf.clinica_id = s.clinica_id), 0) as custo_fixo_mensal,
    -- custo por minuto do profissional nesta modalidade
    round(
        (coalesce((select sum(cf.valor_mensal) from public.custos_fixos cf where cf.clinica_id = s.clinica_id), 0)
         + coalesce(cp.pro_labore_desejado, 0))
        / nullif(cp.horas_dia * cp.dias_mes * 60, 0)
    , 5) as custo_minuto_profissional,
    -- custo de tempo do profissional aplicado ao tempo médio do serviço
    round(
        (
            (coalesce((select sum(cf.valor_mensal) from public.custos_fixos cf where cf.clinica_id = s.clinica_id), 0)
             + coalesce(cp.pro_labore_desejado, 0))
            / nullif(cp.horas_dia * cp.dias_mes * 60, 0)
        ) * coalesce(s.tempo_medio_min, 0)
    , 4) as custo_tempo_profissional,
    -- custo do kit-operação (cenário "Atual") aplicado ao tempo do serviço
    round(
        coalesce((select k.custo_total_mes from public.vw_custo_kit_mensal k
                  where k.clinica_id = s.clinica_id and k.cenario = 'Atual'), 0)
        / nullif(cp.horas_dia * cp.dias_mes * 60, 0) * coalesce(s.tempo_medio_min, 0)
    , 4) as custo_kit_operacao,
    coalesce((select vm.custo_material_direto from public.vw_custo_material_servico vm
              where vm.servico_id = s.id), 0) as custo_material_direto,
    s.custo_servico_externo,
    s.custo_radiografia,
    s.outros_custos_diretos,
    -- custo total do procedimento (sem impostos/taxas)
    round(
        (
            (
                (coalesce((select sum(cf.valor_mensal) from public.custos_fixos cf where cf.clinica_id = s.clinica_id), 0)
                 + coalesce(cp.pro_labore_desejado, 0))
                / nullif(cp.horas_dia * cp.dias_mes * 60, 0)
            ) * coalesce(s.tempo_medio_min, 0)
        )
        + coalesce((select k.custo_total_mes from public.vw_custo_kit_mensal k
                    where k.clinica_id = s.clinica_id and k.cenario = 'Atual'), 0)
          / nullif(cp.horas_dia * cp.dias_mes * 60, 0) * coalesce(s.tempo_medio_min, 0)
        + coalesce((select vm.custo_material_direto from public.vw_custo_material_servico vm
                    where vm.servico_id = s.id), 0)
        + coalesce(s.custo_servico_externo, 0)
        + coalesce(s.custo_radiografia, 0)
        + coalesce(s.outros_custos_diretos, 0)
    , 4) as custo_total_procedimento,
    case when cp.modalidade = 'convenio' then s.preco_convenio else s.preco_particular end as preco_venda,
    cp.margem_desejada_pct,
    cp.imposto_pct,
    cp.taxa_maquininha_pct
from public.servicos s
cross join public.config_precificacao cp
where cp.clinica_id = s.clinica_id;

-- ============================================================
-- 11. MIGRAÇÃO IDEMPOTENTE (seguro rodar de novo, mesmo se as
-- tabelas acima já existiam antes de existir a coluna
-- codigo_externo — necessária para a Importação de CSV v2,
-- que faz "upsert" por código da planilha em vez de duplicar
-- registros a cada nova importação do mesmo arquivo).
-- ============================================================
alter table public.insumos  add column if not exists codigo_externo text;
alter table public.servicos add column if not exists codigo_externo text;
create index if not exists idx_insumos_codigo_externo  on public.insumos(clinica_id, codigo_externo);
create index if not exists idx_servicos_codigo_externo on public.servicos(clinica_id, codigo_externo);

-- ============================================================
-- FIM DO SCHEMA FINANCEIRO.
-- Próximo passo: rode também sql/schema_integracoes.sql e
-- consulte docs/GUIA_MODULO_FINANCEIRO.md para o passo a passo
-- de uso dentro do sistema.
-- ============================================================
