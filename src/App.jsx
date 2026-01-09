import { useState, useEffect, useRef } from 'react'
import Sidebar from './components/Sidebar'
import Home from './components/Home'
import AccountManager from './components/AccountManager/index'
import About from './components/About'
import { listAccounts, refreshAccountToken } from './api/kiroApi'
import AuthLogin from './components/AuthLogin'

import { useTheme } from './contexts/ThemeContext'

// 默认自动刷新间隔：50分钟
const DEFAULT_REFRESH_INTERVAL = 50 * 60 * 1000

function App() {
  const [loading, setLoading] = useState(true)
  const [activeMenu, setActiveMenu] = useState('home')
  const [isAuthed, setIsAuthed] = useState(() => Boolean(localStorage.getItem('authToken')))
  const { colors } = useTheme()
  const refreshTimerRef = useRef(null)

  // 启动时只刷新 token（不获取 usage，快速启动）
  const refreshExpiredTokensOnly = async () => {
    try {
      const accounts = await listAccounts()
      if (!accounts || accounts.length === 0) return
      
      const now = new Date()
      const refreshThreshold = 5 * 60 * 1000 // 提前 5 分钟
      
      const expiredAccounts = accounts.filter(acc => {
        // 跳过已封禁账号
        if (acc.status === '已封禁' || acc.status === '封禁') return false
        if (!acc.expiresAt) return false
        const expiresAt = new Date(acc.expiresAt.replace(/\//g, '-'))
        return (expiresAt.getTime() - now.getTime()) < refreshThreshold
      })
      
      if (expiredAccounts.length === 0) {
        console.log('[AutoRefresh] 没有需要刷新的 token')
        return
      }
      
      console.log(`[AutoRefresh] 刷新 ${expiredAccounts.length} 个过期 token...`)
      
      // 并发刷新
      await Promise.allSettled(
        expiredAccounts.map(async (account) => {
          try {
            await refreshAccountToken(account.id)
            console.log(`[AutoRefresh] ${account.email} token 刷新成功`)
          } catch (e) {
            console.warn(`[AutoRefresh] ${account.email} token 刷新失败:`, e)
          }
        })
      )
      
      console.log('[AutoRefresh] token 刷新完成')
    } catch (e) {
      console.error('[AutoRefresh] 刷新失败:', e)
    }
  }

  // 定时刷新：只刷新 token
  const checkAndRefreshExpiringTokens = async () => {
    try {
      const accounts = await listAccounts()
      if (!accounts || accounts.length === 0) return
      
      const now = new Date()
      const refreshThreshold = 5 * 60 * 1000
      
      const expiredAccounts = accounts.filter(acc => {
        // 跳过已封禁账号
        if (acc.status === '已封禁' || acc.status === '封禁') return false
        if (!acc.expiresAt) return false
        const expiresAt = new Date(acc.expiresAt.replace(/\//g, '-'))
        return (expiresAt.getTime() - now.getTime()) < refreshThreshold
      })
      
      if (expiredAccounts.length === 0) {
        console.log('[AutoRefresh] 没有需要刷新的 token')
        return
      }
      
      console.log(`[AutoRefresh] 刷新 ${expiredAccounts.length} 个 token...`)
      
      await Promise.allSettled(
        expiredAccounts.map(async (account) => {
          try {
            await refreshAccountToken(account.id)
            console.log(`[AutoRefresh] ${account.email} token 刷新成功`)
          } catch (e) {
            console.warn(`[AutoRefresh] ${account.email} token 刷新失败:`, e)
          }
        })
      )
      
      console.log('[AutoRefresh] token 刷新完成')
    } catch (e) {
      console.error('[AutoRefresh] 刷新失败:', e)
    }
  }

  // 启动自动刷新定时器
  const startAutoRefreshTimer = async () => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current)
    }
    
    // 启动时只刷新 token（快速启动）
    refreshExpiredTokensOnly()
    
    console.log('[AutoRefresh] 定时器间隔: 50 分钟')
    refreshTimerRef.current = setInterval(checkAndRefreshExpiringTokens, DEFAULT_REFRESH_INTERVAL)
  }

  useEffect(() => {
    setLoading(false)
    
    return () => { 
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!isAuthed) {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current)
      }
      return
    }
    startAutoRefreshTimer()
  }, [isAuthed])

  const handleLogout = () => {
    localStorage.removeItem('authToken')
    setIsAuthed(false)
  }

  const renderContent = () => {
    switch (activeMenu) {
      case 'home': return <Home onNavigate={setActiveMenu} />
      case 'token': return <AccountManager />
      case 'about': return <About />
      default: return <Home />
    }
  }

  if (loading) {
    return (
      <div className="h-screen bg-[#0d0d0d] flex items-center justify-center">
        <div className="text-white">加载中...</div>
      </div>
    )
  }

  if (!isAuthed) {
    return <AuthLogin onSuccess={() => setIsAuthed(true)} />
  }

  return (
    <div className={`flex h-screen ${colors.main}`}>
      <Sidebar 
        activeMenu={activeMenu} 
        onMenuChange={setActiveMenu}
        onLogout={handleLogout}
      />
      <main className="flex-1 overflow-hidden">
        {renderContent()}
      </main>
    </div>
  )
}

export default App
