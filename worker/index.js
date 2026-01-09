import { encode, decode } from 'cbor-x'

const KIRO_WEB_PORTAL = 'https://app.kiro.dev'
const KIRO_REDIRECT_URI = 'https://app.kiro.dev/signin/oauth'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    const url = new URL(request.url)
    try {
      if (request.method === 'POST' && url.pathname === '/api/oauth/initiate') {
        const { provider } = await request.json()
        const result = await initiateOAuth(provider, env)
        return jsonResponse(result)
      }

      if (request.method === 'POST' && url.pathname === '/api/oauth/complete') {
        const { callbackUrl } = await request.json()
        const account = await completeOAuth(callbackUrl, env)
        return jsonResponse({ account })
      }

      if (request.method === 'GET' && url.pathname === '/api/accounts') {
        const accounts = await listAccounts(env)
        return jsonResponse({ accounts })
      }

      if (request.method === 'GET' && url.pathname === '/api/accounts/export') {
        const accounts = await listAccounts(env)
        return jsonResponse({ accounts })
      }

      if (request.method === 'POST' && url.pathname.startsWith('/api/accounts/') && url.pathname.endsWith('/refresh')) {
        const accountId = url.pathname.split('/')[3]
        const account = await refreshAccount(accountId, env)
        return jsonResponse({ account })
      }

      if (request.method === 'DELETE' && url.pathname.startsWith('/api/accounts/')) {
        const accountId = url.pathname.split('/')[3]
        await deleteAccount(accountId, env)
        return jsonResponse({ ok: true })
      }

      return jsonResponse({ error: 'Not found' }, 404)
    } catch (error) {
      return jsonResponse({ error: error.message || 'Unknown error' }, 400)
    }
  },
}

async function initiateOAuth(provider, env) {
  if (!['Google', 'Github'].includes(provider)) {
    throw new Error('Unsupported provider')
  }

  const state = crypto.randomUUID()
  const codeVerifier = createCodeVerifier()
  const codeChallenge = await createCodeChallenge(codeVerifier)
  const idp = provider === 'Github' ? 'Github' : 'Google'

  const response = await cborRequest(
    `${KIRO_WEB_PORTAL}/service/KiroWebPortalService/operation/InitiateLogin`,
    {
      idp,
      redirectUri: KIRO_REDIRECT_URI,
      codeChallenge,
      codeChallengeMethod: 'S256',
      state,
    },
  )

  if (!response.redirectUrl) {
    throw new Error('Missing redirectUrl')
  }

  await env.ACCOUNT_KV.put(
    `oauth:${state}`,
    JSON.stringify({
      provider,
      idp,
      codeVerifier,
      createdAt: new Date().toISOString(),
    }),
    { expirationTtl: 600 },
  )

  return { authorizeUrl: response.redirectUrl, state }
}

async function completeOAuth(callbackUrl, env) {
  const callback = new URL(callbackUrl)
  const code = callback.searchParams.get('code')
  const state = callback.searchParams.get('state')

  if (!code || !state) {
    throw new Error('Missing code or state')
  }

  const pendingRaw = await env.ACCOUNT_KV.get(`oauth:${state}`)
  if (!pendingRaw) {
    throw new Error('Login state expired')
  }

  const pending = JSON.parse(pendingRaw)
  const exchange = await exchangeToken({
    idp: pending.idp,
    code,
    codeVerifier: pending.codeVerifier,
    state,
  })

  const accessToken = exchange.accessToken
  const refreshToken = exchange.refreshToken
  const csrfToken = exchange.csrfToken
  const idp = exchange.idp || pending.idp

  if (!accessToken || !refreshToken || !csrfToken) {
    throw new Error('Missing tokens from OAuth response')
  }

  const [userInfo, usageInfo] = await Promise.all([
    getUserInfo(accessToken, idp),
    getUserUsageAndLimits(accessToken, idp),
  ])

  const email = userInfo.email
  if (!email) {
    throw new Error('Missing email in user info')
  }

  const account = {
    id: crypto.randomUUID(),
    email,
    provider: pending.provider,
    idp,
    userId: userInfo.userId || null,
    accessToken,
    refreshToken,
    csrfToken,
    expiresAt: exchange.expiresAt,
    profileArn: exchange.profileArn || null,
    usageData: usageInfo || null,
    status: userInfo.status || '正常',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  const saved = await upsertAccount(account, env)
  await env.ACCOUNT_KV.delete(`oauth:${state}`)

  return saved
}

async function refreshAccount(accountId, env) {
  const account = await getAccount(accountId, env)
  if (!account) {
    throw new Error('Account not found')
  }

  const refreshResult = await refreshToken({
    accessToken: account.accessToken,
    csrfToken: account.csrfToken,
    refreshToken: account.refreshToken,
    idp: account.idp,
  })

  let usageInfo = null
  try {
    usageInfo = await getUserUsageAndLimits(refreshResult.accessToken, account.idp)
  } catch (error) {
    if (error.message.includes('BANNED')) {
      account.status = '封禁'
    }
  }

  const updated = {
    ...account,
    accessToken: refreshResult.accessToken,
    csrfToken: refreshResult.csrfToken,
    expiresAt: refreshResult.expiresAt,
    usageData: usageInfo || account.usageData,
    status: account.status || '正常',
    updatedAt: new Date().toISOString(),
  }

  await saveAccount(updated, env)
  return updated
}

async function deleteAccount(accountId, env) {
  const list = await getAccountList(env)
  const nextList = list.filter((id) => id !== accountId)
  await saveAccountList(nextList, env)
  await env.ACCOUNT_KV.delete(`account:${accountId}`)
}

async function listAccounts(env) {
  const list = await getAccountList(env)
  const accounts = await Promise.all(list.map((id) => getAccount(id, env)))
  return accounts.filter(Boolean)
}

async function upsertAccount(account, env) {
  const accounts = await listAccounts(env)
  const existing = accounts.find((item) => item.email === account.email)
  if (existing) {
    const updated = {
      ...existing,
      ...account,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    }
    await saveAccount(updated, env)
    return updated
  }

  const list = await getAccountList(env)
  list.unshift(account.id)
  await saveAccountList(list, env)
  await saveAccount(account, env)
  return account
}

async function getAccount(accountId, env) {
  const raw = await env.ACCOUNT_KV.get(`account:${accountId}`)
  return raw ? JSON.parse(raw) : null
}

async function saveAccount(account, env) {
  await env.ACCOUNT_KV.put(`account:${account.id}`, JSON.stringify(account))
}

async function getAccountList(env) {
  const raw = await env.ACCOUNT_KV.get('accounts:list')
  if (!raw) {
    return []
  }
  return JSON.parse(raw)
}

async function saveAccountList(list, env) {
  await env.ACCOUNT_KV.put('accounts:list', JSON.stringify(list))
}

async function exchangeToken({ idp, code, codeVerifier, state }) {
  const response = await fetch(`${KIRO_WEB_PORTAL}/service/KiroWebPortalService/operation/ExchangeToken`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/cbor',
      Accept: 'application/cbor',
      'smithy-protocol': 'rpc-v2-cbor',
    },
    body: encode({
      idp,
      code,
      codeVerifier,
      redirectUri: KIRO_REDIRECT_URI,
      state,
    }),
  })

  const setCookies = getSetCookieHeaders(response.headers)
  const cookieMap = parseSetCookies(setCookies)
  const bytes = new Uint8Array(await response.arrayBuffer())

  if (!response.ok) {
    throw new Error(await parseCborError(bytes, response.status))
  }

  const data = decode(bytes)
  const expiresIn = data.expiresIn || 3600
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

  return {
    accessToken: data.accessToken || cookieMap.AccessToken,
    csrfToken: data.csrfToken,
    refreshToken: cookieMap.RefreshToken,
    idp: cookieMap.Idp,
    profileArn: data.profileArn || null,
    expiresAt,
  }
}

async function refreshToken({ accessToken, csrfToken, refreshToken, idp }) {
  const response = await fetch(`${KIRO_WEB_PORTAL}/service/KiroWebPortalService/operation/RefreshToken`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/cbor',
      Accept: 'application/cbor',
      'smithy-protocol': 'rpc-v2-cbor',
      'x-csrf-token': csrfToken,
      Cookie: `AccessToken=${accessToken}; RefreshToken=${refreshToken}; Idp=${idp}`,
    },
    body: encode({ csrfToken }),
  })

  const bytes = new Uint8Array(await response.arrayBuffer())
  if (!response.ok) {
    const errorMessage = await parseCborError(bytes, response.status)
    if (response.status === 423 || errorMessage.includes('AccountSuspendedException')) {
      throw new Error('BANNED')
    }
    throw new Error(errorMessage)
  }

  const data = decode(bytes)
  const expiresIn = data.expiresIn || 3600
  return {
    accessToken: data.accessToken,
    csrfToken: data.csrfToken,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
  }
}

async function getUserInfo(accessToken, idp) {
  return cborRequest(
    `${KIRO_WEB_PORTAL}/service/KiroWebPortalService/operation/GetUserInfo`,
    { origin: 'KIRO_IDE' },
    {
      authorization: `Bearer ${accessToken}`,
      Cookie: `Idp=${idp}; AccessToken=${accessToken}`,
    },
  )
}

async function getUserUsageAndLimits(accessToken, idp) {
  return cborRequest(
    `${KIRO_WEB_PORTAL}/service/KiroWebPortalService/operation/GetUserUsageAndLimits`,
    { origin: 'KIRO_IDE', isEmailRequired: true },
    {
      authorization: `Bearer ${accessToken}`,
      Cookie: `Idp=${idp}; AccessToken=${accessToken}`,
    },
  )
}

async function cborRequest(url, payload, extraHeaders = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/cbor',
      Accept: 'application/cbor',
      'smithy-protocol': 'rpc-v2-cbor',
      ...extraHeaders,
    },
    body: encode(payload),
  })

  const bytes = new Uint8Array(await response.arrayBuffer())
  if (!response.ok) {
    const errorMessage = await parseCborError(bytes, response.status)
    if (response.status === 423 || errorMessage.includes('AccountSuspendedException')) {
      throw new Error('BANNED')
    }
    throw new Error(errorMessage)
  }

  return decode(bytes)
}

async function parseCborError(bytes, status) {
  try {
    const decoded = decode(bytes)
    return typeof decoded === 'string' ? decoded : JSON.stringify(decoded)
  } catch (error) {
    return `Request failed (${status})`
  }
}

function getSetCookieHeaders(headers) {
  if (typeof headers.getAll === 'function') {
    return headers.getAll('set-cookie') || []
  }
  const single = headers.get('set-cookie')
  return single ? [single] : []
}

function parseSetCookies(setCookies) {
  const values = {}
  for (const cookie of setCookies) {
    const [pair] = cookie.split(';')
    const separatorIndex = pair.indexOf('=')
    if (separatorIndex === -1) {
      continue
    }
    const name = pair.slice(0, separatorIndex).trim()
    const value = pair.slice(separatorIndex + 1).trim()
    values[name] = value
  }
  return values
}

function createCodeVerifier() {
  const buffer = new Uint8Array(32)
  crypto.getRandomValues(buffer)
  return base64UrlEncode(buffer)
}

async function createCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return base64UrlEncode(new Uint8Array(digest))
}

function base64UrlEncode(buffer) {
  const base64 = btoa(String.fromCharCode(...buffer))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}
