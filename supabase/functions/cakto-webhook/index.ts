import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Pegar o body do Webhook do Cakto
    const payload = await req.json()
    console.log('Webhook payload recebido:', JSON.stringify(payload))

    // Validar se é um evento de pagamento aprovado
    // Nota: De acordo com o log recente, o evento é 'purchase_approved' e o status 'paid' está dentro de data.
    const isApproved = 
        payload.event === 'purchase_approved' || 
        payload.event === 'payment.approved' || 
        payload.event === 'transaction.approved' || 
        payload.data?.status === 'paid' ||
        payload.status === 'paid' ||
        payload.status === 'approved';

    if (!isApproved) {
        console.log(`Evento ignorado (${payload.event} / ${payload.data?.status}). Não é um pagamento aprovado.`);
        return new Response(JSON.stringify({ message: 'Evento ignorado. Não é um pagamento aprovado.' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })
    }

    // Extrair o e-mail do cliente do payload
    // Novamente, depende do formato do Cakto. Ex: payload.data.customer.email
    const userEmail = payload.data?.customer?.email || payload.customer?.email || payload.email;

    if (!userEmail) {
        throw new Error("E-mail do cliente não encontrado no payload do webhook.")
    }

    // Inicializar o cliente Supabase com a Service Role Key para poder bypass RLS
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log(`Buscando perfil para o e-mail: ${userEmail}`)

    // 1. Encontrar o usuário na tabela profiles pelo e-mail
    const { data: profile, error: searchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', userEmail)
        .single()

    if (searchError || !profile) {
        console.error(`Perfil não encontrado para o e-mail: ${userEmail}`, searchError)
        return new Response(JSON.stringify({ error: 'Usuário não encontrado.' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 404, // Retornamos 404 ou 200 dependendo de como o Cakto lida com retentativas
        })
    }

    // 2. Calcular a nova data de expiração (+30 dias)
    // Se a assinatura atual já expirou ou não existe, adiciona 30 dias a partir de HOJE.
    // Se ainda está ativa, adiciona 30 dias a partir da data de expiração atual.
    const now = new Date()
    let currentAccessUntil = profile.access_until ? new Date(profile.access_until) : now
    
    if (currentAccessUntil < now) {
        currentAccessUntil = now
    }

    const newAccessUntil = new Date(currentAccessUntil)
    newAccessUntil.setDate(newAccessUntil.getDate() + 30)

    // 3. Atualizar o perfil do usuário
    const { error: updateError } = await supabase
        .from('profiles')
        .update({ access_until: newAccessUntil.toISOString() })
        .eq('id', profile.id)

    if (updateError) {
        throw updateError
    }

    console.log(`Assinatura renovada com sucesso para ${userEmail}. Nova expiração: ${newAccessUntil.toISOString()}`)

    return new Response(
      JSON.stringify({ message: 'Assinatura renovada com sucesso.', email: userEmail, newAccessUntil }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Erro ao processar webhook:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
