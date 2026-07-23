-- ============================================================
-- ALAVANCA 360® — SCHEMA BASE DO SISTEMA
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
    email_admin TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.consultoria_admins DISABLE ROW LEVEL SECURITY;

-- 3. TABELA DE CLÍNICAS (TENANTS)
CREATE TABLE IF NOT EXISTS public.clinicas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID REFERENCES auth.users(id),
    nome_clinica TEXT NOT NULL,
    segmento TEXT DEFAULT 'Odontologia',
    email_login TEXT UNIQUE,
    plano_contratado TEXT DEFAULT 'Essencial',
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.clinicas DISABLE ROW LEVEL SECURITY;

-- 4. CONFIGURAÇÃO GLOBAL (HUB MASTER)
CREATE TABLE IF NOT EXISTS public.config_global (
    id TEXT PRIMARY KEY DEFAULT 'global',
    logo_metodo_url TEXT DEFAULT 'images/logo-alavanca-360.png',
    logo_consultoria_url TEXT DEFAULT '',
    nome_consultoria TEXT DEFAULT 'Alavanca 360 Consultoria',
    whatsapp_consultoria TEXT DEFAULT '',
    email_consultoria TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.config_global (id, logo_metodo_url, nome_consultoria)
VALUES ('global', 'images/logo-alavanca-360.png', 'Alavanca 360 Consultoria')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.config_global DISABLE ROW LEVEL SECURITY;
