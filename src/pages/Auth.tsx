import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { TrendingUp, Mail, Lock, User, ArrowLeft, Key, Shield, CheckCircle, MapPin, Calendar, Sparkles, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type AuthMode = 'login' | 'signup' | 'forgot' | 'forgot-keyword' | 'reset-keyword' | 'demo-signup';

export default function Auth() {
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get('mode') === 'demo' ? 'demo-signup' : 'login';
  
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [securityKeyword, setSecurityKeyword] = useState('');
  const [birthCity, setBirthCity] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [hasKeyword, setHasKeyword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingKeyword, setIsCheckingKeyword] = useState(false);
  const { signIn, signUp, resetPassword, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const checkUserAndRedirect = async () => {
      if (!user) return;

      const { data: userTenants } = await supabase
        .from('user_tenants')
        .select('tenant_id')
        .eq('user_id', user.id);

      if (userTenants && userTenants.length > 0) {
        navigate('/dashboard');
      } else {
        navigate('/onboarding');
      }
    };

    checkUserAndRedirect();
  }, [user, navigate]);

  // Check if user has security keyword when entering forgot mode
  const handleForgotPassword = async () => {
    if (!email) {
      toast.error('Digite seu e-mail primeiro');
      return;
    }

    setIsCheckingKeyword(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-security-keyword', {
        body: { action: 'check', email }
      });

      if (error) {
        console.error('Error checking keyword:', error);
        setMode('forgot');
        return;
      }

      if (data?.hasKeyword) {
        setHasKeyword(true);
        setMode('forgot-keyword');
      } else {
        setHasKeyword(false);
        setMode('forgot');
      }
    } catch (err) {
      console.error('Error checking keyword:', err);
      setMode('forgot');
    } finally {
      setIsCheckingKeyword(false);
    }
  };

  // Format date input as DD/MM/YYYY
  const handleBirthDateChange = (value: string) => {
    // Remove non-numeric characters
    const numbers = value.replace(/\D/g, '');
    
    // Apply mask DD/MM/YYYY
    let formatted = '';
    if (numbers.length > 0) {
      formatted = numbers.slice(0, 2);
      if (numbers.length > 2) {
        formatted += '/' + numbers.slice(2, 4);
      }
      if (numbers.length > 4) {
        formatted += '/' + numbers.slice(4, 8);
      }
    }
    
    setBirthDate(formatted);
  };

  // Validate date format DD/MM/YYYY
  const isValidDate = (dateStr: string): boolean => {
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return false;
    
    const [day, month, year] = dateStr.split('/').map(Number);
    const date = new Date(year, month - 1, day);
    
    return date.getDate() === day && 
           date.getMonth() === month - 1 && 
           date.getFullYear() === year &&
           year >= 1900 && year <= new Date().getFullYear();
  };

  // Normalize keyword parts (remove accents + spaces) to avoid mismatch like "Goiânia" vs "Goiania"
  const normalizeKeywordPart = (value: string): string => {
    return value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/\s+/g, '')
      .toLowerCase()
      .trim();
  };

  // Combine city and date into security keyword
  const getCombinedKeyword = (): string => {
    return `${normalizeKeywordPart(birthCity)}${birthDate.trim()}`;
  };

  const handleVerifyKeyword = async () => {
    if (!birthCity || !birthDate) {
      toast.error('Preencha a cidade e a data de nascimento');
      return;
    }

    if (birthCity.trim().length < 2) {
      toast.error('Digite o nome da cidade corretamente');
      return;
    }

    if (!isValidDate(birthDate)) {
      toast.error('Digite uma data válida no formato DD/MM/AAAA');
      return;
    }

    const combinedKeyword = getCombinedKeyword();

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-security-keyword', {
        body: { action: 'verify', email, keyword: combinedKeyword }
      });

      if (error || data?.error) {
        toast.error(data?.error || 'Dados incorretos. Verifique a cidade e data de nascimento.');
        return;
      }

      if (data?.success && data?.token) {
        setResetToken(data.token);
        setMode('reset-keyword');
        toast.success('Dados verificados! Defina sua nova senha.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao verificar dados');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetWithToken = async () => {
    if (!password || !confirmPassword) {
      toast.error('Preencha todos os campos');
      return;
    }

    if (password !== confirmPassword) {
      toast.error('As senhas não conferem');
      return;
    }

    if (password.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres');
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-security-keyword', {
        body: { action: 'reset', token: resetToken, newPassword: password }
      });

      if (error || data?.error) {
        toast.error(data?.error || 'Erro ao redefinir senha');
        return;
      }

      if (data?.success) {
        toast.success('Senha redefinida com sucesso! Faça login com sua nova senha.');
        setMode('login');
        setEmail('');
        setPassword('');
        setConfirmPassword('');
        setSecurityKeyword('');
        setResetToken('');
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao redefinir senha');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (mode === 'forgot') {
        const result = await resetPassword(email);
        
        if (result.error) {
          // Check for domain not verified error
          const errorMsg = String(result.error.message || '');
          if (errorMsg.includes('domain_not_verified') || errorMsg.includes('403') || result.data?.error === 'domain_not_verified') {
            toast.error('O serviço de email ainda não está totalmente configurado. Por favor, use a recuperação por palavra-chave.', {
              duration: 6000,
            });
            // If user has keyword, suggest that method
            if (hasKeyword) {
              setMode('forgot-keyword');
            }
          } else {
            toast.error('Erro ao enviar link: ' + errorMsg);
          }
        } else if (result.data?.error === 'domain_not_verified') {
          toast.error('O serviço de email ainda não está configurado. Por favor, use a recuperação por palavra-chave.', {
            duration: 6000,
          });
          if (hasKeyword) {
            setMode('forgot-keyword');
          }
        } else {
          toast.success('Link de recuperação enviado! Verifique seu e-mail.');
          setMode('login');
          setEmail('');
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
      } else if (mode === 'signup') {
        if (password.length < 6) {
          toast.error('A senha deve ter pelo menos 6 caracteres');
          setIsLoading(false);
          return;
        }

        // Validate structured security keyword fields
        if (birthCity || birthDate) {
          if (!birthCity || birthCity.trim().length < 2) {
            toast.error('Digite o nome da cidade onde nasceu');
            setIsLoading(false);
            return;
          }
          if (!birthDate || !isValidDate(birthDate)) {
            toast.error('Digite uma data de nascimento válida (DD/MM/AAAA)');
            setIsLoading(false);
            return;
          }
        }

        const { error } = await signUp(email, password, fullName);
        if (error) {
          if (error.message.includes('already registered')) {
            toast.error('Este e-mail já está cadastrado');
          } else {
            toast.error(error.message);
          }
        } else {
          // If user provided security keyword fields, save combined keyword
          if (birthCity && birthDate) {
            const combinedKeyword = getCombinedKeyword();
            localStorage.setItem('pending_security_keyword', combinedKeyword);
          }
          toast.success('Conta criada com sucesso!');
        }
      }
    } catch (err) {
      toast.error('Ocorreu um erro inesperado');
    } finally {
      setIsLoading(false);
    }
  };

  // Save pending security keyword after user is authenticated
  useEffect(() => {
    const savePendingKeyword = async () => {
      if (!user) return;
      
      const pendingKeyword = localStorage.getItem('pending_security_keyword');
      if (!pendingKeyword) return;

      try {
        const { error } = await supabase.functions.invoke('verify-security-keyword', {
          body: { action: 'set', userId: user.id, keyword: pendingKeyword }
        });

        if (!error) {
          localStorage.removeItem('pending_security_keyword');
          console.log('Security keyword saved successfully');
        }
      } catch (err) {
        console.error('Error saving security keyword:', err);
      }
    };

    savePendingKeyword();
  }, [user]);

  const handleDemoSignup = async () => {
    if (!email || !password) {
      toast.error('Preencha email e senha');
      return;
    }

    if (password.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres');
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('demo-signup', {
        body: { email, password, fullName: fullName || email.split('@')[0] }
      });

      if (error) {
        throw new Error(error.message || 'Erro ao criar conta demo');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      // Demo account created - now sign in
      toast.success('Conta demo criada! Entrando...');
      
      const { error: signInError } = await signIn(email, password);
      if (signInError) {
        toast.error('Conta criada, mas houve erro no login. Tente fazer login manualmente.');
        setMode('login');
      }
    } catch (err: any) {
      console.error('Demo signup error:', err);
      toast.error(err.message || 'Erro ao criar conta demo');
    } finally {
      setIsLoading(false);
    }
  };

  const getTitle = () => {
    switch (mode) {
      case 'login': return 'Acessar conta';
      case 'signup': return 'Criar conta';
      case 'forgot': return 'Recuperar senha';
      case 'forgot-keyword': return 'Recuperar senha';
      case 'reset-keyword': return 'Nova senha';
      case 'demo-signup': return 'Simulação Grátis';
    }
  };

  const getDescription = () => {
    switch (mode) {
      case 'login': return 'Entre com suas credenciais para acessar o sistema';
      case 'signup': return 'Preencha os dados abaixo para criar sua conta';
      case 'forgot': return 'Informe seu e-mail para receber o link de recuperação';
      case 'forgot-keyword': return 'Digite sua palavra-chave de segurança para recuperar o acesso';
      case 'reset-keyword': return 'Defina sua nova senha';
      case 'demo-signup': return 'Teste grátis por 14 dias - sem cartão de crédito';
    }
  };

  const getButtonText = () => {
    if (isLoading) return 'Carregando...';
    switch (mode) {
      case 'login': return 'Entrar';
      case 'signup': return 'Criar conta';
      case 'forgot': return 'Enviar link de recuperação';
      case 'forgot-keyword': return 'Verificar palavra-chave';
      case 'reset-keyword': return 'Redefinir senha';
      case 'demo-signup': return 'Iniciar Simulação Grátis';
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'forgot-keyword') {
      handleVerifyKeyword();
    } else if (mode === 'reset-keyword') {
      handleResetWithToken();
    } else if (mode === 'demo-signup') {
      handleDemoSignup();
    } else {
      handleSubmit(e);
    }
  };

  const handleBackToLogin = () => {
    setMode('login');
    setSecurityKeyword('');
    setBirthCity('');
    setBirthDate('');
    setResetToken('');
    setPassword('');
    setConfirmPassword('');
    setFullName('');
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="p-3 bg-primary rounded-xl">
            <TrendingUp className="h-8 w-8 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Reforma Tributária</h1>
            <p className="text-sm text-muted-foreground">Simulador IBS/CBS</p>
          </div>
        </div>

        <Card className={`border-border/50 shadow-lg ${mode === 'demo-signup' ? 'border-primary/30' : ''}`}>
          <CardHeader className="space-y-1">
            {(mode === 'forgot' || mode === 'forgot-keyword' || mode === 'reset-keyword' || mode === 'demo-signup') && (
              <button
                type="button"
                onClick={handleBackToLogin}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2 w-fit"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar ao login
              </button>
            )}
            {mode === 'demo-signup' && (
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                  <Sparkles className="h-3 w-3 mr-1" />
                  14 dias grátis
                </Badge>
              </div>
            )}
            <CardTitle className="text-xl">{getTitle()}</CardTitle>
            <CardDescription>{getDescription()}</CardDescription>
            {mode === 'demo-signup' && (
              <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2">
                <span className="flex items-center gap-1">
                  <CheckCircle className="h-3 w-3 text-positive" />
                  Sem cartão
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-primary" />
                  14 dias
                </span>
                <span className="flex items-center gap-1">
                  <Shield className="h-3 w-3 text-primary" />
                  Dados seguros
                </span>
              </div>
            )}
          </CardHeader>
          <form onSubmit={handleFormSubmit}>
            <CardContent className="space-y-4">
              {(mode === 'signup' || mode === 'demo-signup') && (
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

              {mode !== 'reset-keyword' && (
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
                      disabled={mode === 'forgot-keyword'}
                    />
                  </div>
                </div>
              )}

              {mode === 'forgot-keyword' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="birthCityRecover">Cidade onde nasceu</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="birthCityRecover"
                        type="text"
                        placeholder="Ex: São Paulo"
                        value={birthCity}
                        onChange={(e) => setBirthCity(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="birthDateRecover">Data de nascimento</Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="birthDateRecover"
                        type="text"
                        placeholder="DD/MM/AAAA"
                        value={birthDate}
                        onChange={(e) => handleBirthDateChange(e.target.value)}
                        className="pl-10"
                        maxLength={10}
                        required
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Digite os dados que você informou ao criar sua conta.
                  </p>
                </div>
              )}

              {mode === 'reset-keyword' && (
                <>
                  <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <span className="text-sm text-green-600">Palavra-chave verificada!</span>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">Nova senha</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="newPassword"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmNewPassword">Confirmar nova senha</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="confirmNewPassword"
                        type="password"
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                </>
              )}

              {(mode === 'login' || mode === 'signup' || mode === 'demo-signup') && (
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={isCheckingKeyword}
                      className="text-sm text-primary hover:underline disabled:opacity-50"
                    >
                      {isCheckingKeyword ? 'Verificando...' : 'Esqueceu sua senha?'}
                    </button>
                  )}
                </div>
              )}

              {mode === 'demo-signup' && (
                <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                  <p className="text-sm font-medium">O que está incluído:</p>
                  <ul className="text-sm text-muted-foreground space-y-2">
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-positive flex-shrink-0" />
                      <span>1 arquivo EFD Contribuições por período</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-positive flex-shrink-0" />
                      <span>2 arquivos EFD ICMS/IPI por período</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-positive flex-shrink-0" />
                      <span>Acesso completo aos dashboards</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-positive flex-shrink-0" />
                      <span>Simulações de 2027 a 2033</span>
                    </li>
                  </ul>
                </div>
              )}

              {mode === 'signup' && (
                <div className="space-y-4 pt-2 border-t border-border/50">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Recuperação de senha</span>
                    <span className="text-xs text-muted-foreground">(opcional)</span>
                  </div>
                  <p className="text-xs text-muted-foreground -mt-2">
                    Esses dados serão usados para recuperar sua senha caso você a esqueça.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="birthCity">Cidade onde nasceu</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="birthCity"
                        type="text"
                        placeholder="Ex: São Paulo"
                        value={birthCity}
                        onChange={(e) => setBirthCity(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="birthDate">Data de nascimento</Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="birthDate"
                        type="text"
                        placeholder="DD/MM/AAAA"
                        value={birthDate}
                        onChange={(e) => handleBirthDateChange(e.target.value)}
                        className="pl-10"
                        maxLength={10}
                      />
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full" disabled={isLoading}>
                {getButtonText()}
              </Button>

              {mode === 'forgot-keyword' && (
                <button
                  type="button"
                  onClick={() => setMode('forgot')}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Não lembra a palavra-chave? Tentar por e-mail
                </button>
              )}

              {mode === 'forgot' && hasKeyword && (
                <button
                  type="button"
                  onClick={() => setMode('forgot-keyword')}
                  className="text-sm text-primary hover:underline"
                >
                  Recuperar usando palavra-chave de segurança
                </button>
              )}

              {(mode === 'login' || mode === 'signup') && (
                <p className="text-sm text-muted-foreground text-center">
                  {mode === 'login' ? 'Não tem uma conta?' : 'Já tem uma conta?'}{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode(mode === 'login' ? 'signup' : 'login');
                      setSecurityKeyword('');
                      setBirthCity('');
                      setBirthDate('');
                    }}
                    className="text-primary hover:underline font-medium"
                  >
                    {mode === 'login' ? 'Criar conta' : 'Fazer login'}
                  </button>
                </p>
              )}

              {mode === 'demo-signup' && (
                <p className="text-sm text-muted-foreground text-center">
                  Já tem uma conta?{' '}
                  <button
                    type="button"
                    onClick={handleBackToLogin}
                    className="text-primary hover:underline font-medium"
                  >
                    Fazer login
                  </button>
                </p>
              )}

              {mode === 'login' && (
                <div className="pt-2 border-t border-border/50">
                  <button
                    type="button"
                    onClick={() => setMode('demo-signup')}
                    className="w-full py-2 text-sm text-primary hover:text-primary/80 font-medium flex items-center justify-center gap-2"
                  >
                    <Sparkles className="h-4 w-4" />
                    Experimente grátis por 14 dias
                  </button>
                </div>
              )}
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
