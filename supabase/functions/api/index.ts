/* Edge Function `api` — тот же контракт, что у Apps Script (Code.gs): GET ?p&g и POST text/plain JSON {a:…}.
   Вся логика и проверки ключей — в Postgres (public.api_*), здесь только маршрутизация и CORS.
   Ответы и тексты ошибок совпадают с v2, поэтому в клиенте меняется только адрес API. */

const URL_ = Deno.env.get('SUPABASE_URL')!
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function out(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
const fail = (error: string) => out({ ok: false, error })

/* Вызов RPC через PostgREST от имени service_role; ошибка БД → {ok:false,error} */
async function rpc(fn: string, args: Record<string, unknown>) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok) return { ok: false, error: (d && (d.message || d.hint)) || `Ошибка базы (${r.status})` }
  return d
}

const s = (x: unknown) => (x == null ? '' : String(x))
const n = (x: unknown) => { const v = Number(x); return Number.isFinite(v) ? Math.floor(v) : 0 }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  if (req.method === 'GET') {
    const u = new URL(req.url)
    return out(await rpc('api_app', { p: s(u.searchParams.get('p')), g: s(u.searchParams.get('g')) }))
  }
  if (req.method !== 'POST') return fail('Плохой запрос')

  let d: Record<string, unknown>
  try {
    const parsed = JSON.parse(await req.text())
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fail('Плохой запрос')
    d = parsed
  } catch { return fail('Плохой запрос') }

  const k = s(d.k), g = s(d.g)
  switch (d.a) {
    case 'vote': {
      const v = Number(d.v)
      return out(await rpc('api_vote', { p: s(d.p), pid: s(d.id), v: Number.isInteger(v) ? v : null }))
    }
    case 'state':   return out(await rpc('api_state', { k, g }))
    case 'ann':     return out(await rpc('api_ann', { k, g, txt: s(d.text) }))
    case 'rooms':   return out(await rpc('api_rooms', { k, g, rws: Array.isArray(d.rows) ? d.rows : [] }))
    case 'group':   return out(await rpc('api_group', { k, g, data: d.data && typeof d.data === 'object' ? d.data : {}, is_new: !!d.isNew }))
    case 'poll':    return out(await rpc('api_poll', {
      k, g, q: s(d.q), opts: Array.isArray(d.opts) ? d.opts.map(s) : [],
      ends: n(d.ends), quorum: n(d.quorum), after: !!d.after,
    }))
    case 'pollSet': return out(await rpc('api_poll_set', { k, g, pid: s(d.id), status: s(d.status), ends: n(d.ends) }))
    default:        return fail('Неизвестное действие')
  }
})
