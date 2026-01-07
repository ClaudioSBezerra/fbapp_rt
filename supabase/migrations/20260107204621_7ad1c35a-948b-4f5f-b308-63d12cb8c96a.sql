-- Promover usuário existente a admin
UPDATE public.user_roles 
SET role = 'admin' 
WHERE user_id = '50cdade7-35a1-4b95-a891-c546829bb049';