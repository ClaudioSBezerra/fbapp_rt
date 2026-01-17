-- Adicionar campos para recuperação de senha via palavra-chave
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS security_keyword_hash TEXT,
ADD COLUMN IF NOT EXISTS phone_number TEXT;

COMMENT ON COLUMN public.profiles.security_keyword_hash IS 'Hash da palavra-chave de segurança para recuperação de senha';
COMMENT ON COLUMN public.profiles.phone_number IS 'Número de telefone para recuperação via WhatsApp';

-- Criar tabela para tokens temporários de reset de senha
CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índice para busca rápida por token
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON public.password_reset_tokens(token);

-- Índice para limpeza de tokens expirados
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires ON public.password_reset_tokens(expires_at);

-- RLS para password_reset_tokens (apenas service role pode acessar)
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- Nenhuma política pública - apenas edge functions com service role podem acessar