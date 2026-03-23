'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Plus,
  Trash2,
  X,
  Terminal,
  Info,
  Share2,
  Copy,
  Check,
  Link2,
  Loader2,
  ExternalLink,
  Box,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Package,
  PlusCircle,
  MinusCircle,
  ArrowUpFromLine,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { useApprovalRules, type ApprovalAction, type MatchType } from '@/hooks/use-approval-rules'
import { swarmSessionsApi, type SessionShareResponse } from '@/lib/api/swarm-sessions'
import { ShareDialog } from '@/components/session/ShareDialog'

interface SessionSettingsProps {
  sessionId: string
}

const RISK_LEVEL_OPTIONS = [
  { value: 'low', label: '低风险', icon: ShieldCheck, colorClass: 'text-emerald-600 dark:text-emerald-400' },
  { value: 'medium', label: '中风险', icon: Shield, colorClass: 'text-cyan-600 dark:text-cyan-400' },
  { value: 'high', label: '高风险', icon: ShieldAlert, colorClass: 'text-amber-600 dark:text-amber-400' },
]

const ACTION_OPTIONS: Array<{ value: ApprovalAction; label: string; description: string; colorClass: string }> = [
  { value: 'auto_approve', label: '自动放行', description: '跳过审批直接执行', colorClass: 'text-emerald-600' },
  { value: 'require_approval', label: '需要审批', description: '每次都需要用户确认', colorClass: 'text-cyan-600' },
  { value: 'always_reject', label: '总是拒绝', description: '自动拒绝该类命令', colorClass: 'text-red-600' },
]

const MATCH_TYPE_OPTIONS: Array<{ value: MatchType; label: string; placeholder: string }> = [
  { value: 'category', label: '命令类别', placeholder: '如 file_read, package_manager, network' },
  { value: 'prefix', label: '命令前缀', placeholder: '如 npm, git, curl' },
  { value: 'risk_level', label: '风险等级', placeholder: '选择风险等级' },
  { value: 'regex', label: '正则表达式', placeholder: '如 ^npm\\s+install' },
]

const CATEGORY_PRESETS = [
  { value: 'info_query', label: '信息查询 (ls, cat, pwd...)' },
  { value: 'git_read', label: 'Git 只读 (status, log, diff...)' },
  { value: 'git_write', label: 'Git 写入 (add, commit...)' },
  { value: 'package_manager', label: '包管理器 (npm, pip...)' },
  { value: 'file_create', label: '文件创建 (mkdir, touch...)' },
  { value: 'file_copy', label: '文件复制 (cp)' },
  { value: 'file_delete', label: '文件删除 (rm)' },
  { value: 'file_move', label: '文件移动 (mv)' },
  { value: 'file_write', label: '文件覆盖重定向 (>)' },
  { value: 'network', label: '网络请求 (curl, wget)' },
  { value: 'script_exec', label: '脚本执行 (node, python...)' },
  { value: 'docker', label: 'Docker 操作' },
  { value: 'process_control', label: '进程控制 (kill...)' },
  { value: 'permission_change', label: '权限变更 (chmod, chown)' },
]

export function SessionSettings({ sessionId }: SessionSettingsProps) {
  const { rules, stats, isLoading, addRule, removeRule, clearAllRules } = useApprovalRules(sessionId)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newMatchType, setNewMatchType] = useState<MatchType>('category')
  const [newMatchValue, setNewMatchValue] = useState('')
  const [newAction, setNewAction] = useState<ApprovalAction>('auto_approve')
  const [newDescription, setNewDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Share management state
  const [shares, setShares] = useState<SessionShareResponse[]>([])
  const [sharesLoading, setSharesLoading] = useState(false)
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [deletingShareId, setDeletingShareId] = useState<string | null>(null)
  const [copiedShareId, setCopiedShareId] = useState<string | null>(null)

  // Virtual environment state
  const [venvStatus, setVenvStatus] = useState<'initializing' | 'ready' | 'error' | null>(null)
  const [isRetryingVenv, setIsRetryingVenv] = useState(false)
  const [packages, setPackages] = useState<Array<{ name: string; version: string }>>([])
  const [packagesLoading, setPackagesLoading] = useState(false)
  const [showPackages, setShowPackages] = useState(false)
  const [packageOp, setPackageOp] = useState<{ action: string; package: string } | null>(null)
  const [newPackage, setNewPackage] = useState('')
  const [showAddPackage, setShowAddPackage] = useState(false)

  const loadVenvStatus = useCallback(async () => {
    try {
      const status = await swarmSessionsApi.getSessionStatus(sessionId)
      setVenvStatus(status.venvStatus)
    } catch { /* ignore */ }
  }, [sessionId])

  // 轮询 venv 状态
  useEffect(() => {
    loadVenvStatus()
    if (venvStatus === 'initializing') {
      const interval = setInterval(loadVenvStatus, 2000)
      return () => clearInterval(interval)
    }
  }, [loadVenvStatus, venvStatus])

  const loadPackages = useCallback(async () => {
    setPackagesLoading(true)
    try {
      const res = await swarmSessionsApi.getVenvPackages(sessionId)
      setPackages(res.packages || [])
    } catch { /* ignore */ }
    finally { setPackagesLoading(false) }
  }, [sessionId])

  // 当 venv 就绪时加载包列表
  useEffect(() => {
    if (venvStatus === 'ready' && showPackages) {
      loadPackages()
    }
  }, [venvStatus, showPackages, loadPackages])

  const handleRetryVenv = async () => {
    setIsRetryingVenv(true)
    try {
      const status = await swarmSessionsApi.retryVenvSetup(sessionId)
      setVenvStatus(status.venvStatus)
    } catch {
      await loadVenvStatus()
    } finally {
      setIsRetryingVenv(false)
    }
  }

  const handlePackageAction = async (action: 'install' | 'uninstall' | 'upgrade', pkg: string) => {
    setPackageOp({ action, package: pkg })
    try {
      await swarmSessionsApi.venvPackageAction(sessionId, action, [pkg])
      await loadPackages()
    } catch { /* ignore */ }
    finally {
      setPackageOp(null)
    }
  }

  const handleAddPackage = async () => {
    if (!newPackage.trim()) return
    setPackageOp({ action: 'install', package: newPackage.trim() })
    setShowAddPackage(false)
    try {
      await swarmSessionsApi.venvPackageAction(sessionId, 'install', [newPackage.trim()])
      setNewPackage('')
      await loadPackages()
    } catch { /* ignore */ }
    finally {
      setPackageOp(null)
    }
  }

  const loadShares = useCallback(async () => {
    setSharesLoading(true)
    try {
      const res = await swarmSessionsApi.listShares(sessionId)
      setShares(res.items)
    } catch { /* ignore */ }
    finally { setSharesLoading(false) }
  }, [sessionId])

  useEffect(() => { loadShares() }, [loadShares])

  const handleDeleteShare = async (shareId: string) => {
    setDeletingShareId(shareId)
    try {
      await swarmSessionsApi.deleteShare(sessionId, shareId)
      setShares(prev => prev.filter(s => s.id !== shareId))
    } catch (err) {
      console.error('删除分享失败:', err)
    } finally {
      setDeletingShareId(null)
    }
  }

  const handleCopyLink = async (token: string, shareId: string) => {
    const url = `${window.location.origin}/share/${token}`
    await navigator.clipboard.writeText(url)
    setCopiedShareId(shareId)
    setTimeout(() => setCopiedShareId(null), 2000)
  }

  const handleAddRule = async () => {
    if (!newMatchValue.trim()) return
    setIsSubmitting(true)

    await addRule({
      matchType: newMatchType,
      matchValue: newMatchValue.trim(),
      action: newAction,
      description: newDescription.trim() || undefined,
    })

    setNewMatchValue('')
    setNewDescription('')
    setShowAddForm(false)
    setIsSubmitting(false)
  }

  const handleRemoveRule = async (ruleId: string) => {
    await removeRule(ruleId)
  }

  const getActionBadge = (action: ApprovalAction) => {
    const opt = ACTION_OPTIONS.find(o => o.value === action)
    if (!opt) return null
    return (
      <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded', opt.colorClass, 'bg-current/5')}>
        {opt.label}
      </span>
    )
  }

  const getMatchTypeLabel = (matchType: MatchType, matchValue: string) => {
    switch (matchType) {
      case 'category': {
        const preset = CATEGORY_PRESETS.find(p => p.value === matchValue)
        return preset ? preset.label : matchValue
      }
      case 'prefix':
        return `命令前缀: ${matchValue}`
      case 'risk_level': {
        const level = RISK_LEVEL_OPTIONS.find(l => l.value === matchValue)
        return level ? `风险等级: ${level.label}` : matchValue
      }
      case 'regex':
        return `正则: ${matchValue}`
      default:
        return matchValue
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* 标题 */}
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            命令审批设置
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            管理本会话的命令自动放行和拦截规则。规则仅在当前会话内有效。
          </p>
        </div>

        {/* 内置规则说明 */}
        <div className="rounded-lg border border-border bg-muted/30 p-4 shadow-sm">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>内置规则：</strong></p>
              <ul className="list-disc list-inside space-y-0.5">
                <li><ShieldCheck className="inline h-3 w-3 text-emerald-500" /> 低风险命令（ls, cat, echo, git status...）自动放行</li>
                <li><Shield className="inline h-3 w-3 text-cyan-500" /> 中风险命令（npm install, curl...）需要审批</li>
                <li><ShieldAlert className="inline h-3 w-3 text-amber-500" /> 高风险命令（rm, chmod, git push...）需要审批 + 警告</li>
                <li><ShieldX className="inline h-3 w-3 text-red-500" /> 危险命令（sudo, rm -rf /...）<strong>强制审批，不可跳过</strong></li>
              </ul>
            </div>
          </div>
        </div>

        {/* 统计 */}
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">
            当前规则: <strong className="text-foreground">{stats.userRules}</strong> 条自定义 + {stats.builtinRules} 条内置
          </span>
          {rules.length > 0 && (
            <button
              onClick={() => clearAllRules()}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              清空自定义规则
            </button>
          )}
        </div>

        {/* 规则列表 */}
        <div className="space-y-2">
          {rules.length === 0 && !isLoading && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              暂无自定义规则。点击下方按钮添加，或在审批卡片上勾选&quot;总是允许&quot;。
            </div>
          )}

          {rules.map((rule) => (
            <div
              key={rule.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 shadow-sm hover:bg-accent/3 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {getActionBadge(rule.action)}
                  <span className="text-sm font-medium truncate">
                    {getMatchTypeLabel(rule.matchType, rule.matchValue)}
                  </span>
                </div>
                {rule.description && (
                  <p className="text-xs text-muted-foreground truncate">{rule.description}</p>
                )}
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                  来源: {rule.source === 'inline' ? '审批卡片' : rule.source === 'user' ? '手动添加' : '内置'}
                </p>
              </div>

              {rule.source !== 'builtin' && (
                <button
                  onClick={() => handleRemoveRule(rule.id)}
                  className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors"
                  title="删除规则"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* 添加规则表单 */}
        {showAddForm ? (
          <div className="rounded-lg border border-border bg-card p-4 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">添加审批规则</h3>
              <button
                onClick={() => setShowAddForm(false)}
                className="p-1 rounded hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* 匹配类型 */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">匹配方式</label>
              <div className="grid grid-cols-2 gap-2">
                {MATCH_TYPE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => { setNewMatchType(opt.value); setNewMatchValue('') }}
                    className={cn(
                      'px-3 py-2 rounded-lg text-xs font-medium border transition-colors text-left',
                      newMatchType === opt.value
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border hover:bg-accent'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 匹配值 */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">匹配值</label>
              {newMatchType === 'category' ? (
                <select
                  value={newMatchValue}
                  onChange={e => setNewMatchValue(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm"
                >
                  <option value="">选择命令类别...</option>
                  {CATEGORY_PRESETS.map(preset => (
                    <option key={preset.value} value={preset.value}>{preset.label}</option>
                  ))}
                </select>
              ) : newMatchType === 'risk_level' ? (
                <select
                  value={newMatchValue}
                  onChange={e => setNewMatchValue(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm"
                >
                  <option value="">选择风险等级...</option>
                  {RISK_LEVEL_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={newMatchValue}
                  onChange={e => setNewMatchValue(e.target.value)}
                  placeholder={MATCH_TYPE_OPTIONS.find(o => o.value === newMatchType)?.placeholder}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm"
                />
              )}
            </div>

            {/* 操作 */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">触发行为</label>
              <div className="space-y-1.5">
                {ACTION_OPTIONS.map(opt => (
                  <label
                    key={opt.value}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors',
                      newAction === opt.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-accent/50'
                    )}
                  >
                    <input
                      type="radio"
                      name="action"
                      value={opt.value}
                      checked={newAction === opt.value}
                      onChange={() => setNewAction(opt.value)}
                      className="h-3.5 w-3.5"
                    />
                    <div>
                      <span className={cn('text-sm font-medium', opt.colorClass)}>{opt.label}</span>
                      <p className="text-xs text-muted-foreground">{opt.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* 描述 */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">备注（可选）</label>
              <input
                type="text"
                value={newDescription}
                onChange={e => setNewDescription(e.target.value)}
                placeholder="规则用途说明"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm"
              />
            </div>

            {/* 提交 */}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 rounded-lg text-sm border border-border hover:bg-accent transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleAddRule}
                disabled={!newMatchValue.trim() || isSubmitting}
                className="px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isSubmitting ? '添加中...' : '添加规则'}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-border hover:bg-accent/5 transition-colors"
          >
            <Plus className="h-4 w-4" />
            添加审批规则
          </button>
        )}

        {/* 分隔线 */}
        <div className="border-t border-border" />

        {/* 虚拟环境设置 */}
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Box className="h-5 w-5" />
            虚拟环境
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Python 虚拟环境状态，包含 Skills 所需的依赖包。
          </p>
        </div>

        {/* 虚拟环境状态卡片 */}
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {venvStatus === null || venvStatus === 'initializing' ? (
                <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
                </div>
              ) : venvStatus === 'ready' ? (
                <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
              ) : venvStatus === 'error' ? (
                <div className="h-8 w-8 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center">
                  <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                </div>
              ) : null}

              <div>
                <p className="text-sm font-medium">
                  {venvStatus === null || venvStatus === 'initializing'
                    ? '初始化中...'
                    : venvStatus === 'ready'
                    ? '就绪'
                    : venvStatus === 'error'
                    ? '初始化失败'
                    : '未知状态'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {venvStatus === null || venvStatus === 'initializing'
                    ? '正在安装 Python 依赖包'
                    : venvStatus === 'ready'
                    ? `${packages.length} 个包已安装`
                    : venvStatus === 'error'
                    ? '请尝试重新初始化'
                    : ''}
                </p>
              </div>
            </div>

            {venvStatus === 'error' && (
              <button
                onClick={handleRetryVenv}
                disabled={isRetryingVenv}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isRetryingVenv ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    重试中...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3.5 w-3.5" />
                    重新初始化
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* 包列表 */}
        {venvStatus === 'ready' && (
          <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
            {/* 包列表头部 */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => setShowPackages(!showPackages)}
              onKeyDown={(e) => e.key === 'Enter' && setShowPackages(!showPackages)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">已安装的包</span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowAddPackage(true)
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter') {
                      setShowAddPackage(true)
                    }
                  }}
                  className="p-1 rounded hover:bg-accent transition-colors cursor-pointer"
                  title="安装新包"
                >
                  <PlusCircle className="h-4 w-4 text-muted-foreground" />
                </span>
                {showPackages ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>

            {/* 包列表内容 */}
            {showPackages && (
              <div className="border-t border-border">
                {/* 添加包输入 */}
                {showAddPackage && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-muted/30 border-b border-border">
                    <input
                      type="text"
                      value={newPackage}
                      onChange={(e) => setNewPackage(e.target.value)}
                      placeholder="输入包名，如 requests"
                      className="flex-1 rounded border border-border bg-background px-2 py-1 text-sm"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddPackage()
                        if (e.key === 'Escape') setShowAddPackage(false)
                      }}
                    />
                    <button
                      onClick={handleAddPackage}
                      disabled={!newPackage.trim() || !!packageOp}
                      className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
                    >
                      安装
                    </button>
                    <button
                      onClick={() => {
                        setShowAddPackage(false)
                        setNewPackage('')
                      }}
                      className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      取消
                    </button>
                  </div>
                )}

                {/* 包列表 */}
                {packagesLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : packages.length === 0 ? (
                  <div className="py-4 text-center text-sm text-muted-foreground">
                    暂无已安装的包
                  </div>
                ) : (
                  <div className="max-h-60 overflow-y-auto">
                    {packages.map((pkg) => (
                      <div
                        key={pkg.name}
                        className="flex items-center justify-between px-4 py-2 hover:bg-accent/30 border-b border-border/50 last:border-b-0"
                      >
                        <div>
                          <span className="text-sm font-medium">{pkg.name}</span>
                          <span className="text-xs text-muted-foreground ml-2">v{pkg.version}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handlePackageAction('upgrade', pkg.name)}
                            disabled={!!packageOp}
                            className="p-1 rounded hover:bg-accent transition-colors disabled:opacity-50"
                            title="更新"
                          >
                            <ArrowUpFromLine className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                          <button
                            onClick={() => handlePackageAction('uninstall', pkg.name)}
                            disabled={!!packageOp}
                            className="p-1 rounded hover:bg-destructive/10 transition-colors disabled:opacity-50"
                            title="卸载"
                          >
                            <MinusCircle className="h-3.5 w-3.5 text-destructive/70" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 分隔线（第二个） */}
        <div className="border-t border-border" />

        {/* 分享管理 */}
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            会话分享
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            创建公开链接，让其他人查看截止到当前的聊天记录快照。
          </p>
        </div>

        {/* 创建分享 */}
        <button
          onClick={() => setShowShareDialog(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-border hover:bg-accent/5 transition-colors"
        >
          <Link2 className="h-4 w-4" />
          创建分享链接
        </button>

        <ShareDialog
          open={showShareDialog}
          onOpenChange={setShowShareDialog}
          sessionId={sessionId}
          onShareCreated={(share) => setShares(prev => [share, ...prev])}
        />

        {/* 已有分享列表 */}
        {sharesLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : shares.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              已创建 <strong className="text-foreground">{shares.length}</strong> 个分享链接
            </p>
            {shares.map(share => (
              <div
                key={share.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2"
              >
                <Share2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">{share.snapshotTitle}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(share.createdAt).toLocaleString('zh-CN')}
                  </p>
                </div>
                <button
                  onClick={() => window.open(`/share/${share.shareToken}`, '_blank')}
                  className="shrink-0 p-1 rounded hover:bg-accent transition-colors"
                  title="在新标签页打开"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                <button
                  onClick={() => handleCopyLink(share.shareToken, share.id)}
                  className="shrink-0 p-1 rounded hover:bg-accent transition-colors"
                  title="复制链接"
                >
                  {copiedShareId === share.id ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>
                <button
                  onClick={() => handleDeleteShare(share.id)}
                  disabled={deletingShareId === share.id}
                  className="shrink-0 p-1 rounded hover:bg-destructive/10 transition-colors disabled:opacity-50"
                  title="删除分享"
                >
                  {deletingShareId === share.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5 text-destructive/70" />
                  )}
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
