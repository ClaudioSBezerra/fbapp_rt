import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface SubscriptionInfo {
  tenantId: string | null;
  tenantNome: string | null;
  subscriptionStatus: "trial" | "active" | "past_due" | "cancelled" | "expired" | null;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  trialDaysLeft: number;
  isExpired: boolean;
  canWrite: boolean;
  isTrialing: boolean;
  isActive: boolean;
}

export function useSubscription() {
  const { user } = useAuth();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["subscription", user?.id],
    queryFn: async (): Promise<SubscriptionInfo> => {
      if (!user) {
        return {
          tenantId: null,
          tenantNome: null,
          subscriptionStatus: null,
          trialStartedAt: null,
          trialEndsAt: null,
          trialDaysLeft: 0,
          isExpired: false,
          canWrite: false,
          isTrialing: false,
          isActive: false,
        };
      }

      const { data, error } = await supabase.rpc("get_tenant_subscription_info", {
        p_user_id: user.id,
      });

      if (error) {
        console.error("Error fetching subscription info:", error);
        throw error;
      }

      // Data is an array, get the first row
      const row = Array.isArray(data) ? data[0] : data;

      if (!row) {
        return {
          tenantId: null,
          tenantNome: null,
          subscriptionStatus: null,
          trialStartedAt: null,
          trialEndsAt: null,
          trialDaysLeft: 0,
          isExpired: false,
          canWrite: false,
          isTrialing: false,
          isActive: false,
        };
      }

      return {
        tenantId: row.tenant_id,
        tenantNome: row.tenant_nome,
        subscriptionStatus: row.subscription_status,
        trialStartedAt: row.trial_started_at,
        trialEndsAt: row.trial_ends_at,
        trialDaysLeft: row.trial_days_left ?? 0,
        isExpired: row.is_expired ?? false,
        canWrite: row.can_write ?? false,
        isTrialing: row.subscription_status === "trial" && !row.is_expired,
        isActive: row.subscription_status === "active",
      };
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  return {
    ...data,
    isLoading,
    refetch,
  } as SubscriptionInfo & { isLoading: boolean; refetch: () => void };
}
