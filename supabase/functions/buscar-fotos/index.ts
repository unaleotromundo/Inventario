import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Manejar el chequeo previo de seguridad de los navegadores (CORS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    // 1. Inicializar cliente de Supabase interno con privilegios de Administrador (Service Role)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 2. Extraer la palabra de búsqueda que enviaste desde el index.html
    const { query } = await req.json()
    if (!query) {
      return new Response(JSON.stringify({ error: 'Falta el término de búsqueda' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      })
    }

    // 3. Traer todos los tokens de Google Fotos activos de la tabla
    const { data: cuentas, error: dbError } = await supabaseAdmin
      .from('cuentas_vinculadas')
      .select('email, provider_token')

    if (dbError || !cuentas) throw dbError

    // 4. Disparar las consultas a Google Fotos EN SIMULTÁNEO para todas las cuentas
    const promesasDeBusqueda = cuentas.map(async (cuenta) => {
      try {
        const respuestaGoogle = await fetch('https://photoslibrary.googleapis.com/v1/mediaItems:search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${cuenta.provider_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            pageSize: 20,
            filters: {
              textFilter: {
                textTerms: [query]
              }
            }
          })
        })

        const datos = await respuestaGoogle.json()
        
        // Mapeamos las fotos encontradas aclarándole al index de qué cuenta vino cada una
        return (datos.mediaItems || []).map((item: any) => ({
          id: item.id,
          url: item.baseUrl,
          filename: item.filename,
          cuenta: cuenta.email
        }))

      } catch (err) {
        console.error(`Error buscando en la cuenta ${cuenta.email}:`, err)
        return [] // Si una cuenta falla, devolvemos vacío para no romper las demás
      }
    })

    // Esperamos a que terminen todas las búsquedas en paralelo y unificamos la lista
    const resultadosPorCuenta = await Promise.all(promesasDeBusqueda)
    const todasLasFotos = resultadosPorCuenta.flat()

    return new Response(JSON.stringify({ fotos: todasLasFotos }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    })
  }
})