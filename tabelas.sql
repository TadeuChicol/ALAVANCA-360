-- ============================================================
-- ALAVANCA 360® — FIX PACK MVP (FUNÇÕES + RLS + SEEDS)
-- ============================================================

-- 1. FUNÇÕES AUXILIARES (usadas pelas RLS policies)
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

-- 2. TABELA DE ADMINS DA CONSULTORIA
CREATE TABLE IF NOT EXISTS public.consultoria_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. CONFIGURAÇÃO GLOBAL
CREATE TABLE IF NOT EXISTS public.config_global (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_consultoria TEXT DEFAULT 'Alavanca 360 Consultoria',
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insere config padrão se vazio
INSERT INTO public.config_global (nome_consultoria) 
SELECT 'Alavanca 360 Consultoria'
WHERE NOT EXISTS (SELECT 1 FROM public.config_global);

-- 4. CORREÇÃO DAS RLS POLICIES (para TODAS as tabelas)
-- Aplica políticas que estavam faltando no schema base
DO $$
DECLARE
  tbl TEXT;
  tables_list TEXT[] := ARRAY[
    'procedures', 'professionals', 'quotes', 'patient_events',
    'financial_entries', 'insumos', 'procedure_costs', 
    'clinic_rooms', 'suppliers', 'insurance_providers'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables_list
  LOOP
    EXECUTE format('
      DROP POLICY IF EXISTS %I ON %I;
      CREATE POLICY %I ON %I FOR ALL 
      USING (clinica_id IN (SELECT clinica_id FROM public.users WHERE id = auth.uid()));
    ', tbl || '_isolation', tbl, tbl || '_isolation', tbl);
  END LOOP;
END $$;

-- 5. ATUALIZAR A URL DO SUPABASE NO BANCO (para referência)
-- (A URL correta será configurada no supabase-config.js)

SELECT '✅ FIX PACK MVP aplicado com sucesso!' AS status;