const API_BASE = import.meta.env.VITE_API_BASE || ''

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || 'Request failed')
  }
  return data
}

export function initiateOAuth(provider) {
  return request('/api/oauth/initiate', {
    method: 'POST',
    body: JSON.stringify({ provider }),
  })
}

export function completeOAuth(callbackUrl) {
  return request('/api/oauth/complete', {
    method: 'POST',
    body: JSON.stringify({ callbackUrl }),
  })
}

export function listAccounts() {
  return request('/api/accounts')
}

export function refreshAccount(accountId) {
  return request(`/api/accounts/${accountId}/refresh`, { method: 'POST' })
}

export function deleteAccount(accountId) {
  return request(`/api/accounts/${accountId}`, { method: 'DELETE' })
}

export function exportAccounts() {
  return request('/api/accounts/export')
}
