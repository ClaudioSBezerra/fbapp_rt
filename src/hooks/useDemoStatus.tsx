import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface DemoStatus {
  isDemo: boolean;
  accountType: 'standard' | 'demo' | 'paid';
  trialEndsAt: Date | null;
  trialExpired: boolean;
  daysRemaining: number;
  empresaId: string | null;
  importCounts: {
    efd_contrib: number;
    efd_icms: number;
  };
  limits: {
    efd_contrib: number;
    efd_icms: number;
  };
  isLoading: boolean;
}

const defaultStatus: DemoStatus = {
  isDemo: false,
  accountType: 'standard',
  trialEndsAt: null,
  trialExpired: false,
  daysRemaining: 0,
  empresaId: null,
  importCounts: { efd_contrib: 0, efd_icms: 0 },
  limits: { efd_contrib: 1, efd_icms: 2 },
  isLoading: true,
};

export function useDemoStatus(): DemoStatus {
  const { user } = useAuth();
  const [status, setStatus] = useState<DemoStatus>(defaultStatus);

  useEffect(() => {
    const fetchDemoStatus = async () => {
      if (!user) {
        setStatus({ ...defaultStatus, isLoading: false });
        return;
      }

      try {
        const { data, error } = await supabase.rpc('get_demo_status', {
          _user_id: user.id,
        });

        if (error) {
          console.error('Error fetching demo status:', error);
          setStatus({ ...defaultStatus, isLoading: false });
          return;
        }

        if (!data) {
          setStatus({ ...defaultStatus, isLoading: false });
          return;
        }

        const demoData = data as {
          is_demo: boolean;
          account_type: string;
          trial_ends_at?: string;
          trial_expired?: boolean;
          days_remaining?: number;
          empresa_id?: string;
          import_counts?: { efd_contrib: number; efd_icms: number };
          limits?: { efd_contrib: number; efd_icms: number };
        };

        setStatus({
          isDemo: demoData.is_demo || false,
          accountType: (demoData.account_type as 'standard' | 'demo' | 'paid') || 'standard',
          trialEndsAt: demoData.trial_ends_at ? new Date(demoData.trial_ends_at) : null,
          trialExpired: demoData.trial_expired || false,
          daysRemaining: demoData.days_remaining || 0,
          empresaId: demoData.empresa_id || null,
          importCounts: demoData.import_counts || { efd_contrib: 0, efd_icms: 0 },
          limits: demoData.limits || { efd_contrib: 1, efd_icms: 2 },
          isLoading: false,
        });
      } catch (err) {
        console.error('Error in useDemoStatus:', err);
        setStatus({ ...defaultStatus, isLoading: false });
      }
    };

    fetchDemoStatus();
  }, [user]);

  return status;
}

export function DemoLimitsBanner({ 
  importType, 
  currentCount, 
  maxCount,
  onUpgrade 
}: { 
  importType: 'contrib' | 'icms';
  currentCount: number;
  maxCount: number;
  onUpgrade?: () => void;
}) {
  const remaining = maxCount - currentCount;
  const typeName = importType === 'contrib' ? 'EFD Contribuições' : 'EFD ICMS/IPI';
  
  if (remaining <= 0) {
    return (
      <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <svg className="h-5 w-5 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="font-medium text-destructive">Limite de importação atingido</p>
          <p className="text-sm text-muted-foreground mt-1">
            No modo simulação, você pode importar até {maxCount} arquivo{maxCount > 1 ? 's' : ''} {typeName} por período.
          </p>
          {onUpgrade && (
            <button 
              onClick={onUpgrade}
              className="text-sm text-primary hover:underline mt-2 font-medium"
            >
              Fazer upgrade para remover limitações →
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-warning/10 border border-warning/20 rounded-lg p-4 flex items-start gap-3">
      <div className="flex-shrink-0 mt-0.5">
        <svg className="h-5 w-5 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <div className="flex-1">
        <p className="font-medium text-warning">Modo Simulação Grátis</p>
        <p className="text-sm text-muted-foreground mt-1">
          Você pode importar mais {remaining} arquivo{remaining > 1 ? 's' : ''} {typeName} por período. 
          ({currentCount}/{maxCount} utilizados)
        </p>
        {onUpgrade && (
          <button 
            onClick={onUpgrade}
            className="text-sm text-primary hover:underline mt-2 font-medium"
          >
            Fazer upgrade para importações ilimitadas →
          </button>
        )}
      </div>
    </div>
  );
}

export function DemoTrialBanner({ 
  daysRemaining, 
  trialExpired,
  onUpgrade 
}: { 
  daysRemaining: number;
  trialExpired: boolean;
  onUpgrade?: () => void;
}) {
  if (trialExpired) {
    return (
      <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <svg className="h-5 w-5 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="font-medium text-destructive">Período de teste expirado</p>
            <p className="text-sm text-muted-foreground">
              Seu período de simulação grátis terminou. Assine um plano para continuar.
            </p>
          </div>
        </div>
        {onUpgrade && (
          <button 
            onClick={onUpgrade}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90"
          >
            Ver Planos
          </button>
        )}
      </div>
    );
  }

  if (daysRemaining <= 3) {
    return (
      <div className="bg-warning/10 border border-warning/20 rounded-lg p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <svg className="h-5 w-5 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="font-medium text-warning">
              {daysRemaining === 0 ? 'Último dia!' : `${daysRemaining} dia${daysRemaining > 1 ? 's' : ''} restante${daysRemaining > 1 ? 's' : ''}`}
            </p>
            <p className="text-sm text-muted-foreground">
              Seu período de simulação grátis está acabando.
            </p>
          </div>
        </div>
        {onUpgrade && (
          <button 
            onClick={onUpgrade}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90"
          >
            Assinar Agora
          </button>
        )}
      </div>
    );
  }

  return null;
}
