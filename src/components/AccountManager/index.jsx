import { useState, useCallback, useMemo } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import { useDialog } from '../../contexts/DialogContext'
import { useI18n } from '../../i18n'
import { useAccounts } from './hooks/useAccounts'
import AccountHeader from './AccountHeader'
import AccountTable from './AccountTable'
import AccountPagination from './AccountPagination'
import AddAccountModal from './AddAccountModal'
import RefreshProgressModal from './RefreshProgressModal'
import AccountDetailModal from '../AccountDetailModal'
import EditAccountModal from './EditAccountModal'
import { deleteAccount, deleteAccounts } from '../../api/kiroApi'

function AccountManager() {
  const { colors } = useTheme()
  const { showConfirm } = useDialog()
  const { t } = useI18n()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [pageSize, setPageSize] = useState(20)
  const [currentPage, setCurrentPage] = useState(1)
  const [editingAccount, setEditingAccount] = useState(null)
  const [editingLabelAccount, setEditingLabelAccount] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [copiedId, setCopiedId] = useState(null)
  
  const {
    accounts,
    loadAccounts,
    autoRefreshing,
    refreshProgress,
    lastRefreshTime,
    refreshingId,
    autoRefreshAll,
    handleRefreshStatus,
    handleExport,
  } = useAccounts()

  const filteredAccounts = useMemo(() =>
    accounts.filter(a =>
      a.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.label.toLowerCase().includes(searchTerm.toLowerCase())
    ),
    [accounts, searchTerm]
  )

  const totalPages = Math.ceil(filteredAccounts.length / pageSize) || 1
  const paginatedAccounts = useMemo(() =>
    filteredAccounts.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredAccounts, currentPage, pageSize]
  )

  const handleSearchChange = useCallback((term) => { setSearchTerm(term); setCurrentPage(1) }, [])
  const handlePageSizeChange = useCallback((size) => { setPageSize(size); setCurrentPage(1) }, [])
  const handleSelectAll = useCallback((checked) => { setSelectedIds(checked ? filteredAccounts.map(a => a.id) : []) }, [filteredAccounts])
  const handleSelectOne = useCallback((id, checked) => { setSelectedIds(prev => checked ? [...prev, id] : prev.filter(i => i !== id)) }, [])
  const handleCopy = useCallback((text, id) => { navigator.clipboard.writeText(text); setCopiedId(id); setTimeout(() => setCopiedId(null), 1500) }, [])
  
  // 删除单个账号
  const handleDelete = useCallback(async (id) => {
    const confirmed = await showConfirm(t('accounts.delete'), t('accounts.confirmDelete'))
    if (confirmed) {
      await deleteAccount(id)
      loadAccounts()
    }
  }, [showConfirm, loadAccounts, t])

  // 批量删除
  const onBatchDelete = useCallback(async () => {
    if (selectedIds.length === 0) return
    const confirmed = await showConfirm(t('accounts.batchDelete'), t('accounts.confirmDeleteMultiple', { count: selectedIds.length }))
    if (confirmed) {
      await deleteAccounts(selectedIds)
      setSelectedIds([])
      loadAccounts()
    }
  }, [selectedIds, showConfirm, loadAccounts, t])

  return (
    <div className={`h-full flex flex-col ${colors.main}`}>
      <AccountHeader
        searchTerm={searchTerm}
        onSearchChange={handleSearchChange}
        selectedCount={selectedIds.length}
        onBatchDelete={onBatchDelete}
        onAdd={() => setShowAddModal(true)}
        onExport={() => handleExport(selectedIds)}
        onRefreshAll={() => autoRefreshAll(accounts, true)}
        autoRefreshing={autoRefreshing}
        lastRefreshTime={lastRefreshTime}
        refreshProgress={refreshProgress}
      />
      <div className="flex-1 overflow-auto">
      <AccountTable
        accounts={paginatedAccounts}
        filteredAccounts={filteredAccounts}
        selectedIds={selectedIds}
        onSelectAll={handleSelectAll}
        onSelectOne={handleSelectOne}
        copiedId={copiedId}
        onCopy={handleCopy}
        onRefresh={handleRefreshStatus}
        onEdit={setEditingAccount}
        onEditLabel={setEditingLabelAccount}
        onDelete={handleDelete}
        onAdd={() => setShowAddModal(true)}
        refreshingId={refreshingId}
      />
      </div>
      <div className="animate-slide-in-right delay-200">
      <AccountPagination
        totalCount={filteredAccounts.length}
        pageSize={pageSize}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageSizeChange={handlePageSizeChange}
        onPageChange={setCurrentPage}
      />
      </div>
      {editingAccount && (
        <AccountDetailModal
          account={editingAccount}
          onClose={() => { setEditingAccount(null); loadAccounts() }}
        />
      )}
      {showAddModal && (<AddAccountModal onClose={() => setShowAddModal(false)} onSuccess={loadAccounts} />)}
      {editingLabelAccount && (<EditAccountModal account={editingLabelAccount} onClose={() => setEditingLabelAccount(null)} onSuccess={loadAccounts} />)}
      {autoRefreshing && (<RefreshProgressModal refreshProgress={refreshProgress} />)}
    </div>
  )
}

export default AccountManager
