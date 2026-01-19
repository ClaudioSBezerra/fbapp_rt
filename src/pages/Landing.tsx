import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useNavigate } from "react-router-dom";
import { 
  TrendingUp, 
  Shield, 
  FileText, 
  Upload, 
  BarChart3, 
  CheckCircle, 
   
  Users,
  AlertTriangle,
  ArrowRight,
  Zap,
  Target,
  Calculator,
  Building2,
  Truck,
  Lightbulb
} from "lucide-react";

const Landing = () => {
  const navigate = useNavigate();

  const handleCTA = () => {
    navigate("/auth?mode=demo");
  };

  const handleLogin = () => {
    navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-background" />
        <div className="relative container mx-auto px-4 py-20 lg:py-32">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            
            <Badge className="bg-primary/10 text-primary border-primary/20 px-4 py-2 text-sm font-medium">
              🎁 14 dias de teste grátis • Sem cartão de crédito
            </Badge>
            
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-foreground">
              Sua empresa está preparada para a{" "}
              <span className="text-primary">Reforma Tributária</span>?
            </h1>
            
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Simule o impacto do IBS e CBS nas suas operações antes que seja tarde. 
              Tome decisões estratégicas com até 7 anos de antecedência.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Button size="lg" onClick={handleCTA} className="text-lg px-8 py-6">
                Começar Simulação Grátis
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button size="lg" variant="outline" onClick={() => document.getElementById('como-funciona')?.scrollIntoView({ behavior: 'smooth' })} className="text-lg px-8 py-6">
                Como Funciona
              </Button>
            </div>

            <p className="text-sm text-muted-foreground pt-4">
              ✓ Sem cartão de crédito &nbsp; ✓ Dados seguros &nbsp; ✓ Baseado na EC 132/2023
            </p>
          </div>
        </div>
      </section>

      {/* Problem/Pain Points Section */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Os riscos de não se preparar agora
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              A transição tributária começa em 2027. Empresas que não se anteciparem podem enfrentar:
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <Card className="border-destructive/20 bg-destructive/5">
              <CardHeader>
                <AlertTriangle className="h-10 w-10 text-destructive mb-2" />
                <CardTitle className="text-xl">Margens Indefinidas</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Sem simulação prévia, você não saberá como a nova carga tributária afetará suas margens de lucro até 2027.
                </p>
              </CardContent>
            </Card>

            <Card className="border-destructive/20 bg-destructive/5">
              <CardHeader>
                <Users className="h-10 w-10 text-destructive mb-2" />
                <CardTitle className="text-xl">Fornecedores Mais Caros</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Compras de fornecedores do Simples Nacional podem ter crédito limitado, impactando seus custos operacionais.
                </p>
              </CardContent>
            </Card>

            <Card className="border-destructive/20 bg-destructive/5">
              <CardHeader>
                <Calculator className="h-10 w-10 text-destructive mb-2" />
                <CardTitle className="text-xl">Precificação Incorreta</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Produtos e serviços podem estar sendo precificados incorretamente para o novo regime tributário.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <Badge variant="secondary" className="mb-4">Funcionalidades</Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Tudo que você precisa para simular a Reforma Tributária
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Plataforma completa para análise de impacto tributário baseada nos seus dados reais do SPED Fiscal.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <Upload className="h-10 w-10 text-primary mb-2" />
                <CardTitle>Importação Automática EFD</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Importe seus arquivos EFD Contribuições e ICMS/IPI com arrastar e soltar. Processamento automático de milhares de registros.
                </p>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <TrendingUp className="h-10 w-10 text-primary mb-2" />
                <CardTitle>Simulação Ano a Ano</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Projeções de 2027 a 2033 com as alíquotas oficiais de transição. Visualize a evolução da carga tributária ao longo dos anos.
                </p>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <Target className="h-10 w-10 text-primary mb-2" />
                <CardTitle>Análise Granular</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Mercadorias, Serviços, Fretes, Energia e Água. Entenda o impacto em cada categoria de operação da sua empresa.
                </p>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <Users className="h-10 w-10 text-primary mb-2" />
                <CardTitle>Comparativo por Participante</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Compare fornecedores do Regime Normal vs Simples Nacional. Identifique quais relações comerciais serão mais impactadas.
                </p>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <BarChart3 className="h-10 w-10 text-primary mb-2" />
                <CardTitle>Dashboards Executivos</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Indicadores visuais de economia vs aumento de carga tributária. Gráficos interativos para tomada de decisão.
                </p>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <Building2 className="h-10 w-10 text-primary mb-2" />
                <CardTitle>Multi-Empresa</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Gerencie grupos econômicos com múltiplas empresas e filiais. Consolidação de dados e análises por CNPJ.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 bg-primary/5">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <Badge variant="secondary" className="mb-4">Benefícios</Badge>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                Por que antecipar a análise tributária?
              </h2>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Zap className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    Decisões Estratégicas Antecipadas
                  </h3>
                  <p className="text-muted-foreground">
                    Com até 7 anos de projeção, você pode planejar investimentos, expansões e reestruturações com base em dados reais.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Users className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    Renegociação de Contratos
                  </h3>
                  <p className="text-muted-foreground">
                    Identifique fornecedores que gerarão menos crédito tributário e renegocie condições comerciais antes da transição.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Target className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    Categorias de Maior Impacto
                  </h3>
                  <p className="text-muted-foreground">
                    Descubra quais tipos de operação (mercadorias, serviços, fretes) terão maior variação de carga tributária.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Lightbulb className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    Planejamento Tributário Real
                  </h3>
                  <p className="text-muted-foreground">
                    Baseado nas suas operações reais importadas do SPED, não em estimativas genéricas de mercado.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="como-funciona" className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <Badge variant="secondary" className="mb-4">Como Funciona</Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Três passos simples para começar
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Em poucos minutos você terá projeções tributárias baseadas nos dados reais da sua empresa.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold mx-auto mb-6">
                1
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">
                Importe seus arquivos EFD
              </h3>
              <p className="text-muted-foreground">
                Arraste e solte seus arquivos EFD Contribuições e ICMS/IPI. Suporte a múltiplos arquivos simultaneamente.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold mx-auto mb-6">
                2
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">
                Configure as alíquotas
              </h3>
              <p className="text-muted-foreground">
                Utilize as alíquotas oficiais da EC 132/2023 ou ajuste conforme cenários específicos da sua análise.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold mx-auto mb-6">
                3
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">
                Visualize as projeções
              </h3>
              <p className="text-muted-foreground">
                Dashboards interativos mostram a evolução da carga tributária ano a ano, com comparativos e exportação de dados.
              </p>
            </div>
          </div>

          <div className="text-center mt-12">
            <Button size="lg" onClick={handleCTA} className="text-lg px-8 py-6">
              Começar Agora - É Grátis
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* Credibility Section */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                Baseado em dados oficiais
              </h2>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <Card className="text-center">
                <CardHeader>
                  <FileText className="h-12 w-12 text-primary mx-auto mb-2" />
                  <CardTitle>EC 132/2023</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Alíquotas e cronograma de transição conforme a Emenda Constitucional aprovada.
                  </p>
                </CardContent>
              </Card>

              <Card className="text-center">
                <CardHeader>
                  <Shield className="h-12 w-12 text-primary mx-auto mb-2" />
                  <CardTitle>SPED Fiscal</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Dados extraídos diretamente dos seus arquivos EFD, garantindo precisão nas análises.
                  </p>
                </CardContent>
              </Card>

              <Card className="text-center">
                <CardHeader>
                  <CheckCircle className="h-12 w-12 text-primary mx-auto mb-2" />
                  <CardTitle>Dados Seguros</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Seus dados são criptografados e isolados por empresa. Conformidade com LGPD.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <Badge variant="secondary" className="mb-4">FAQ</Badge>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                Perguntas Frequentes
              </h2>
            </div>

            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="item-1">
                <AccordionTrigger className="text-left">
                  Quando a Reforma Tributária entra em vigor?
                </AccordionTrigger>
                <AccordionContent>
                  A transição começa em 2027 e vai até 2033. Durante esse período, as alíquotas de IBS e CBS aumentam gradualmente enquanto PIS, COFINS, ICMS e ISS são reduzidos. Em 2033, o novo sistema estará completamente implementado.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-2">
                <AccordionTrigger className="text-left">
                  Como os dados da minha empresa são protegidos?
                </AccordionTrigger>
                <AccordionContent>
                  Utilizamos criptografia em trânsito e em repouso. Os dados são isolados por tenant (empresa/grupo), garantindo que apenas usuários autorizados tenham acesso. Estamos em conformidade com a LGPD.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-3">
                <AccordionTrigger className="text-left">
                  Posso importar múltiplos arquivos EFD de uma vez?
                </AccordionTrigger>
                <AccordionContent>
                  Sim! Você pode fazer upload de múltiplos arquivos EFD Contribuições e ICMS/IPI simultaneamente. O sistema processa em fila e você pode acompanhar o progresso de cada arquivo.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-4">
                <AccordionTrigger className="text-left">
                  O sistema funciona para empresas do Simples Nacional?
                </AccordionTrigger>
                <AccordionContent>
                  A plataforma é focada em empresas do Lucro Real e Lucro Presumido que precisam analisar créditos tributários. No entanto, ela identifica fornecedores do Simples Nacional e calcula o impacto nas suas aquisições.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-5">
                <AccordionTrigger className="text-left">
                  Posso exportar os dados e relatórios?
                </AccordionTrigger>
                <AccordionContent>
                  Sim, todos os dashboards e tabelas podem ser exportados para Excel. Isso facilita a integração com suas análises internas e apresentações para a diretoria.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-6">
                <AccordionTrigger className="text-left">
                  Quanto custa utilizar a plataforma?
                </AccordionTrigger>
                <AccordionContent>
                  Oferecemos um período de teste gratuito para você conhecer a plataforma. Entre em contato para conhecer nossos planos para escritórios de contabilidade e empresas de médio e grande porte.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-20 bg-primary">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground mb-4">
              Não espere até 2027 para descobrir o impacto
            </h2>
            <p className="text-xl text-primary-foreground/80 mb-8">
              Comece agora a simular a Reforma Tributária com os dados reais da sua empresa.
            </p>
            <Button 
              size="lg" 
              variant="secondary" 
              onClick={handleCTA} 
              className="text-lg px-8 py-6"
            >
              Criar Conta Gratuita
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t">
        <div className="container mx-auto px-4">
          <div className="text-center text-muted-foreground text-sm">
            <p>© {new Date().getFullYear()} Simulador Reforma Tributária. Baseado na EC 132/2023.</p>
            <p className="mt-2">
              Desenvolvido para empresas de médio e grande porte e escritórios de contabilidade.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
