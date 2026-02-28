-- 1. Criação das Colunas na tabela 'clients' (caso não tenha rodado antes)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS cpf text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS birthdate text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS cep text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS number text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS complement text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS documents text[];

-- 2. Configuração do Storage (Bucket 'documents')
-- Tenta inserir o bucket 'documents' na tabela de buckets do Supabase.
-- ON CONFLICT ignora o erro caso o bucket já exista.
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Políticas de Segurança (RLS) para o Storage
-- Primeiro, removemos políticas antigas para evitar duplicação ou conflitos
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Upload" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Update" ON storage.objects;

-- Política 1: Permitir que QUALQUER PESSOA (público) visualize as imagens
-- Necessário para carregar avatares e documentos no frontend
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'documents' );

-- Política 2: Permitir upload apenas para usuários AUTENTICADOS (logados)
CREATE POLICY "Authenticated Upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'documents' );

-- Política 3: Permitir atualização/deleção apenas para usuários AUTENTICADOS
CREATE POLICY "Authenticated Update"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'documents' );

CREATE POLICY "Authenticated Delete"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'documents' );

-- 4. Adicionar coluna de frequência na tabela de empréstimos
ALTER TABLE loans ADD COLUMN IF NOT EXISTS frequency text DEFAULT 'Mensal';
ALTER TABLE loans ADD COLUMN IF NOT EXISTS skip_saturday boolean DEFAULT false;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS skip_sunday boolean DEFAULT false;

-- 5. Adicionar políticas de exclusão (RLS)
-- Política para excluir empréstimos
DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON "public"."loans";
CREATE POLICY "Enable delete for users based on user_id" ON "public"."loans" FOR DELETE USING (auth.uid() = user_id);

-- Política para excluir clientes
DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON "public"."clients";
CREATE POLICY "Enable delete for users based on user_id" ON "public"."clients" FOR DELETE USING (auth.uid() = user_id);

-- 6. Adicionar coluna para rastrear juros pagos em renovações
ALTER TABLE loans ADD COLUMN IF NOT EXISTS total_interest_paid numeric DEFAULT 0;