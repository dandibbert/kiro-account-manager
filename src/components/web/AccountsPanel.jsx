import { useMemo, useState } from 'react'
import { deleteAccount, exportAccounts, refreshAccount } from '../../api/workerClient'
import { getQuota, getUsed, getSubPlan, getSubType } from '../../utils/accountStats'

export default function AccountsPanel({ accounts, onReload }) {
  const [expandedId, setExpandedId] = useState(null)
  const [workingId, setWorkingId] = useState(null)

  const summary = useMemo(() => {
    const total = accounts.length
    const used = accounts.reduce((sum, account) => sum + getUsed(account), 0)
    const quota = accounts.reduce((sum, account) => sum + getQuota(account), 0)
    return { total, used, quota }
  }, [accounts])

  const handleRefresh = async (accountId) => {
    setWorkingId(accountId)
    try {
      await refreshAccount(accountId)
      await onReload?.()
    } finally {
      setWorkingId(null)
    }
  }

  const handleDelete = async (accountId) => {
    setWorkingId(accountId)
    try {
      await deleteAccount(accountId)
      await onReload?.()
    } finally {
      setWorkingId(null)
    }
  }

  const handleCopy = async (value) => {
    if (!value) return
    await navigator.clipboard.writeText(value)
  }

  const handleExport = async () => {
    const result = await exportAccounts()
    const blob = new Blob([JSON.stringify(result.accounts || [], null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'kiro-accounts.json'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  if (accounts.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
        还没有账号信息，先完成一次 Web OAuth 登录吧。
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div>
          <p className="text-sm text-slate-500">账号汇总</p>
          <p className="text-lg font-semibold text-slate-900">
            {summary.total} 个账号 · 已用 {summary.used} / {summary.quota}
          </p>
        </div>
        <button
          onClick={handleExport}
          className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          导出 JSON
        </button>
      </div>

      {accounts.map((account) => {
        const used = getUsed(account)
        const quota = getQuota(account)
        const percent = quota ? Math.min(100, Math.round((used / quota) * 100)) : 0
        const subscription = getSubPlan(account) || getSubType(account) || '未识别'
        const expanded = expandedId === account.id

        return (
          <article key={account.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm text-slate-500">{account.provider} · {subscription}</p>
                <h3 className="text-lg font-semibold text-slate-900">{account.email}</h3>
                <p className="mt-1 text-xs text-slate-500">
                  状态：{account.status || '正常'} · 过期时间：{account.expiresAt || '未知'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleRefresh(account.id)}
                  disabled={workingId === account.id}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  刷新 Token
                </button>
                <button
                  onClick={() => setExpandedId(expanded ? null : account.id)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  {expanded ? '收起凭证' : '查看凭证'}
                </button>
                <button
                  onClick={() => handleDelete(account.id)}
                  disabled={workingId === account.id}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                >
                  删除
                </button>
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>用量 {used} / {quota}</span>
                <span>{percent}%</span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-blue-600" style={{ width: `${percent}%` }} />
              </div>
            </div>

            {expanded && (
              <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-4 text-xs text-slate-600">
                <CredentialRow
                  label="Access Token"
                  value={account.accessToken}
                  onCopy={handleCopy}
                />
                <CredentialRow
                  label="Refresh Token"
                  value={account.refreshToken}
                  onCopy={handleCopy}
                />
                <CredentialRow
                  label="CSRF Token"
                  value={account.csrfToken}
                  onCopy={handleCopy}
                />
                <CredentialRow
                  label="Profile ARN"
                  value={account.profileArn}
                  onCopy={handleCopy}
                />
                <CredentialRow
                  label="User ID"
                  value={account.userId}
                  onCopy={handleCopy}
                />
              </div>
            )}
          </article>
        )
      })}
    </section>
  )
}

function CredentialRow({ label, value, onCopy }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 py-2 last:border-b-0 last:pb-0">
      <span className="font-medium text-slate-600">{label}</span>
      <div className="flex items-center gap-2">
        <span className="max-w-[280px] truncate text-slate-500">{value || '-'}</span>
        <button
          onClick={() => onCopy?.(value)}
          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
        >
          复制
        </button>
      </div>
    </div>
  )
}
