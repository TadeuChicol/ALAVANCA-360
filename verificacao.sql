-- 
-- ALAVANCA 360® — SETUP COMPLETO
-- Execute tudo de uma vez no SQL Editor
-- 

-- 1. SCHEMA BASE (core)
-- Copie e cole aqui TODO o conteúdo do seu sql/schema.sql
-- (do repositório GitHub)

-- 2. SCHEMA FINANCEIRO
-- Copie e cole aqui TODO o conteúdo do seu sql/schema_financeiro.sql

-- 3. SCHEMA INTEGRAÇÕES
-- Copie e cole aqui TODO o conteúdo do seu sql/schema_integracoes.sql

-- 
-- 4. ÍNDICES DE PERFORMANCE (10 clínicas)
-- 
CREATE INDEX IF NOT EXISTS idx_atendimentos_clinica_data 
  ON atendimentos(clinica_id, data_atendimento DESC);
CREATE INDEX IF NOT EXISTS idx_pacientes_clinica_nome 
  ON pacientes(clinica_id, nome);
CREATE INDEX IF NOT EXISTS idx_agendamentos_clinica_data 
  ON agendamentos(clinica_id, data_hora);
CREATE INDEX IF NOT EXISTS idx_documentos_clinica 
  ON documentos_emitidos(clinica_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prontuario_paciente 
  ON prontuario_evolutivo(paciente_id, created_at DESC);

-- 
-- 5. VERIFICAR RLS (deve retornar ZERO linhas)
-- 
SELECT schemaname, tablename, rowsecurity, '🔴 SEM RLS' AS status
FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = false;

-- 
-- 6. POLÍTICAS RLS PARA STORAGE
-- 
CREATE POLICY "Bucket clinicas - autenticados" ON storage.objects
  FOR ALL USING (
    bucket_id = 'clinicas' AND auth.role() = 'authenticated'
  );
CREATE POLICY "Leitura - própria clínica" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'clinicas'
    AND auth.uid() IN (SELECT owner_user_id FROM clinicas)
  );