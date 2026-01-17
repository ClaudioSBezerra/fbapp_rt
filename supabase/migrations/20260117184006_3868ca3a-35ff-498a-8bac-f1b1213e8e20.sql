-- Adicionar constraint UNIQUE na coluna user_id para permitir upsert
ALTER TABLE public.user_roles 
ADD CONSTRAINT user_roles_user_id_unique UNIQUE (user_id);