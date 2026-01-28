import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { 
  ArrowRight, 
  BarChart3, 
  Calculator, 
  CheckCircle2, 
  Clock, 
  FileText, 
  Shield, 
  Sparkles, 
  TrendingUp,
  Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const Landing = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, loading, navigate]);

  const features = [
    {
      icon: FileText,
      title: 'Importação de EFD',
      description: 'Importe arquivos EFD Contribuições e ICMS/IPI automaticamente',
    },
    {
      icon: Calculator,
      title: 'Cálculo Automático',
      description: 'Simulação de IBS e CBS com base nos dados reais da sua empresa',
    },
    {
      icon: BarChart3,
      title: 'Dashboards Analíticos',
      description: 'Visualize o impacto tributário por período, filial e categoria',
    },
    {
      icon: TrendingUp,
      title: 'Comparativos',
      description: 'Compare cenários antes e depois da Reforma Tributária',
    },
  ];

  const benefits = [
    'Análise completa de mercadorias, serviços e fretes',
    'Suporte a múltiplas filiais e CNPJs',
    'Relatórios exportáveis em Excel',
    'Interface moderna e intuitiva',
    'Dados seguros e protegidos',
    'Atualizações conforme a legislação',
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/30">
      {/* Header */}
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="shrink-0">
                <img src="/Logo.PNG" alt="Logo" className="h-10 w-10 object-contain" />
              </div>
              <div>
                <h1 className="font-semibold text-foreground">Reforma Tributária</h1>
                <p className="text-xs text-muted-foreground">Simulador IBS/CBS</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" onClick={() => navigate('/auth')}>
                Entrar
              </Button>
              <Button onClick={() => navigate('/demo-signup')}>
                Começar Grátis
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 md:py-32">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <Badge className="mb-6 bg-primary/10 text-primary hover:bg-primary/20">
              <Sparkles className="h-3 w-3 mr-1" />
              14 dias de teste grátis
            </Badge>
            
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
              Simule o Impacto da{' '}
              <span className="text-primary">Reforma Tributária</span>{' '}
              na sua Empresa
            </h1>
            
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Importe seus arquivos EFD e visualize instantaneamente como a transição 
              de PIS/COFINS para IBS/CBS afetará seus tributos.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="text-lg px-8" onClick={() => navigate('/demo-signup')}>
                <Zap className="h-5 w-5 mr-2" />
                Começar Simulação Grátis
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
              <Button size="lg" variant="outline" className="text-lg px-8" onClick={() => navigate('/auth')}>
                Já tenho conta
              </Button>
            </div>
            
            <div className="flex items-center justify-center gap-6 mt-8 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-accent" />
                <span>Sem cartão de crédito</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-accent" />
                <span>Setup em 2 minutos</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-accent" />
                <span>Dados protegidos</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-card">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Tudo que você precisa para simular</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Ferramentas completas para entender o impacto da Reforma Tributária nos seus negócios
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <Card key={index} className="border-2 hover:border-primary/50 transition-colors">
                <CardContent className="pt-6">
                  <div className="p-3 bg-primary/10 rounded-lg w-fit mb-4">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4">Por que usar nosso simulador?</h2>
              <p className="text-muted-foreground">
                Desenvolvido por especialistas em tributação para facilitar sua transição
              </p>
            </div>
            
            <div className="grid md:grid-cols-2 gap-4">
              {benefits.map((benefit, index) => (
                <div key={index} className="flex items-center gap-3 p-4 rounded-lg bg-card border">
                  <CheckCircle2 className="h-5 w-5 text-accent shrink-0" />
                  <span>{benefit}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-primary/5">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto text-center">
            <Badge className="mb-6 bg-accent/10 text-accent hover:bg-accent/20">
              <Clock className="h-3 w-3 mr-1" />
              Oferta por tempo limitado
            </Badge>
            
            <h2 className="text-3xl font-bold mb-4">
              Comece sua simulação agora mesmo
            </h2>
            <p className="text-muted-foreground mb-8">
              Experimente gratuitamente por 14 dias. Importe 1 EFD Contribuições e 2 EFD ICMS/IPI 
              para ver o impacto real na sua empresa.
            </p>
            
            <Button size="lg" className="text-lg px-8" onClick={() => navigate('/demo-signup')}>
              <Sparkles className="h-5 w-5 mr-2" />
              Iniciar Período de Teste
              <ArrowRight className="h-5 w-5 ml-2" />
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Simulador Reforma Tributária</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2026 Fortes Bezerra Auditoria e Consultoria. Todos os direitos reservados.
            </p>
            <a 
              href="mailto:contato@fortesbezerra.com.br" 
              className="text-sm text-primary hover:underline"
            >
              contato@fortesbezerra.com.br
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
