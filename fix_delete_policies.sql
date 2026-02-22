-- Adicionar políticas de exclusão para clientes e empréstimos
-- Isso garante que o usuário possa excluir seus próprios registros

-- Política para excluir empréstimos
DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON "public"."loans";
CREATE POLICY "Enable delete for users based on user_id" ON "public"."loans" FOR DELETE USING (auth.uid() = user_id);

-- Política para excluir clientes
DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON "public"."clients";
CREATE POLICY "Enable delete for users based on user_id" ON "public"."clients" FOR DELETE USING (auth.uid() = user_id);
