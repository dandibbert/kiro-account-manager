const API_BASE = import.meta.env.VITE_API_BASE || '/api'

function getAuthHeaders() {
  const token = localStorage.getItem('authToken')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...(options.headers || {}),
    },
    ...options,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || `Request failed: ${response.status}`)
  }

  if (response.status === 204) return null
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return response.json()
  }
  return response.text()
}

export function listAccounts() {
  return apiRequest('/accounts')
}

export function addAccountBySocial(refreshToken, provider) {
  return apiRequest('/accounts', {
    method: 'POST',
    body: JSON.stringify({ refreshToken, provider }),
  })
}

export function deleteAccount(id) {
  return apiRequest(`/accounts/${id}`, { method: 'DELETE' })
}

export function deleteAccounts(ids) {
  return apiRequest('/accounts', {
    method: 'DELETE',
    body: JSON.stringify({ ids }),
  })
}

export function refreshAccountToken(id) {
  return apiRequest(`/accounts/${id}/refresh`, { method: 'PATCH' })
}

export function syncAccount(id) {
  return apiRequest(`/accounts/${id}/sync`, { method: 'PATCH' })
}

export function updateAccount(id, updates) {
  return apiRequest(`/accounts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
}

export function exportAccounts(ids) {
  return apiRequest('/accounts/export', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  })
}
