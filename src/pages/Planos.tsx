import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Loader2, Zap, Building2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Plan {
  id: string;
  name: string;
  description: string;
  price: number;
  stripePriceId: string;
  features: string[];
  popular?: boolean;
}

// Planos serão carregados do Stripe, mas definimos defaults aqui
const defaultPlans: Plan[] = [
  {
    id: "profissional",
    name: "Profissional",
    description: "Ideal para pequenas e médias empresas",
    price: 297,
    stripePriceId: "", // Será preenchido pelo Stripe
    features: [
      "Até 5 empresas",
      "Importação ilimitada de arquivos EFD",
      "Dashboards completos",
      "Exportação para Excel",
      "Suporte por email",
    ],
  },
  {
    id: "empresarial",
    name: "Empresarial",
    description: "Para grupos econômicos e escritórios",
    price: 597,
    stripePriceId: "", // Será preenchido pelo Stripe
    popular: true,
    features: [
      "Empresas ilimitadas",
      "Importação ilimitada de arquivos EFD",
      "Dashboards completos",
      "Exportação para Excel",
      "Múltiplos usuários",
      "Suporte prioritário",
      "Relatórios personalizados",
    ],
  },
];

export default function Planos() {
  const navigate = useNavigate();
  const { isTrialing, isExpired, trialDaysLeft, isActive, tenantNome } = useSubscription();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const handleSubscribe = async (plan: Plan) => {
    if (!plan.stripePriceId) {
      toast({
        title: "Plano indisponível",
        description: "Este plano ainda não está configurado. Entre em contato conosco.",
        variant: "destructive",
      });
      return;
    }

    setLoadingPlan(plan.id);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast({
          title: "Sessão expirada",
          description: "Por favor, faça login novamente.",
          variant: "destructive",
        });
        navigate("/auth");
        return;
      }

      const { data, error } = await supabase.functions.invoke("create-checkout-session", {
        body: { priceId: plan.stripePriceId },
      });

      if (error) throw error;

      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error("URL de checkout não retornada");
      }
    } catch (error) {
      console.error("Erro ao criar checkout:", error);
      toast({
        title: "Erro ao processar",
        description: "Não foi possível iniciar o checkout. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Back button */}
        <Button 
          variant="ghost" 
          onClick={() => navigate(-1)}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>

        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold mb-4">
            Escolha seu Plano
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {isExpired 
              ? "Seu período de testes expirou. Escolha um plano para continuar usando o sistema." 
              : isTrialing 
                ? `Você tem ${trialDaysLeft} dias restantes de trial. Assine agora e não perca acesso!`
                : "Selecione o plano ideal para sua empresa."
            }
          </p>
          
          {tenantNome && (
            <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Building2 className="h-4 w-4" />
              <span>Ambiente: {tenantNome}</span>
            </div>
          )}
        </div>

        {/* Subscription status badge */}
        {isActive && (
          <div className="flex justify-center mb-8">
            <Badge variant="default" className="text-base px-4 py-2">
              <Check className="h-4 w-4 mr-2" />
              Assinatura Ativa
            </Badge>
          </div>
        )}

        {/* Plans grid */}
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {defaultPlans.map((plan) => (
            <Card 
              key={plan.id}
              className={cn(
                "relative flex flex-col",
                plan.popular && "border-primary shadow-lg"
              )}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground">
                    <Zap className="h-3 w-3 mr-1" />
                    Mais Popular
                  </Badge>
                </div>
              )}
              
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              
              <CardContent className="flex-1">
                <div className="text-center mb-6">
                  <span className="text-4xl font-bold">
                    R$ {plan.price}
                  </span>
                  <span className="text-muted-foreground">/mês</span>
                </div>
                
                <ul className="space-y-3">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              
              <CardFooter>
                <Button 
                  className="w-full"
                  size="lg"
                  variant={plan.popular ? "default" : "outline"}
                  onClick={() => handleSubscribe(plan)}
                  disabled={loadingPlan !== null || isActive}
                >
                  {loadingPlan === plan.id ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processando...
                    </>
                  ) : isActive ? (
                    "Plano Atual"
                  ) : (
                    "Assinar Agora"
                  )}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        {/* FAQ or contact */}
        <div className="text-center mt-12 text-sm text-muted-foreground">
          <p>
            Precisa de um plano personalizado?{" "}
            <a 
              href="mailto:contato@fortesbezerra.com.br" 
              className="text-primary hover:underline"
            >
              Entre em contato
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
