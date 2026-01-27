import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { 
  TrendingUp, 
  Mail, 
  Lock, 
  User, 
  ArrowLeft, 
  Sparkles,
  MapPin,
  Calendar,
  Eye,
  EyeOff
} from 'lucide-react';

type AuthMode = 'login' | 'signup' | 'forgot';

export default function Auth() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  
  // Recovery fields
  const [recoveryCity, setRecoveryCity] = useState('');
  const [recoveryDob, setRecoveryDob] = useState('');
  const [newPassword, setNewPassword] = useState('');
  
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const { signIn, signUp, user } = useAuth(); // Removed resetPassword from useAuth as we use custom logic
  const navigate = useNavigate();

  useEffect(() => {
    const checkUserAndRedirect = async () => {
      if (!user) return;

      // Check if user has any tenant linked
      const { data: userTenants } = await supabase
        .from('user_tenants')
        .select('tenant_id')
        .eq('user_id', user.id);

      if (userTenants && userTenants.length > 0) {
        navigate('/select-company');
      } else {
        navigate('/onboarding');
      }
    };

    checkUserAndRedirect();
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (mode === 'forgot') {
        // New Recovery Logic: Security Questions
        if (!email || !recoveryCity || !recoveryDob || !newPassword) {
          toast.error('Preencha todos os campos para recuperar a senha.');
          setIsLoading(false);
          return;
        }
        
        if (newPassword.length < 6) {
           toast.error('A nova senha deve ter pelo menos 6 caracteres.');
           setIsLoading(false);
           return;
        }

        const { data, error } = await supabase.functions.invoke('reset-password-questions', {
          body: {
            email,
            recovery_city: recoveryCity,
            recovery_dob: recoveryDob,
            new_password: newPassword
          }
        });

        if (error) {
           // Try to parse error message
           let msg = error.message || 'Erro ao redefinir senha.';
           try {
             const body = JSON.parse(error.message);
             if (body && body.error) msg = body.error;
           } catch (e) {
             // ignore
           }
           toast.error(msg);
        } else {
          toast.success('Senha atualizada com sucesso! Faça login com a nova senha.');
          setMode('login');
          // Clear sensitive fields
          setNewPassword('');
          setRecoveryCity('');
          setRecoveryDob('');
          setPassword(''); // Clear login password field too if any
        }

      } else if (mode === 'login') {
        const { error } = await signIn(email, password);
        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            toast.error('E-mail ou senha incorretos');
          } else {
            toast.error(error.message);
          }
        } else {
          toast.success('Login realizado com sucesso!');
        }
      } else {
        // Signup mode - technically we redirect to demo-signup, but keep this as fallback
        if (password.length < 6) {
          toast.error('A senha deve ter pelo menos 6 caracteres');
          setIsLoading(false);
          return;
        }
        const { error } = await signUp(email, password, fullName);
        if (error) {
          if (error.message.includes('already registered')) {
            toast.error('Este e-mail já está cadastrado');
          } else {
            toast.error(error.message);
          }
        } else {
          toast.success('Conta criada com sucesso!');
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('Ocorreu um erro inesperado');
    } finally {
      setIsLoading(false);
    }
  };

  const getTitle = () => {
    switch (mode) {
      case 'login': return 'Acessar conta';
      case 'signup': return 'Criar conta';
      case 'forgot': return 'Recuperar senha';
    }
  };

  const getDescription = () => {
    switch (mode) {
      case 'login': return 'Entre com suas credenciais para acessar o sistema';
      case 'signup': return 'Preencha os dados abaixo para criar sua conta';
      case 'forgot': return 'Informe seus dados de segurança para redefinir a senha';
    }
  };

  const getButtonText = () => {
    if (isLoading) return 'Carregando...';
    switch (mode) {
      case 'login': return 'Entrar';
      case 'signup': return 'Criar conta';
      case 'forgot': return 'Redefinir Senha';
    }
  };

  const handleSignupClick = () => {
    // Redirect to the new demo signup page which handles the new flow
    navigate('/demo-signup');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-md animate-fade-in my-auto">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="p-3 bg-primary rounded-xl">
            <TrendingUp className="h-8 w-8 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Reforma Tributária</h1>
            <p className="text-sm text-muted-foreground">Simulador IBS/CBS</p>
          </div>
        </div>

        <Card className="border-border/50 shadow-lg">
          <CardHeader className="space-y-1">
            {mode === 'forgot' && (
              <button
                type="button"
                onClick={() => setMode('login')}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2 w-fit"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar ao login
              </button>
            )}
            <CardTitle className="text-xl">{getTitle()}</CardTitle>
            <CardDescription>{getDescription()}</CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              
              {/* Fields for LOGIN and SIGNUP */}
              {mode !== 'forgot' && (
                <>
                  {mode === 'signup' && (
                    <div className="space-y-2">
                      <Label htmlFor="fullName">Nome completo</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="fullName"
                          type="text"
                          placeholder="Seu nome"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="seu@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Senha</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10"
                        required
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                    {mode === 'login' && (
                      <button
                        type="button"
                        onClick={() => setMode('forgot')}
                        className="text-sm text-primary hover:underline"
                      >
                        Esqueceu sua senha?
                      </button>
                    )}
                  </div>
                </>
              )}

              {/* Fields for FORGOT PASSWORD (Security Questions) */}
              {mode === 'forgot' && (
                <>
                   <div className="space-y-2">
                    <Label htmlFor="email-rec">E-mail</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email-rec"
                        type="email"
                        placeholder="seu@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="recoveryCity">Cidade de Nascimento</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="recoveryCity"
                        type="text"
                        placeholder="Confirme sua cidade"
                        value={recoveryCity}
                        onChange={(e) => setRecoveryCity(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="recoveryDob">Data de Nascimento</Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="recoveryDob"
                        type="date"
                        value={recoveryDob}
                        onChange={(e) => setRecoveryDob(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="newPassword">Nova Senha</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="newPassword"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Nova senha"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="pl-10"
                        required
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </div>
                </>
              )}

            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full" disabled={isLoading}>
                {getButtonText()}
              </Button>
              {mode !== 'forgot' && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground text-center">
                    {mode === 'login' ? 'Não tem uma conta?' : 'Já tem uma conta?'}{' '}
                    <button
                      type="button"
                      onClick={mode === 'login' ? handleSignupClick : () => setMode('login')}
                      className="text-primary hover:underline font-medium"
                    >
                      {mode === 'login' ? 'Criar conta' : 'Fazer login'}
                    </button>
                  </p>
                  {mode === 'login' && (
                    <div className="pt-3 border-t border-border">
                      <Link
                        to="/demo-signup"
                        className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 hover:from-amber-500/20 hover:to-orange-500/20 transition-all font-medium text-sm"
                      >
                        <Sparkles className="h-4 w-4" />
                        Experimente grátis por 14 dias
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
