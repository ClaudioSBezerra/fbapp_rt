import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    // Get user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      console.error('User error:', userError)
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('User authenticated:', user.id, user.email)

    // Parse request body
    const { priceId } = await req.json()
    if (!priceId) {
      return new Response(
        JSON.stringify({ error: 'Price ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Stripe
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeSecretKey) {
      console.error('STRIPE_SECRET_KEY not configured')
      return new Response(
        JSON.stringify({ error: 'Stripe not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
    })

    // Get tenant info using service role
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
    
    const { data: tenantData } = await supabaseAdmin
      .from('user_tenants')
      .select('tenant_id, tenants(id, nome, stripe_customer_id)')
      .eq('user_id', user.id)
      .single()

    // Handle tenants as array or single object
    const tenantInfo = Array.isArray(tenantData?.tenants) 
      ? tenantData.tenants[0] 
      : tenantData?.tenants

    let customerId = tenantInfo?.stripe_customer_id

    // Create or get Stripe customer
    if (!customerId) {
      console.log('Creating new Stripe customer for tenant')
      
      // Check if customer exists by email
      const existingCustomers = await stripe.customers.list({
        email: user.email,
        limit: 1,
      })

      if (existingCustomers.data.length > 0) {
        customerId = existingCustomers.data[0].id
        console.log('Found existing customer:', customerId)
      } else {
        const customer = await stripe.customers.create({
          email: user.email,
          name: tenantInfo?.nome || user.email,
          metadata: {
            tenant_id: tenantData?.tenant_id,
            user_id: user.id,
          },
        })
        customerId = customer.id
        console.log('Created new customer:', customerId)
      }

      // Save customer ID to tenant
      if (tenantData?.tenant_id) {
        await supabaseAdmin
          .from('tenants')
          .update({ stripe_customer_id: customerId })
          .eq('id', tenantData.tenant_id)
      }
    }

    // Get origin for redirect URLs
    const origin = req.headers.get('origin') || 'https://app.fortesbezerra.com.br'

    // Create checkout session
    console.log('Creating checkout session for price:', priceId)
    
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${origin}/dashboard?checkout=success`,
      cancel_url: `${origin}/planos?checkout=cancelled`,
      metadata: {
        tenant_id: tenantData?.tenant_id,
        user_id: user.id,
      },
      subscription_data: {
        metadata: {
          tenant_id: tenantData?.tenant_id,
          user_id: user.id,
        },
      },
      allow_promotion_codes: true,
      billing_address_collection: 'required',
    })

    console.log('Checkout session created:', session.id)

    return new Response(
      JSON.stringify({ url: session.url, sessionId: session.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error creating checkout session:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
