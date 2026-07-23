-- 
-- ALAVANCA 360® — ALICERCE COMPLETO DO SISTEMA
-- 
-- Execute TUDO de uma vez no SQL Editor do Supabase
-- Este script substitui TODOS os SQLs anteriores (criar_tabelas.sql,
-- tabelas.sql, FUNCOES+RLS+VIEWS+INDICES.sql, SOLUÇÃO DEFINITIVA - 
-- config_global.sql, verificacao.sql)
-- 

-- 
-- 1. FUNÇÕES AUXILIARES
-- 
CREATE OR REPLACE FUNCTION public.minha_clinica_id()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT clinica_id FROM public.users
    WHERE id = auth.uid()
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_consultoria_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.consultoria_admins
    WHERE user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 
-- 2. TABELA: consultoria_admins
-- 
CREATE TABLE IF NOT EXISTS public.consultoria_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email_admin TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.consultoria_admins DISABLE ROW LEVEL SECURITY;

-- 
-- 3. TABELA: config_global
-- 
DROP TABLE IF EXISTS public.config_global CASCADE;
CREATE TABLE public.config_global (
  id TEXT PRIMARY KEY DEFAULT 'global',
  logo_metodo_url TEXT DEFAULT 'images/logo-alavanca-360.png',
  logo_consultoria_url TEXT DEFAULT '',
  nome_consultoria TEXT DEFAULT 'Alavanca 360 Consultoria',
  whatsapp_consultoria TEXT DEFAULT '',
  email_consultoria TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.config_global DISABLE ROW LEVEL SECURITY;

INSERT INTO public.config_global (id, logo_metodo_url, nome_consultoria, email_consultoria)
VALUES ('global', 'images/logo-alavanca-360.png', 'Alavanca 360 Consultoria', 'contato@tce-tadeuchicolempowerment.cloud')
ON CONFLICT (id) DO NOTHING;

-- 
-- 4. TABELA: clinicas (com TODAS as colunas usadas no app.js)
-- 
DROP TABLE IF EXISTS public.clinicas CASCADE;
CREATE TABLE public.clinicas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID REFERENCES auth.users(id),
  nome_clinica TEXT NOT NULL,
  segmento TEXT DEFAULT 'Odontologia',
  email_login TEXT UNIQUE,
  plano_contratado TEXT DEFAULT 'Essencial',
  ativo BOOLEAN DEFAULT true,
  endereco TEXT DEFAULT '',
  telefone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  logo_clinica_url TEXT DEFAULT '',
  logo_url TEXT DEFAULT '',
  url_google_agenda TEXT DEFAULT 'https://calendar.google.com',
  url_calendly TEXT DEFAULT 'https://calendly.com',
  responsavel_nome TEXT DEFAULT '',
  email_responsavel TEXT DEFAULT '',
  whatsapp_responsavel TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.clinicas DISABLE ROW LEVEL SECURITY;

-- 
-- 5. TABELA: pacientes
-- 
CREATE TABLE IF NOT EXISTS public.pacientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id UUID NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  telefone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  data_nascimento DATE,
  cpf TEXT DEFAULT '',
  observacoes TEXT DEFAULT '',
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.pacientes ENABLE ROW LEVEL SECURITY;

-- 
-- 6. TABELA: profissionais
-- 
CREATE TABLE IF NOT EXISTS public.profissionais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id UUID NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  especialidade TEXT DEFAULT '',
  cro TEXT DEFAULT '',
  telefone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.profissionais ENABLE ROW LEVEL SECURITY;

-- 
-- 7. TABELA: agendamentos
-- 
CREATE TABLE IF NOT EXISTS public.agendamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id UUID NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  paciente_id UUID REFERENCES public.pacientes(id) ON DELETE SET NULL,
  profissional_id UUID REFERENCES public.profissionais(id) ON DELETE SET NULL,
  data_hora TIMESTAMPTZ NOT NULL,
  duracao_minutos INTEGER DEFAULT 60,
  status TEXT DEFAULT 'agendado' CHECK (status IN ('agendado', 'confirmado', 'em_atendimento', 'concluido', 'cancelado', 'falta')),
  observacoes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;

-- 
-- 8. TABELA: prontuario_evolutivo
-- 
CREATE TABLE IF NOT EXISTS public.prontuario_evolutivo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id UUID NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  paciente_id UUID NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  tipo TEXT DEFAULT 'evolucao' CHECK (tipo IN ('evolucao', 'orcamento', 'receituario', 'exame', 'documento')),
  conteudo TEXT NOT NULL DEFAULT '',
  travado BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.prontuario_evolutivo ENABLE ROW LEVEL SECURITY;

-- 
-- 9. TABELA: documentos_emitidos
-- 
CREATE TABLE IF NOT EXISTS public.documentos_emitidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id UUID NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  paciente_id UUID REFERENCES public.pacientes(id) ON DELETE SET NULL,
  tipo TEXT DEFAULT 'orcamento' CHECK (tipo IN ('orcamento', 'receituario', 'contrato', 'atestado', 'outro')),
  conteudo TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.documentos_emitidos ENABLE ROW LEVEL SECURITY;

-- 
-- 10. TABELAS DO MÓDULO FINANCEIRO
-- 
CREATE TABLE IF NOT EXISTS public.insumos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id UUID NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  codigo_externo TEXT DEFAULT '',
  custo_unitario NUMERIC(10,2) DEFAULT 0,
  unidade TEXT DEFAULT 'un',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.insumos ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.servicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id UUID NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  codigo_externo TEXT DEFAULT '',
  preco_convenio NUMERIC(10,2) DEFAULT 0,
  preco_particular NUMERIC(10,2) DEFAULT 0,
  tempo_medio_minutos INTEGER DEFAULT 60,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.servicos ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.mapa_insumos_servicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id UUID NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  insumo_id UUID NOT NULL REFERENCES public.insumos(id) ON DELETE CASCADE,
  servico_id UUID NOT NULL REFERENCES public.servicos(id) ON DELETE CASCADE,
  quantidade NUMERIC(10,2) DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (clinica_id, insumo_id, servico_id)
);
ALTER TABLE public.mapa_insumos_servicos ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.custos_fixos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id UUID NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  valor NUMERIC(10,2) NOT NULL DEFAULT 0,
  categoria TEXT DEFAULT 'operacional',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.custos_fixos ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.kit_operacao_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id UUID NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  quantidade_por_cenario INTEGER DEFAULT 1,
  custo_unitario NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.kit_operacao_itens ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.config_precificacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id UUID NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  modalidade TEXT NOT NULL CHECK (modalidade IN ('convenio', 'particular')),
  pro_labore_desejado NUMERIC(5,2) DEFAULT 30,
  margem_minima NUMERIC(5,2) DEFAULT 20,
  impostos NUMERIC(5,2) DEFAULT 10,
  taxa_maquininha NUMERIC(5,2) DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (clinica_id, modalidade)
);
ALTER TABLE public.config_precificacao ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.atendimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id UUID NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  paciente_id UUID REFERENCES public.pacientes(id) ON DELETE SET NULL,
  servico_id UUID REFERENCES public.servicos(id) ON DELETE SET NULL,
  profissional_id UUID REFERENCES public.profissionais(id) ON DELETE SET NULL,
  data_atendimento TIMESTAMPTZ DEFAULT NOW(),
  tipo_pagamento TEXT DEFAULT 'particular' CHECK (tipo_pagamento IN ('convenio', 'particular', 'misto')),
  valor_pago NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.atendimentos ENABLE ROW LEVEL SECURITY;

-- 
-- 11. VIEW: vw_custo_servico
-- 
DROP VIEW IF EXISTS public.vw_custo_servico;
CREATE VIEW public.vw_custo_servico AS
SELECT 
  s.id AS servico_id,
  s.clinica_id,
  s.nome AS servico_nome,
  s.preco_convenio,
  s.preco_particular,
  COALESCE(SUM(mis.quantidade * i.custo_unitario), 0) AS custo_total_insumos,
  CASE WHEN s.preco_convenio > 0 
    THEN ROUND(((s.preco_convenio - COALESCE(SUM(mis.quantidade * i.custo_unitario), 0)) / s.preco_convenio * 100)::numeric, 2)
    ELSE 0 
  END AS margem_convenio_percentual,
  CASE WHEN s.preco_particular > 0 
    THEN ROUND(((s.preco_particular - COALESCE(SUM(mis.quantidade * i.custo_unitario), 0)) / s.preco_particular * 100)::numeric, 2)
    ELSE 0 
  END AS margem_particular_percentual
FROM public.servicos s
LEFT JOIN public.mapa_insumos_servicos mis ON mis.servico_id = s.id
LEFT JOIN public.insumos i ON i.id = mis.insumo_id
GROUP BY s.id, s.clinica_id, s.nome, s.preco_convenio, s.preco_particular;

-- 
-- 12. TABELAS DE INTEGRAÇÕES E AUTOMAÇÕES
-- 
CREATE TABLE IF NOT EXISTS public.integracoes_clinica (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id UUID NOT NULL UNIQUE REFERENCES public.clinicas(id) ON DELETE CASCADE,
  google_conectado BOOLEAN DEFAULT false,
  google_email_conectado TEXT DEFAULT '',
  google_refresh_token TEXT DEFAULT '',
  google_calendar_id TEXT DEFAULT '',
  google_sheet_id TEXT DEFAULT '',
  whatsapp_conectado BOOLEAN DEFAULT false,
  whatsapp_numero TEXT DEFAULT '',
  whatsapp_phone_number_id TEXT DEFAULT '',
  whatsapp_waba_id TEXT DEFAULT '',
  email_conectado BOOLEAN DEFAULT false,
  email_remetente TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.integracoes_clinica ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.automacoes_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id UUID NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('lembrete_consulta', 'confirmacao_agendamento', 'recall_manutencao', 'aniversario', 'pesquisa_satisfacao', 'recuperacao_no_show')),
  ativo BOOLEAN DEFAULT false,
  canal TEXT DEFAULT 'whatsapp' CHECK (canal IN ('whatsapp', 'email', 'ambos')),
  antecedencia_horas NUMERIC DEFAULT 24,
  intervalo_dias NUMERIC DEFAULT 180,
  mensagem_modelo TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (clinica_id, tipo, canal)
);
ALTER TABLE public.automacoes_config ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.automacoes_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id UUID NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  tipo TEXT DEFAULT '',
  paciente_id UUID REFERENCES public.pacientes(id) ON DELETE SET NULL,
  canal TEXT DEFAULT '',
  status TEXT DEFAULT 'enviado' CHECK (status IN ('enviado', 'falhou', 'lido', 'respondido')),
  detalhe TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.automacoes_log ENABLE ROW LEVEL SECURITY;

-- 
-- 13. ÍNDICES DE PERFORMANCE
-- 
CREATE INDEX IF NOT EXISTS idx_pacientes_clinica ON public.pacientes(clinica_id);
CREATE INDEX IF NOT EXISTS idx_pacientes_nome ON public.pacientes(clinica_id, nome);
CREATE INDEX IF NOT EXISTS idx_profissionais_clinica ON public.profissionais(clinica_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_clinica_data ON public.agendamentos(clinica_id, data_hora);
CREATE INDEX IF NOT EXISTS idx_prontuario_paciente ON public.prontuario_evolutivo(paciente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documentos_clinica ON public.documentos_emitidos(clinica_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_atendimentos_clinica_data ON public.atendimentos(clinica_id, data_atendimento DESC);
CREATE INDEX IF NOT EXISTS idx_insumos_clinica ON public.insumos(clinica_id);
CREATE INDEX IF NOT EXISTS idx_servicos_clinica ON public.servicos(clinica_id);
CREATE INDEX IF NOT EXISTS idx_integracoes_clinica ON public.integracoes_clinica(clinica_id);

-- 
-- 14. POLÍTICAS RLS PARA STORAGE
-- 
DROP POLICY IF EXISTS "Bucket clinicas - autenticados" ON storage.objects;
CREATE POLICY "Bucket clinicas - autenticados" ON storage.objects
FOR ALL USING (
  bucket_id = 'clinicas' AND auth.role() = 'authenticated'
);

DROP POLICY IF EXISTS "Leitura - propria clinica" ON storage.objects;
CREATE POLICY "Leitura - propria clinica" ON storage.objects
FOR SELECT USING (
  bucket_id = 'clinicas'
  AND auth.uid() IN (SELECT owner_user_id FROM public.clinicas)
);

-- 
-- 15. CRIAÇÃO DO ADMIN MASTER
-- 
INSERT INTO public.consultoria_admins (user_id, email_admin)
VALUES ('1c9526a1-0543-4c1d-b8dd-1a595600413f', 'contato@tce-tadeuchicolempowerment.cloud')
ON CONFLICT (email_admin) DO NOTHING;

-- 
-- 16. CONFIRMAÇÃO FINAL
-- 
SELECT '✅ ALICERCE ALAVANCA 360 APLICADO COM SUCESSO!' AS status;
