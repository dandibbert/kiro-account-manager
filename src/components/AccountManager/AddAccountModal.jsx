import { useState } from 'react'
import { X, Key } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { useI18n } from '../../i18n.jsx'
import { addAccountBySocial } from '../../api/kiroApi'

function AddAccountModal({ onClose, onSuccess }) {
  const { theme, colors } = useTheme()
  const { t } = useI18n()
  const isDark = theme === 'dark'
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState('')
  const [refreshToken, setRefreshToken] = useState('')

  const handleAddManual = async () => {
    if (!refreshToken) {
      setAddError(t('addAccount.errorNoToken'))
      return
    }
    
    // 校验 token 格式（所有 refreshToken 都以 aor 开头）
    if (!refreshToken.startsWith('aor')) {
      setAddError(t('addAccount.errorSocialFormat'))
      return
    }
    
    setAddLoading(true)
    setAddError('')
    try {
      await addAccountBySocial(refreshToken)
      onSuccess()
      onClose()
    } catch (e) {
      setAddError(e.toString())
    } finally {
      setAddLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className={`${colors.card} rounded-2xl w-full max-w-[420px] shadow-2xl border ${colors.cardBorder} overflow-hidden`} 
        onClick={e => e.stopPropagation()}
        style={{ animation: 'dialogIn 0.2s ease-out' }}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 ${isDark ? 'bg-white/[0.02]' : 'bg-gray-50/50'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${isDark ? 'bg-blue-500/15' : 'bg-blue-50'} flex items-center justify-center`}>
              <Key size={20} className="text-blue-500" />
            </div>
            <h2 className={`text-base font-semibold ${colors.text}`}>{t('addAccount.title')}</h2>
          </div>
          <button onClick={onClose} className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}>
            <X size={18} className={colors.textMuted} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* 表单 */}
          <div className="space-y-3">
            <div>
              <label className={`block text-xs font-medium ${colors.textMuted} mb-1.5`}>{t('addAccount.refreshToken')}</label>
              <input 
                type="text" 
                placeholder={t('addAccount.socialPlaceholder')} 
                value={refreshToken} 
                onChange={(e) => setRefreshToken(e.target.value)} 
                className={`w-full px-4 py-3 border rounded-xl text-sm ${colors.text} ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'} focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all`} 
              />
            </div>

            <button 
              onClick={handleAddManual} 
              disabled={addLoading || !refreshToken} 
              className="w-full px-4 py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-xl text-sm font-medium shadow-lg shadow-blue-500/25 hover:from-blue-600 hover:to-purple-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
            >
              {addLoading ? t('addAccount.verifying') : t('addAccount.add')}
            </button>
          </div>

          {/* Error */}
          {addError && (
            <div className={`text-sm text-red-500 ${isDark ? 'bg-red-500/10 border-red-500/20' : 'bg-red-50 border-red-200'} border px-4 py-3 rounded-xl`}>
              {addError}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes dialogIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(-10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>
  )
}

export default AddAccountModal
