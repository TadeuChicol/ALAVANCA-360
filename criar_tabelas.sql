-- 
-- CRIA TABELAS BASE DO SISTEMA
-- 

-- Tabela clinicas (tenants)
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

-- Tabela config_global (já criada antes, só garantindo)
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
