-- ============================================================
-- SCRIPT 2: FUNCOES + RLS + VIEWS + INDICES
-- Rodar APOS confirmar que as tabelas existem
-- CORRECAO: minha_clinica_id() usa "id" nao "clinica_id"
-- ============================================================

-- FUNCOES HELPER
create or replace function public.minha_clinica_id()
returns uuid language sql stable as $$
  select id from public.clinicas where owner_user_id = auth.uid() limit 1;
$$;

create or replace function public.is_consultoria_admin()
returns boolean language sql stable as $$
  select exists (
    select 1 from public.clinicas
    where owner_user_id = auth.uid() and ativo = true
  );
$$;

-- RLS
alter table if exists public.clinicas enable row level security;
alter table if exists public.config_global enable row level security;
alter table if exists public.pacientes enable row level security;
alter table if exists public.profissionais enable row level security;
alter table if exists public.agendamentos enable row level security;
alter table if exists public.prontuario_evolutivo enable row level security;
alter table if exists public.documentos_emitidos enable row level security;
alter table if exists public.insumos enable row level security;
alter table if exists public.servicos enable row level security;
alter table if exists public.mapa_insumos_servicos enable row level security;
alter table if exists public.custos_fixos enable row level security;
alter table if exists public.kit_operacao_itens enable row level security;
alter table if exists public.config_precificacao enable row level security;
alter table if exists public.atendimentos enable row level security;
alter table if exists public.integracoes_clinica enable row level security;
alter table if exists public.automacoes_config enable row level security;
alter table if exists public.automacoes_log enable row level security;

-- POLICIES
do $$ begin

if not exists (select 1 from pg_policies where policyname = 'clinicas_select' and tablename = 'clinicas') then
  create policy clinicas_select on public.clinicas for select
    using (owner_user_id = auth.uid() or public.is_consultoria_admin());
end if;
if not exists (select 1 from pg_policies where policyname = 'clinicas_insert' and tablename = 'clinicas') then
  create policy clinicas_insert on public.clinicas for insert
    with check (public.is_consultoria_admin());
end if;
if not exists (select 1 from pg_policies where policyname = 'clinicas_update' and tablename = 'clinicas') then
  create policy clinicas_update on public.clinicas for update
    using (owner_user_id = auth.uid() or public.is_consultoria_admin());
end if;

if not exists (select 1 from pg_policies where policyname = 'pacientes_select' and tablename = 'pacientes') then
  create policy pacientes_select on public.pacientes for select
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;
if not exists (select 1 from pg_policies where policyname = 'pacientes_insert' and tablename = 'pacientes') then
  create policy pacientes_insert on public.pacientes for insert
    with check (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;
if not exists (select 1 from pg_policies where policyname = 'pacientes_update' and tablename = 'pacientes') then
  create policy pacientes_update on public.pacientes for update
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;
if not exists (select 1 from pg_policies where policyname = 'pacientes_delete' and tablename = 'pacientes') then
  create policy pacientes_delete on public.pacientes for delete
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;

if not exists (select 1 from pg_policies where policyname = 'profissionais_select' and tablename = 'profissionais') then
  create policy profissionais_select on public.profissionais for select
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;
if not exists (select 1 from pg_policies where policyname = 'profissionais_insert' and tablename = 'profissionais') then
  create policy profissionais_insert on public.profissionais for insert
    with check (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;
if not exists (select 1 from pg_policies where policyname = 'profissionais_update' and tablename = 'profissionais') then
  create policy profissionais_update on public.profissionais for update
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;

if not exists (select 1 from pg_policies where policyname = 'agendamentos_select' and tablename = 'agendamentos') then
  create policy agendamentos_select on public.agendamentos for select
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;
if not exists (select 1 from pg_policies where policyname = 'agendamentos_insert' and tablename = 'agendamentos') then
  create policy agendamentos_insert on public.agendamentos for insert
    with check (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;
if not exists (select 1 from pg_policies where policyname = 'agendamentos_update' and tablename = 'agendamentos') then
  create policy agendamentos_update on public.agendamentos for update
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;
if not exists (select 1 from pg_policies where policyname = 'agendamentos_delete' and tablename = 'agendamentos') then
  create policy agendamentos_delete on public.agendamentos for delete
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;

if not exists (select 1 from pg_policies where policyname = 'prontuario_select' and tablename = 'prontuario_evolutivo') then
  create policy prontuario_select on public.prontuario_evolutivo for select
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;
if not exists (select 1 from pg_policies where policyname = 'prontuario_insert' and tablename = 'prontuario_evolutivo') then
  create policy prontuario_insert on public.prontuario_evolutivo for insert
    with check (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;
if not exists (select 1 from pg_policies where policyname = 'prontuario_update' and tablename = 'prontuario_evolutivo') then
  create policy prontuario_update on public.prontuario_evolutivo for update
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;

if not exists (select 1 from pg_policies where policyname = 'documentos_select' and tablename = 'documentos_emitidos') then
  create policy documentos_select on public.documentos_emitidos for select
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;
if not exists (select 1 from pg_policies where policyname = 'documentos_insert' and tablename = 'documentos_emitidos') then
  create policy documentos_insert on public.documentos_emitidos for insert
    with check (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;

if not exists (select 1 from pg_policies where policyname = 'insumos_select' and tablename = 'insumos') then
  create policy insumos_select on public.insumos for select
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;
if not exists (select 1 from pg_policies where policyname = 'insumos_insert' and tablename = 'insumos') then
  create policy insumos_insert on public.insumos for insert
    with check (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;
if not exists (select 1 from pg_policies where policyname = 'insumos_update' and tablename = 'insumos') then
  create policy insumos_update on public.insumos for update
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;
if not exists (select 1 from pg_policies where policyname = 'insumos_delete' and tablename = 'insumos') then
  create policy insumos_delete on public.insumos for delete
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;

if not exists (select 1 from pg_policies where policyname = 'servicos_select' and tablename = 'servicos') then
  create policy servicos_select on public.servicos for select
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;
if not exists (select 1 from pg_policies where policyname = 'servicos_insert' and tablename = 'servicos') then
  create policy servicos_insert on public.servicos for insert
    with check (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;
if not exists (select 1 from pg_policies where policyname = 'servicos_update' and tablename = 'servicos') then
  create policy servicos_update on public.servicos for update
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;
if not exists (select 1 from pg_policies where policyname = 'servicos_delete' and tablename = 'servicos') then
  create policy servicos_delete on public.servicos for delete
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;

if not exists (select 1 from pg_policies where policyname = 'mapa_select' and tablename = 'mapa_insumos_servicos') then
  create policy mapa_select on public.mapa_insumos_servicos for select
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;
if not exists (select 1 from pg_policies where policyname = 'mapa_insert' and tablename = 'mapa_insumos_servicos') then
  create policy mapa_insert on public.mapa_insumos_servicos for insert
    with check (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;
if not exists (select 1 from pg_policies where policyname = 'mapa_update' and tablename = 'mapa_insumos_servicos') then
  create policy mapa_update on public.mapa_insumos_servicos for update
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;
if not exists (select 1 from pg_policies where policyname = 'mapa_delete' and tablename = 'mapa_insumos_servicos') then
  create policy mapa_delete on public.mapa_insumos_servicos for delete
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;

if not exists (select 1 from pg_policies where policyname = 'custosfixos_select' and tablename = 'custos_fixos') then
  create policy custosfixos_select on public.custos_fixos for select
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;
if not exists (select 1 from pg_policies where policyname = 'custosfixos_insert' and tablename = 'custos_fixos') then
  create policy custosfixos_insert on public.custos_fixos for insert
    with check (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;
if not exists (select 1 from pg_policies where policyname = 'custosfixos_update' and tablename = 'custos_fixos') then
  create policy custosfixos_update on public.custos_fixos for update
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;
if not exists (select 1 from pg_policies where policyname = 'custosfixos_delete' and tablename = 'custos_fixos') then
  create policy custosfixos_delete on public.custos_fixos for delete
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;

if not exists (select 1 from pg_policies where policyname = 'kit_select' and tablename = 'kit_operacao_itens') then
  create policy kit_select on public.kit_operacao_itens for select
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;
if not exists (select 1 from pg_policies where policyname = 'kit_insert' and tablename = 'kit_operacao_itens') then
  create policy kit_insert on public.kit_operacao_itens for insert
    with check (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;
if not exists (select 1 from pg_policies where policyname = 'kit_update' and tablename = 'kit_operacao_itens') then
  create policy kit_update on public.kit_operacao_itens for update
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;
if not exists (select 1 from pg_policies where policyname = 'kit_delete' and tablename = 'kit_operacao_itens') then
  create policy kit_delete on public.kit_operacao_itens for delete
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;

if not exists (select 1 from pg_policies where policyname = 'configprec_select' and tablename = 'config_precificacao') then
  create policy configprec_select on public.config_precificacao for select
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;
if not exists (select 1 from pg_policies where policyname = 'configprec_insert' and tablename = 'config_precificacao') then
  create policy configprec_insert on public.config_precificacao for insert
    with check (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;
if not exists (select 1 from pg_policies where policyname = 'configprec_update' and tablename = 'config_precificacao') then
  create policy configprec_update on public.config_precificacao for update
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;
if not exists (select 1 from pg_policies where policyname = 'configprec_delete' and tablename = 'config_precificacao') then
  create policy configprec_delete on public.config_precificacao for delete
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;

if not exists (select 1 from pg_policies where policyname = 'atendimentos_select' and tablename = 'atendimentos') then
  create policy atendimentos_select on public.atendimentos for select
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;
if not exists (select 1 from pg_policies where policyname = 'atendimentos_insert' and tablename = 'atendimentos') then
  create policy atendimentos_insert on public.atendimentos for insert
    with check (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;
if not exists (select 1 from pg_policies where policyname = 'atendimentos_update' and tablename = 'atendimentos') then
  create policy atendimentos_update on public.atendimentos for update
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;
if not exists (select 1 from pg_policies where policyname = 'atendimentos_delete' and tablename = 'atendimentos') then
  create policy atendimentos_delete on public.atendimentos for delete
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;

if not exists (select 1 from pg_policies where policyname = 'integracoes_select' and tablename = 'integracoes_clinica') then
  create policy integracoes_select on public.integracoes_clinica for select
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;
if not exists (select 1 from pg_policies where policyname = 'integracoes_insert' and tablename = 'integracoes_clinica') then
  create policy integracoes_insert on public.integracoes_clinica for insert
    with check (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;
if not exists (select 1 from pg_policies where policyname = 'integracoes_update' and tablename = 'integracoes_clinica') then
  create policy integracoes_update on public.integracoes_clinica for update
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;

if not exists (select 1 from pg_policies where policyname = 'automacoes_config_select' and tablename = 'automacoes_config') then
  create policy automacoes_config_select on public.automacoes_config for select
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;
if not exists (select 1 from pg_policies where policyname = 'automacoes_config_insert' and tablename = 'automacoes_config') then
  create policy automacoes_config_insert on public.automacoes_config for insert
    with check (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;
if not exists (select 1 from pg_policies where policyname = 'automacoes_config_update' and tablename = 'automacoes_config') then
  create policy automacoes_config_update on public.automacoes_config for update
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;

if not exists (select 1 from pg_policies where policyname = 'automacoes_log_select' and tablename = 'automacoes_log') then
  create policy automacoes_log_select on public.automacoes_log for select
    using (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;
if not exists (select 1 from pg_policies where policyname = 'automacoes_log_insert' and tablename = 'automacoes_log') then
  create policy automacoes_log_insert on public.automacoes_log for insert
    with check (clinica_id = public.minha_clinica_id() or public.is_consultoria_admin());
end if;

end $$;

-- VIEWS
create or replace view public.vw_custo_kit_mensal
with (security_invoker = true) as
select clinica_id, cenario, sum(valor_unitario * quantidade_mes) as custo_total_mes
from public.kit_operacao_itens
group by clinica_id, cenario;

create or replace view public.vw_custo_material_servico
with (security_invoker = true) as
select m.clinica_id, m.servico_id,
  sum(m.quantidade_consumida * i.custo_unitario) as custo_material_direto
from public.mapa_insumos_servicos m
join public.insumos i on i.id = m.insumo_id
group by m.clinica_id, m.servico_id;

create or replace view public.vw_custo_servico
with (security_invoker = true) as
select
  s.id as servico_id, s.clinica_id, s.nome as servico_nome,
  s.categoria, s.tempo_medio_min, cp.modalidade, cp.pro_labore_desejado,
  coalesce((select sum(cf.valor_mensal) from public.custos_fixos cf where cf.clinica_id = s.clinica_id), 0) as custo_fixo_mensal,
  round(
    (coalesce((select sum(cf.valor_mensal) from public.custos_fixos cf where cf.clinica_id = s.clinica_id), 0)
     + coalesce(cp.pro_labore_desejado, 0))
    / nullif(cp.horas_dia * cp.dias_mes * 60, 0), 5) as custo_minuto_profissional,
  round(
    ((coalesce((select sum(cf.valor_mensal) from public.custos_fixos cf where cf.clinica_id = s.clinica_id), 0)
      + coalesce(cp.pro_labore_desejado, 0))
     / nullif(cp.horas_dia * cp.dias_mes * 60, 0)) * coalesce(s.tempo_medio_min, 0), 4) as custo_tempo_profissional,
  round(
    coalesce((select k.custo_total_mes from public.vw_custo_kit_mensal k where k.clinica_id = s.clinica_id and k.cenario = 'Atual'), 0)
    / nullif(cp.horas_dia * cp.dias_mes * 60, 0) * coalesce(s.tempo_medio_min, 0), 4) as custo_kit_operacao,
  coalesce((select vm.custo_material_direto from public.vw_custo_material_servico vm where vm.servico_id = s.id), 0) as custo_material_direto,
  s.custo_servico_externo, s.custo_radiografia, s.outros_custos_diretos,
  round(
    (((coalesce((select sum(cf.valor_mensal) from public.custos_fixos cf where cf.clinica_id = s.clinica_id), 0)
       + coalesce(cp.pro_labore_desejado, 0))
      / nullif(cp.horas_dia * cp.dias_mes * 60, 0)) * coalesce(s.tempo_medio_min, 0))
    + coalesce((select k.custo_total_mes from public.vw_custo_kit_mensal k where k.clinica_id = s.clinica_id and k.cenario = 'Atual'), 0)
      / nullif(cp.horas_dia * cp.dias_mes * 60, 0) * coalesce(s.tempo_medio_min, 0)
    + coalesce((select vm.custo_material_direto from public.vw_custo_material_servico vm where vm.servico_id = s.id), 0)
    + coalesce(s.custo_servico_externo, 0) + coalesce(s.custo_radiografia, 0) + coalesce(s.outros_custos_diretos, 0), 4) as custo_total_procedimento,
  case when cp.modalidade = 'convenio' then s.preco_convenio else s.preco_particular end as preco_venda,
  cp.margem_desejada_pct, cp.imposto_pct, cp.taxa_maquininha_pct
from public.servicos s
cross join public.config_precificacao cp
where cp.clinica_id = s.clinica_id;

-- INDICES
create index if not exists idx_insumos_codigo_externo on public.insumos(clinica_id, codigo_externo);
create index if not exists idx_servicos_codigo_externo on public.servicos(clinica_id, codigo_externo);
create index if not exists idx_atendimentos_clinica_data on public.atendimentos(clinica_id, data_atendimento desc);
create index if not exists idx_pacientes_clinica_nome on public.pacientes(clinica_id, nome);
create index if not exists idx_agendamentos_clinica_data on public.agendamentos(clinica_id, data_hora);
create index if not exists idx_profissionais_clinica on public.profissionais(clinica_id);
create index if not exists idx_documentos_clinica on public.documentos_emitidos(clinica_id, created_at desc);
create index if not exists idx_prontuario_paciente on public.prontuario_evolutivo(paciente_id, created_at desc);
