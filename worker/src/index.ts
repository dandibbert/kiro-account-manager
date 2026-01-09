const DESKTOP_AUTH_API = 'https://prod.us-east-1.auth.desktop.kiro.dev'
const DESKTOP_USAGE_API = 'https://codewhisperer.us-east-1.amazonaws.com'
const PROFILE_ARN =
  'arn:aws:codewhisperer:us-east-1:699475941385:profile/EHGA3GRVQMUK'

type Account = {
  id: string
  email: string
  label: string
  status: string
  addedAt: string
  accessToken: string | null
  refreshToken: string | null
  csrfToken: string | null
  sessionToken: string | null
  expiresAt: string | null
  provider: string | null
  userId: string | null
  clientId: string | null
  clientSecret: string | null
  region: string | null
  clientIdHash: string | null
  ssoSessionId: string | null
  idToken: string | null
  profileArn: string | null
  usageData: unknown | null
}

type Env = {
  KIRO_ACCOUNTS: KVNamespace
  APP_SECRET: string
  ASSETS: Fetcher
}

type RefreshResponse = {
  accessToken: string
  refreshToken: string
  expiresIn: number
  profileArn?: string
  csrfToken?: string
}

type UsageResponse = {
  userInfo?: { email?: string; userId?: string }
  subscriptionInfo?: { subscriptionTitle?: string; type?: string }
  usageBreakdownList?: Array<{
    usageLimit?: number
    currentUsage?: number
    freeTrialInfo?: unknown
    bonuses?: unknown
  }>
}

const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  })

const withCors = (response: Response) => {
  const headers = new Headers(response.headers)
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

const requireAuth = (request: Request, env: Env) => {
  if (!env.APP_SECRET) {
    throw new Error('Server misconfigured: APP_SECRET is missing')
  }
  const authHeader = request.headers.get('Authorization') || ''
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token || token !== env.APP_SECRET) {
    return false
  }
  return true
}

const formatDateTime = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(
    date.getDate()
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

const loadAccounts = async (env: Env): Promise<Account[]> => {
  const accounts = await env.KIRO_ACCOUNTS.get('accounts', { type: 'json' })
  return Array.isArray(accounts) ? (accounts as Account[]) : []
}

const saveAccounts = async (env: Env, accounts: Account[]) => {
  await env.KIRO_ACCOUNTS.put('accounts', JSON.stringify(accounts))
}

const refreshTokenDesktop = async (
  refreshToken: string
): Promise<RefreshResponse> => {
  const response = await fetch(`${DESKTOP_AUTH_API}/refreshToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('RefreshToken 已过期或无效')
    }
    throw new Error(`RefreshToken failed (${response.status})`)
  }

  return response.json()
}

const getUsageLimitsDesktop = async (
  accessToken: string
): Promise<{ usage: UsageResponse | null; isBanned: boolean }> => {
  const url = `${DESKTOP_USAGE_API}/getUsageLimits?isEmailRequired=true&origin=AI_EDITOR&profileArn=${encodeURIComponent(
    PROFILE_ARN
  )}`

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  })

  const text = await response.text()
  if (!response.ok) {
    try {
      const errorJson = JSON.parse(text)
      if (errorJson?.reason) {
        return { usage: null, isBanned: true }
      }
    } catch {
      // ignore parse errors
    }
    throw new Error(`GetUsageLimits failed (${response.status})`)
  }

  return { usage: JSON.parse(text), isBanned: false }
}

const buildAccount = (
  base: Partial<Account>,
  overrides: Partial<Account> = {}
): Account => {
  const now = new Date()
  return {
    id: crypto.randomUUID(),
    email: base.email || 'unknown@kiro.dev',
    label: base.label || 'Kiro 账号',
    status: base.status || '正常',
    addedAt: base.addedAt || formatDateTime(now),
    accessToken: base.accessToken ?? null,
    refreshToken: base.refreshToken ?? null,
    csrfToken: base.csrfToken ?? null,
    sessionToken: base.sessionToken ?? null,
    expiresAt: base.expiresAt ?? null,
    provider: base.provider ?? null,
    userId: base.userId ?? null,
    clientId: base.clientId ?? null,
    clientSecret: base.clientSecret ?? null,
    region: base.region ?? null,
    clientIdHash: base.clientIdHash ?? null,
    ssoSessionId: base.ssoSessionId ?? null,
    idToken: base.idToken ?? null,
    profileArn: base.profileArn ?? null,
    usageData: base.usageData ?? null,
    ...overrides,
  }
}

const normalizeProvider = (provider: string | undefined, email: string) => {
  if (provider) return provider
  if (email.includes('gmail')) return 'Google'
  if (email.includes('github')) return 'Github'
  return 'Google'
}

const parseBody = async (request: Request) => {
  const text = await request.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('Invalid JSON payload')
  }
}

const handleAddAccount = async (request: Request, env: Env) => {
  const body = (await parseBody(request)) as {
    refreshToken?: string
    provider?: string
  }

  if (!body.refreshToken) {
    return json({ error: '缺少 refreshToken' }, { status: 400 })
  }

  const refreshResult = await refreshTokenDesktop(body.refreshToken)
  const { usage, isBanned } = await getUsageLimitsDesktop(
    refreshResult.accessToken
  )

  const email = usage?.userInfo?.email || 'unknown@kiro.dev'
  const provider = normalizeProvider(body.provider, email)
  const expiresAt = formatDateTime(
    new Date(Date.now() + refreshResult.expiresIn * 1000)
  )

  const accounts = await loadAccounts(env)
  const existing = accounts.find(
    (account) => account.email === email && account.provider === provider
  )

  const updatedAccount = buildAccount(
    {
      email,
      label: `Kiro ${provider} 账号`,
      status: isBanned ? '已封禁' : '正常',
      accessToken: refreshResult.accessToken,
      refreshToken: refreshResult.refreshToken,
      profileArn: refreshResult.profileArn,
      csrfToken: refreshResult.csrfToken,
      usageData: usage,
      expiresAt,
      provider,
      userId: usage?.userInfo?.userId || null,
    },
    existing ? { id: existing.id, addedAt: existing.addedAt } : {}
  )

  const nextAccounts = existing
    ? accounts.map((account) =>
        account.id === existing.id ? updatedAccount : account
      )
    : [updatedAccount, ...accounts]

  await saveAccounts(env, nextAccounts)
  return json(updatedAccount, { status: 201 })
}

const handleRefresh = async (env: Env, id: string, syncUsage: boolean) => {
  const accounts = await loadAccounts(env)
  const account = accounts.find((item) => item.id === id)
  if (!account?.refreshToken) {
    return json({ error: 'Account not found' }, { status: 404 })
  }

  const refreshResult = await refreshTokenDesktop(account.refreshToken)
  const expiresAt = formatDateTime(
    new Date(Date.now() + refreshResult.expiresIn * 1000)
  )

  let usageData = account.usageData
  let status = account.status
  let userId = account.userId

  if (syncUsage) {
    const { usage, isBanned } = await getUsageLimitsDesktop(
      refreshResult.accessToken
    )
    usageData = usage
    status = isBanned ? '已封禁' : '正常'
    userId = usage?.userInfo?.userId || userId
  }

  const updated = {
    ...account,
    accessToken: refreshResult.accessToken,
    refreshToken: refreshResult.refreshToken,
    expiresAt,
    profileArn: refreshResult.profileArn || account.profileArn,
    csrfToken: refreshResult.csrfToken || account.csrfToken,
    usageData,
    status,
    userId,
  }

  const nextAccounts = accounts.map((item) =>
    item.id === id ? updated : item
  )

  await saveAccounts(env, nextAccounts)
  return json(updated)
}

const handleUpdateAccount = async (
  env: Env,
  id: string,
  updates: Partial<Account>
) => {
  const accounts = await loadAccounts(env)
  const account = accounts.find((item) => item.id === id)
  if (!account) {
    return json({ error: 'Account not found' }, { status: 404 })
  }

  const updated = {
    ...account,
    label: updates.label ?? account.label,
    accessToken: updates.accessToken ?? account.accessToken,
    refreshToken: updates.refreshToken ?? account.refreshToken,
    clientId: updates.clientId ?? account.clientId,
    clientSecret: updates.clientSecret ?? account.clientSecret,
  }

  const nextAccounts = accounts.map((item) =>
    item.id === id ? updated : item
  )

  await saveAccounts(env, nextAccounts)
  return json(updated)
}

const handleDeleteAccounts = async (env: Env, ids: string[]) => {
  const accounts = await loadAccounts(env)
  const nextAccounts = accounts.filter((item) => !ids.includes(item.id))
  await saveAccounts(env, nextAccounts)
  return json({ deleted: accounts.length - nextAccounts.length })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const { pathname } = url

    if (!pathname.startsWith('/api')) {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method Not Allowed', { status: 405 })
      }
      const assetResponse = await env.ASSETS.fetch(request)
      if (
        assetResponse.status === 404 &&
        request.headers.get('Accept')?.includes('text/html')
      ) {
        return env.ASSETS.fetch(new Request(new URL('/index.html', url), request))
      }
      return assetResponse
    }

    try {
      if (request.method === 'OPTIONS') {
        return withCors(new Response(null, { status: 204 }))
      }

      if (!requireAuth(request, env)) {
        return withCors(json({ error: 'Unauthorized' }, { status: 401 }))
      }

      if (pathname === '/api/accounts' && request.method === 'GET') {
        return withCors(json(await loadAccounts(env)))
      }

      if (pathname === '/api/accounts' && request.method === 'POST') {
        return withCors(await handleAddAccount(request, env))
      }

      if (pathname === '/api/accounts' && request.method === 'DELETE') {
        const body = (await parseBody(request)) as { ids?: string[] }
        if (!body.ids?.length) {
          return withCors(json({ error: '缺少 ids' }, { status: 400 }))
        }
        return withCors(await handleDeleteAccounts(env, body.ids))
      }

      if (pathname === '/api/accounts/export' && request.method === 'POST') {
        const body = (await parseBody(request)) as { ids?: string[] }
        const accounts = await loadAccounts(env)
        if (body.ids?.length) {
          return withCors(json(accounts.filter((item) => body.ids?.includes(item.id))))
        }
        return withCors(json(accounts))
      }

      const accountMatch = pathname.match(
        /^\/api\/accounts\/([^/]+)(?:\/(refresh|sync))?$/
      )
      if (accountMatch) {
        const [, id, action] = accountMatch
        if (request.method === 'DELETE') {
          return withCors(await handleDeleteAccounts(env, [id]))
        }
        if (request.method === 'PATCH' && action === 'refresh') {
          return withCors(await handleRefresh(env, id, false))
        }
        if (request.method === 'PATCH' && action === 'sync') {
          return withCors(await handleRefresh(env, id, true))
        }
        if (request.method === 'PATCH' && !action) {
          const body = (await parseBody(request)) as Partial<Account>
          return withCors(await handleUpdateAccount(env, id, body))
        }
      }

      return withCors(new Response('Not Found', { status: 404 }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Server error'
      return withCors(json({ error: message }, { status: 500 }))
    }
  },
}
