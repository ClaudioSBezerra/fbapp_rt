import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface DemoStatusResponse {
  is_demo: boolean;
  days_remaining: number;
  trial_expired: boolean;
  trial_ends_at: string | null;
  efd_contrib_count: number;
  efd_icms_count: number;
  efd_contrib_limit: number;
  efd_icms_limit: number;
}

interface DemoStatus {
  isDemo: boolean;
  daysRemaining: number;
  trialExpired: boolean;
  trialEndsAt: string | null;
  importCounts: {
    efd_contrib: number;
    efd_icms: number;
  };
  limits: {
    efd_contrib: number;
    efd_icms: number;
  };
}

export function useDemoStatus() {
  const { user } = useAuth();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['demo-status', user?.id],
    queryFn: async (): Promise<DemoStatus> => {
      if (!user?.id) {
        return {
          isDemo: false,
          daysRemaining: 0,
          trialExpired: false,
          trialEndsAt: null,
          importCounts: { efd_contrib: 0, efd_icms: 0 },
          limits: { efd_contrib: 1, efd_icms: 2 },
        };
      }

      // Call the get_demo_status RPC
      const { data: status, error } = await supabase.rpc('get_demo_status', {
        _user_id: user.id,
      });

      if (error) {
        console.error('Error fetching demo status:', error);
        return {
          isDemo: false,
          daysRemaining: 0,
          trialExpired: false,
          trialEndsAt: null,
          importCounts: { efd_contrib: 0, efd_icms: 0 },
          limits: { efd_contrib: 1, efd_icms: 2 },
        };
      }

      // Cast the response to our expected type
      const typedStatus = status as unknown as DemoStatusResponse | null;

      if (!typedStatus || !typedStatus.is_demo) {
        return {
          isDemo: false,
          daysRemaining: 0,
          trialExpired: false,
          trialEndsAt: null,
          importCounts: { efd_contrib: 0, efd_icms: 0 },
          limits: { efd_contrib: 1, efd_icms: 2 },
        };
      }

      return {
        isDemo: typedStatus.is_demo,
        daysRemaining: typedStatus.days_remaining || 0,
        trialExpired: typedStatus.trial_expired || false,
        trialEndsAt: typedStatus.trial_ends_at || null,
        importCounts: {
          efd_contrib: typedStatus.efd_contrib_count || 0,
          efd_icms: typedStatus.efd_icms_count || 0,
        },
        limits: {
          efd_contrib: typedStatus.efd_contrib_limit || 1,
          efd_icms: typedStatus.efd_icms_limit || 2,
        },
      };
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    isDemo: data?.isDemo || false,
    daysRemaining: data?.daysRemaining || 0,
    trialExpired: data?.trialExpired || false,
    trialEndsAt: data?.trialEndsAt || null,
    importCounts: data?.importCounts || { efd_contrib: 0, efd_icms: 0 },
    limits: data?.limits || { efd_contrib: 1, efd_icms: 2 },
    isLoading,
    refetch,
  };
}
