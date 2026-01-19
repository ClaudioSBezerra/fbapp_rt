import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
    
    if (!stripeSecretKey) {
      console.error('STRIPE_SECRET_KEY not configured')
      return new Response('Stripe not configured', { status: 500 })
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
    })

    // Get the signature from headers
    const signature = req.headers.get('stripe-signature')
    const body = await req.text()

    let event: Stripe.Event

    // Verify webhook signature if secret is configured
    if (webhookSecret && signature) {
      try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        console.error('Webhook signature verification failed:', errorMessage)
        return new Response(`Webhook Error: ${errorMessage}`, { status: 400 })
      }
    } else {
      // For testing without signature verification
      event = JSON.parse(body)
      console.warn('Webhook signature not verified - this should only happen in development')
    }

    console.log('Received Stripe event:', event.type)

    // Initialize Supabase admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        console.log('Checkout completed:', session.id)
        
        const tenantId = session.metadata?.tenant_id
        if (tenantId) {
          const subscriptionId = session.subscription as string
          
          // Get subscription details
          const subscription = await stripe.subscriptions.retrieve(subscriptionId)
          
          // Update tenant with subscription info
          const { error } = await supabase
            .from('tenants')
            .update({
              subscription_status: 'active',
              stripe_customer_id: session.customer as string,
              stripe_subscription_id: subscriptionId,
            })
            .eq('id', tenantId)

          if (error) {
            console.error('Error updating tenant:', error)
          } else {
            console.log('Tenant updated to active:', tenantId)
          }
        }
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        console.log('Subscription updated:', subscription.id, 'Status:', subscription.status)
        
        const tenantId = subscription.metadata?.tenant_id

        if (tenantId) {
          let dbStatus: string = 'active'
          
          switch (subscription.status) {
            case 'active':
              dbStatus = 'active'
              break
            case 'past_due':
              dbStatus = 'past_due'
              break
            case 'canceled':
            case 'unpaid':
              dbStatus = 'cancelled'
              break
            case 'trialing':
              dbStatus = 'trial'
              break
            default:
              dbStatus = 'expired'
          }

          const { error } = await supabase
            .from('tenants')
            .update({ subscription_status: dbStatus })
            .eq('id', tenantId)

          if (error) {
            console.error('Error updating subscription status:', error)
          } else {
            console.log('Tenant subscription status updated:', dbStatus)
          }
        } else {
          // Try to find tenant by stripe_subscription_id
          const { data: tenant } = await supabase
            .from('tenants')
            .select('id')
            .eq('stripe_subscription_id', subscription.id)
            .single()

          if (tenant) {
            let dbStatus = 'active'
            if (subscription.status === 'past_due') dbStatus = 'past_due'
            if (subscription.status === 'canceled' || subscription.status === 'unpaid') dbStatus = 'cancelled'
            
            await supabase
              .from('tenants')
              .update({ subscription_status: dbStatus })
              .eq('id', tenant.id)
          }
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        console.log('Subscription deleted:', subscription.id)
        
        // Find tenant by subscription ID and mark as expired
        const { data: tenant, error: findError } = await supabase
          .from('tenants')
          .select('id')
          .eq('stripe_subscription_id', subscription.id)
          .single()

        if (tenant) {
          const { error } = await supabase
            .from('tenants')
            .update({ 
              subscription_status: 'expired',
              stripe_subscription_id: null,
            })
            .eq('id', tenant.id)

          if (error) {
            console.error('Error marking subscription as expired:', error)
          } else {
            console.log('Tenant marked as expired:', tenant.id)
          }
        }
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        console.log('Invoice paid:', invoice.id)
        
        // Ensure subscription is active
        if (invoice.subscription) {
          const { data: tenant } = await supabase
            .from('tenants')
            .select('id')
            .eq('stripe_subscription_id', invoice.subscription)
            .single()

          if (tenant) {
            await supabase
              .from('tenants')
              .update({ subscription_status: 'active' })
              .eq('id', tenant.id)
          }
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        console.log('Invoice payment failed:', invoice.id)
        
        if (invoice.subscription) {
          const { data: tenant } = await supabase
            .from('tenants')
            .select('id')
            .eq('stripe_subscription_id', invoice.subscription)
            .single()

          if (tenant) {
            await supabase
              .from('tenants')
              .update({ subscription_status: 'past_due' })
              .eq('id', tenant.id)
          }
        }
        break
      }

      default:
        console.log('Unhandled event type:', event.type)
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Webhook error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
