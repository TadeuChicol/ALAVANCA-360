-- ============================================
-- SOLUÇÃO DEFINITIVA: RECRIA config_global
-- ============================================

-- Apaga a tabela existente (se existir)
DROP TABLE IF EXISTS public.config_global;

-- Cria do zero com as colunas corretas
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

-- Insere o registro padrão
INSERT INTO public.config_global (id, logo_metodo_url, nome_consultoria)
VALUES ('global', 'images/logo-alavanca-360.png', 'Alavanca 360 Consultoria');

-- Libera acesso para o sistema
ALTER TABLE public.config_global DISABLE ROW LEVEL SECURITY;
