-- 1. Recriar políticas RLS de participantes com role 'authenticated'
DROP POLICY IF EXISTS "Users can view participantes of their filiais" ON participantes;
DROP POLICY IF EXISTS "Users can insert participantes for their filiais" ON participantes;
DROP POLICY IF EXISTS "Users can update participantes of their filiais" ON participantes;
DROP POLICY IF EXISTS "Users can delete participantes of their filiais" ON participantes;

CREATE POLICY "Users can view participantes of their filiais"
  ON participantes FOR SELECT
  TO authenticated
  USING (has_filial_access(auth.uid(), filial_id));

CREATE POLICY "Users can insert participantes for their filiais"
  ON participantes FOR INSERT
  TO authenticated
  WITH CHECK (has_filial_access(auth.uid(), filial_id));

CREATE POLICY "Users can update participantes of their filiais"
  ON participantes FOR UPDATE
  TO authenticated
  USING (has_filial_access(auth.uid(), filial_id));

CREATE POLICY "Users can delete participantes of their filiais"
  ON participantes FOR DELETE
  TO authenticated
  USING (has_filial_access(auth.uid(), filial_id));

-- 2. Remover participantes órfãos (sem filial correspondente)
DELETE FROM participantes p
WHERE NOT EXISTS (SELECT 1 FROM filiais f WHERE f.id = p.filial_id);

-- 3. Adicionar foreign key com ON DELETE CASCADE
ALTER TABLE participantes
ADD CONSTRAINT fk_participantes_filial
FOREIGN KEY (filial_id) REFERENCES filiais(id) ON DELETE CASCADE;