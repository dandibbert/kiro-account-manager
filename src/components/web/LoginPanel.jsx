import { useState } from 'react'
import { completeOAuth, initiateOAuth } from '../../api/workerClient'

const providers = [
  { id: 'Google', label: 'Google' },
  { id: 'Github', label: 'GitHub' },
]

export default function LoginPanel({ onLogin }) {
  const [loading, setLoading] = useState(false)
  const [authorizeUrl, setAuthorizeUrl] = useState('')
  const [callbackUrl, setCallbackUrl] = useState('')
  const [error, setError] = useState('')
  const [provider, setProvider] = useState('')

  const handleInitiate = async (nextProvider) => {
    setLoading(true)
    setError('')
    setProvider(nextProvider)
    try {
      const result = await initiateOAuth(nextProvider)
      setAuthorizeUrl(result.authorizeUrl)
    } catch (err) {
      setError(err.message || '登录初始化失败')
    } finally {
      setLoading(false)
    }
  }

  const handleComplete = async () => {
    if (!callbackUrl.trim()) {
      setError('请粘贴回调链接')
      return
    }
    setLoading(true)
    setError('')
    try {
      await completeOAuth(callbackUrl.trim())
      setCallbackUrl('')
      setAuthorizeUrl('')
      setProvider('')
      onLogin?.()
    } catch (err) {
      setError(err.message || '登录完成失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Kiro Web OAuth 登录</h2>
      <p className="mt-2 text-sm text-slate-500">
        选择登录渠道后会生成授权链接，完成授权后复制浏览器地址栏回调链接并粘贴回来。
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        {providers.map((item) => (
          <button
            key={item.id}
            onClick={() => handleInitiate(item.id)}
            disabled={loading}
            className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            使用 {item.label} 登录
          </button>
        ))}
      </div>

      {authorizeUrl && (
        <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-700">
          <div className="flex flex-wrap items-center gap-2">
            <span>授权链接已生成：</span>
            <a
              href={authorizeUrl}
              target="_blank"
              rel="noreferrer"
              className="font-medium underline"
            >
              打开授权页面
            </a>
          </div>
          <p className="mt-2 text-xs text-blue-600">
            登录完成后，浏览器会跳转到 app.kiro.dev 的回调地址，请复制完整 URL 粘贴到下面输入框。
          </p>
        </div>
      )}

      <div className="mt-4 space-y-3">
        <label className="block text-sm font-medium text-slate-700">
          回调链接
        </label>
        <textarea
          value={callbackUrl}
          onChange={(event) => setCallbackUrl(event.target.value)}
          placeholder="https://app.kiro.dev/signin/oauth?code=...&state=..."
          rows={3}
          className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
        <button
          onClick={handleComplete}
          disabled={loading || !authorizeUrl}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
        >
          {loading && provider ? '处理中...' : '完成登录'}
        </button>
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-600">{error}</p>
      )}
    </section>
  )
}
