import { useEffect, useState } from 'react'
import { listAccounts } from './api/workerClient'
import AccountsPanel from './components/web/AccountsPanel'
import LoginPanel from './components/web/LoginPanel'

function App() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadAccounts = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await listAccounts()
      setAccounts(result.accounts || [])
    } catch (err) {
      setError(err.message || '加载账号失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAccounts()
  }, [])

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Kiro 账号在线管理</h1>
            <p className="mt-1 text-sm text-slate-500">
              Cloudflare Workers + KV 版，支持登录、凭证管理、刷新 Token 与用量导出。
            </p>
          </div>
          <button
            onClick={loadAccounts}
            className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            刷新列表
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-6">
        <LoginPanel onLogin={loadAccounts} />
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}
        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            正在加载账号信息...
          </div>
        ) : (
          <AccountsPanel accounts={accounts} onReload={loadAccounts} />
        )}
      </main>
    </div>
  )
}

export default App
