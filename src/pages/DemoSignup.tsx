import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { 
  ArrowLeft,
  CheckCircle2, 
  Clock, 
  Eye, 
  EyeOff, 
  Loader2, 
  Sparkles,
  TrendingUp,
  Building2,
  MapPin,
  Calendar
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';

const DemoSignup = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [recoveryCity, setRecoveryCity] = useState('');
  const [recoveryDob, setRecoveryDob] = useState('');
  
  const [showPassword, setShowPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      // If user is already logged in, redirect to dashboard
      navigate('/dashboard', { replace: true });
    }
  }, [user, loading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!fullName.trim() || !email.trim() || !password.trim() || !companyName.trim() || !recoveryCity.trim() || !recoveryDob.trim()) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Por favor, preencha todos os campos.',
        variant: 'destructive',
      });
      return;
    }

    if (!acceptTerms) {
      toast({
        title: 'Termos de uso',
        description: 'Você precisa aceitar os termos de uso para continuar.',
        variant: 'destructive',
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: 'Senha muito curta',
        description: 'A senha deve ter pelo menos 6 caracteres.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Call the demo-signup edge function
      // This function will create the user (auto-confirmed), profile, and demo company
      const { error: demoError } = await supabase.functions.invoke('demo-signup', {
        body: {
          full_name: fullName,
          email: email,
          password: password,
          company_name: companyName,
          recovery_city: recoveryCity,
          recovery_dob: recoveryDob,
        },
      });

      if (demoError) {
        // Parse error message if possible
        let msg = demoError.message || 'Erro ao criar conta.';
        try {
          const body = JSON.parse(demoError.message); // Sometimes error is a JSON string
          if (body && body.error) msg = body.error;
        } catch (e) {
          // ignore
        }
        throw new Error(msg);
      }

      toast({
        title: 'Conta criada com sucesso!',
        description: 'Sua empresa foi registrada no AMB_DEMO. Faça login para continuar.',
      });

      // 2. Navigate to login (as per requirement: "liberar para voltar para fazer o login")
      navigate('/auth');

    } catch (error: any) {
      console.error('Signup error:', error);
      
      let errorMessage = error.message || 'Ocorreu um erro ao criar sua conta. Tente novamente.';
      
      if (errorMessage.includes('already registered') || errorMessage.includes('User already exists')) {
        errorMessage = 'Este email já está cadastrado. Tente fazer login.';
      } else if (errorMessage.includes('invalid email')) {
        errorMessage = 'Email inválido. Verifique e tente novamente.';
      }
      
      toast({
        title: 'Erro no cadastro',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const trialBenefits = [
    '14 dias de acesso completo',
    'Ambiente exclusivo AMB_DEMO',
    'Cadastro automático da sua Empresa',
    'Dashboards e relatórios completos',
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/30 flex flex-col items-center justify-center p-4 py-8 overflow-y-auto">
      <div className="w-full max-w-lg my-auto">
        {/* Back button */}
        <Button 
          variant="ghost" 
          className="mb-6"
          onClick={() => navigate('/auth')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar para Login
        </Button>

        <Card className="border-2 shadow-lg">
          <CardHeader className="text-center pb-2">
            <div className="flex justify-center mb-4">
              <img src="/Logo.PNG" alt="Logo" className="h-16 w-16 object-contain" />
            </div>
            
            <Badge className="w-fit mx-auto mb-3 bg-accent/10 text-accent hover:bg-accent/20">
              <Sparkles className="h-3 w-3 mr-1" />
              Simulação Gratuita
            </Badge>
            
            <CardTitle className="text-2xl">Criar conta de demonstração</CardTitle>
            <CardDescription>
              Cadastre sua empresa e experimente o simulador por 14 dias
            </CardDescription>
          </CardHeader>

          <CardContent>
            {/* Trial benefits */}
            <div className="mb-6 p-4 rounded-lg bg-primary/5 border border-primary/20">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">O que está incluído:</span>
              </div>
              <ul className="space-y-2">
                {trialBenefits.map((benefit, index) => (
                  <li key={index} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-accent shrink-0" />
                    {benefit}
                  </li>
                ))}
              </ul>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Nome completo</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="Seu nome completo"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="companyName">Nome da Empresa</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="companyName"
                    type="text"
                    placeholder="Nome da sua empresa"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    disabled={isSubmitting}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="recoveryCity">Cidade de Nascimento</Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="recoveryCity"
                      type="text"
                      placeholder="Para recuperação"
                      value={recoveryCity}
                      onChange={(e) => setRecoveryCity(e.target.value)}
                      disabled={isSubmitting}
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
                      disabled={isSubmitting}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Mínimo 6 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isSubmitting}
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

              <div className="flex items-start gap-2 pt-2">
                <Checkbox
                  id="terms"
                  checked={acceptTerms}
                  onCheckedChange={(checked) => setAcceptTerms(checked as boolean)}
                  disabled={isSubmitting}
                />
                <Label htmlFor="terms" className="text-sm text-muted-foreground leading-relaxed cursor-pointer">
                  Eu aceito os{' '}
                  <a href="#" className="text-primary hover:underline">termos de uso</a>
                  {' '}e a{' '}
                  <a href="#" className="text-primary hover:underline">política de privacidade</a>
                </Label>
              </div>

              <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Criando conta...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Iniciar Simulação Grátis
                  </>
                )}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground mt-6">
              Já tem uma conta?{' '}
              <Button variant="link" className="p-0 h-auto" onClick={() => navigate('/auth')}>
                Fazer login
              </Button>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DemoSignup;
