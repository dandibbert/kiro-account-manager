import { useState, useEffect, useCallback } from 'react'
import {
  listAccounts,
  refreshAccountToken,
  syncAccount,
  exportAccounts,
} from '../../../api/kiroApi'

export function useAccounts() {
  const [accounts, setAccounts] = useState([])
  const [autoRefreshing, setAutoRefreshing] = useState(false)
  const [refreshProgress, setRefreshProgress] = useState({ current: 0, total: 0, currentEmail: '', results: [] })
  const [lastRefreshTime, setLastRefreshTime] = useState(null)
  const [refreshingId, setRefreshingId] = useState(null)

  const isExpiringSoon = useCallback((account) => {
    if (!account.expiresAt) return true
    const expiresAt = new Date(account.expiresAt.replace(/\//g, '-'))
    return expiresAt.getTime() - Date.now() < 5 * 60 * 1000
  }, [])

  const loadAccounts = useCallback(async () => {
    try {
      setAccounts(await listAccounts())
    } catch (e) {
      console.error(e)
    }
  }, [])

  const autoRefreshAll = useCallback(async (accountList, forceAll = false) => {
    if (autoRefreshing || accountList.length === 0) return
    const accountsToRefresh = forceAll ? accountList : accountList.filter(isExpiringSoon)
    if (accountsToRefresh.length === 0) return

    setAutoRefreshing(true)
    setRefreshProgress({ current: 0, total: accountsToRefresh.length, currentEmail: '', results: [] })

    const updatedAccounts = [...accountList]
    const results = []

    for (let i = 0; i < accountsToRefresh.length; i++) {
      const account = accountsToRefresh[i]
      setRefreshProgress(prev => ({ ...prev, currentEmail: account.email }))
      let success = false, message = ''
      try {
        // 只刷新 token，不获取 usage
        const updated = await refreshAccountToken(account.id)
        const idx = updatedAccounts.findIndex(a => a.id === account.id)
        if (idx !== -1) updatedAccounts[idx] = updated
        success = true
        message = 'Token 已刷新'
      } catch (e) {
        message = String(e).slice(0, 30)
      }
      results.push({ email: account.email, success, message })
      setRefreshProgress({ current: i + 1, total: accountsToRefresh.length, currentEmail: '', results: [...results] })
      if (i < accountsToRefresh.length - 1) await new Promise(r => setTimeout(r, 500))
    }

    setAccounts(updatedAccounts)
    setLastRefreshTime(new Date().toLocaleTimeString())
    setTimeout(() => {
      setAutoRefreshing(false)
      setRefreshProgress({ current: 0, total: 0, currentEmail: '', results: [] })
    }, 1500)
  }, [autoRefreshing, isExpiringSoon])


  const handleRefreshStatus = useCallback(async (id) => {
    setRefreshingId(id)
    try {
      const updated = await syncAccount(id)
      setAccounts(prev => prev.map(a => a.id === id ? updated : a))
      return { success: true }
    } catch (e) {
      console.warn(e)
      // 更新账号状态为错误信息
      const errorMsg = String(e)
      setAccounts(prev => prev.map(a => a.id === id ? { ...a, status: errorMsg.includes('401') || errorMsg.includes('过期') ? 'Token已失效' : '刷新失败' } : a))
      return { success: false, error: errorMsg }
    } finally {
      setRefreshingId(null)
    }
  }, [])

  const handleExport = useCallback(async (selectedIds = []) => {
    try {
      const data = await exportAccounts(selectedIds.length > 0 ? selectedIds : null)
      const json = JSON.stringify(data, null, 2)
      const suffix = selectedIds.length > 0 ? `-${selectedIds.length}` : ''
      const defaultName = `kiro-accounts${suffix}-${new Date().toISOString().slice(0, 10)}.json`
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = defaultName
      link.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('导出失败:', e)
    }
  }, [])

  // 注意：handleDelete, handleBatchDelete, handleSwitchAccount 已移动到 AccountManager/index.jsx 中
  // 使用 useDialog 的 showConfirm 实现自定义弹窗
  // 这里只保留 setSwitchingId 供组件使用

  // 初始化和事件监听
  useEffect(() => {
    loadAccounts()

    const interval = setInterval(async () => {
      if (document.hidden) return
      const data = await listAccounts()
      if (data.length > 0) autoRefreshAll(data)
    }, 5 * 60 * 1000)

    return () => {
      clearInterval(interval)
    }
  }, [loadAccounts, autoRefreshAll])

  return {
    accounts,
    loadAccounts,
    autoRefreshing,
    refreshProgress,
    lastRefreshTime,
    refreshingId,
    autoRefreshAll,
    handleRefreshStatus,
    handleExport,
  }
}
