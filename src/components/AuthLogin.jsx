import { useState } from 'react'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'

function AuthLogin({ onSuccess }) {
  const { theme, colors } = useTheme()
  const isDark = theme === 'dark'
  const [token, setToken] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!token.trim()) {
      setError('请输入访问密钥')
      return
    }
    localStorage.setItem('authToken', token.trim())
    setError('')
    onSuccess?.()
  }

  return (
    <div className={`min-h-screen flex items-center justify-center ${colors.main} p-6`}>
      <div className={`w-full max-w-md ${colors.card} border ${colors.cardBorder} rounded-2xl shadow-xl p-6`}>
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isDark ? 'bg-blue-500/20' : 'bg-blue-50'}`}>
            <ShieldCheck size={22} className="text-blue-500" />
          </div>
          <div>
            <h1 className={`text-lg font-semibold ${colors.text}`}>安全访问</h1>
            <p className={`text-sm ${colors.textMuted}`}>请输入部署时设置的访问密钥</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={`block text-sm font-medium ${colors.textMuted} mb-2`}>访问密钥</label>
            <div className="relative">
              <KeyRound size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${colors.textMuted}`} />
              <input
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                className={`w-full pl-9 pr-3 py-2 rounded-xl border ${colors.cardBorder} ${isDark ? 'bg-white/5' : 'bg-white'} ${colors.text} focus:outline-none focus:ring-2 focus:ring-blue-500/30`}
                placeholder="输入密钥"
              />
            </div>
          </div>

          {error && (
            <div className={`text-sm ${isDark ? 'text-red-400' : 'text-red-600'}`}>{error}</div>
          )}

          <button
            type="submit"
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-medium shadow-lg shadow-blue-500/25 hover:from-blue-600 hover:to-purple-600 transition-all"
          >
            进入系统
          </button>
        </form>
      </div>
    </div>
  )
}

export default AuthLogin
