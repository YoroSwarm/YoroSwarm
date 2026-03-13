'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Code,
  BarChart3,
  FileSpreadsheet,
  Download,
  Trash2,
  Search,
  Layers,
  ExternalLink,
  Bot,
  FolderOpen,
  File,
  Loader2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { artifactsApi, type ArtifactListItem, type ArtifactDetail } from '@/lib/api/artifacts';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';

const KIND_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  document: {
    label: '文档',
    icon: <FileText className="h-5 w-5" />,
    color: 'text-blue-500 bg-blue-500/10',
  },
  code: {
    label: '代码',
    icon: <Code className="h-5 w-5" />,
    color: 'text-green-500 bg-green-500/10',
  },
  analysis: {
    label: '分析',
    icon: <BarChart3 className="h-5 w-5" />,
    color: 'text-purple-500 bg-purple-500/10',
  },
  report: {
    label: '报告',
    icon: <FileText className="h-5 w-5" />,
    color: 'text-orange-500 bg-orange-500/10',
  },
  spreadsheet: {
    label: '表格',
    icon: <FileSpreadsheet className="h-5 w-5" />,
    color: 'text-emerald-500 bg-emerald-500/10',
  },
  outline: {
    label: '大纲',
    icon: <FileText className="h-5 w-5" />,
    color: 'text-cyan-500 bg-cyan-500/10',
  },
  generated_file: {
    label: '生成文件',
    icon: <File className="h-5 w-5" />,
    color: 'text-indigo-500 bg-indigo-500/10',
  },
  file_attachment: {
    label: '附件',
    icon: <File className="h-5 w-5" />,
    color: 'text-gray-500 bg-gray-500/10',
  },
  other: {
    label: '其他',
    icon: <Layers className="h-5 w-5" />,
    color: 'text-gray-500 bg-gray-500/10',
  },
};

function getKindConfig(kind: string) {
  return KIND_CONFIG[kind] || KIND_CONFIG.other;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin}分钟前`;
  if (diffHour < 24) return `${diffHour}小时前`;
  if (diffDay < 7) return `${diffDay}天前`;
  return date.toLocaleDateString('zh-CN');
}

export default function ArtifactsPage() {
  const [artifacts, setArtifacts] = useState<ArtifactListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeKind, setActiveKind] = useState('all');
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactDetail | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  const loadArtifacts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await artifactsApi.list(
        activeKind !== 'all' ? { kind: activeKind } : undefined
      );
      setArtifacts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载产出物失败');
    } finally {
      setIsLoading(false);
    }
  }, [activeKind]);

  useEffect(() => {
    loadArtifacts();
  }, [loadArtifacts]);

  const handleViewDetail = async (artifactId: string) => {
    setIsDetailLoading(true);
    try {
      const detail = await artifactsApi.get(artifactId);
      setSelectedArtifact(detail);
    } catch (err) {
      console.error('Failed to load artifact detail:', err);
    } finally {
      setIsDetailLoading(false);
    }
  };

  const handleDelete = async (artifactId: string) => {
    try {
      await artifactsApi.delete(artifactId);
      setArtifacts((prev) => prev.filter((a) => a.id !== artifactId));
      if (selectedArtifact?.id === artifactId) {
        setSelectedArtifact(null);
      }
    } catch (err) {
      console.error('Failed to delete artifact:', err);
    }
  };

  const filteredArtifacts = artifacts.filter((a) =>
    a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.summary?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.ownerAgent?.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Stats
  const stats = {
    total: artifacts.length,
    documents: artifacts.filter((a) => ['document', 'report', 'analysis', 'outline'].includes(a.kind)).length,
    code: artifacts.filter((a) => a.kind === 'code').length,
    files: artifacts.filter((a) => ['generated_file', 'file_attachment'].includes(a.kind)).length,
  };

  const kindTabs = [
    { value: 'all', label: '全部' },
    { value: 'document', label: '文档' },
    { value: 'code', label: '代码' },
    { value: 'analysis', label: '分析' },
    { value: 'report', label: '报告' },
    { value: 'generated_file', label: '文件' },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold">产出物</h1>
        <p className="text-muted-foreground mt-1">
          Agent 团队生成的所有文档、代码、分析和文件
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Layers className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">总产出物</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <FileText className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">文档/报告</p>
              <p className="text-2xl font-bold">{stats.documents}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <Code className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">代码</p>
              <p className="text-2xl font-bold">{stats.code}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-indigo-500/10 flex items-center justify-center">
              <FolderOpen className="h-5 w-5 text-indigo-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">生成文件</p>
              <p className="text-2xl font-bold">{stats.files}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索产出物..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border bg-background text-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
        <Tabs value={activeKind} onValueChange={setActiveKind}>
          <TabsList>
            {kindTabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="text-xs">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Loading / Error / Empty */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-12 text-destructive">
          <p>{error}</p>
          <button onClick={loadArtifacts} className="mt-2 text-sm underline">
            重试
          </button>
        </div>
      ) : filteredArtifacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Layers className="h-12 w-12 mb-3" />
          <p className="text-lg font-medium">暂无产出物</p>
          <p className="text-sm mt-1">Agent 完成任务后，产出物会显示在这里</p>
        </div>
      ) : (
        /* Artifact Cards Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredArtifacts.map((artifact) => {
            const config = getKindConfig(artifact.kind);

            return (
              <div
                key={artifact.id}
                className="rounded-xl border bg-card hover:shadow-md transition-all overflow-hidden"
              >
                {/* Card Header */}
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center shrink-0', config.color)}>
                      {config.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm truncate">{artifact.title}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs">
                          {config.label}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(artifact.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Summary */}
                  {artifact.summary && (
                    <p className="mt-3 text-xs text-muted-foreground line-clamp-2">
                      {artifact.summary}
                    </p>
                  )}

                  {/* Attribution */}
                  <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                    {artifact.ownerAgent && (
                      <div className="flex items-center gap-1">
                        <Bot className="h-3 w-3" />
                        <span>{artifact.ownerAgent.name}</span>
                      </div>
                    )}
                    {artifact.swarmSession && (
                      <div className="flex items-center gap-1 truncate">
                        <FolderOpen className="h-3 w-3 shrink-0" />
                        <span className="truncate">{artifact.swarmSession.name}</span>
                      </div>
                    )}
                  </div>

                  {/* File info */}
                  {artifact.file && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground bg-muted rounded-md px-2 py-1">
                      <File className="h-3 w-3" />
                      <span className="truncate">{artifact.file.name}</span>
                      <span>({formatFileSize(artifact.file.size)})</span>
                    </div>
                  )}
                </div>

                {/* Card Actions */}
                <div className="border-t px-4 py-2 flex items-center justify-between bg-muted/30">
                  <div className="flex items-center gap-1">
                    {artifact.hasContent && (
                      <button
                        onClick={() => handleViewDetail(artifact.id)}
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-accent transition-colors"
                        title="查看内容"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span>查看</span>
                      </button>
                    )}
                    {artifact.file && (
                      <a
                        href={`${artifact.file.url}?download=1`}
                        download
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-accent transition-colors"
                        title="下载文件"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>下载</span>
                      </a>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(artifact.id)}
                    className="p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"
                    title="删除"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selectedArtifact} onOpenChange={(open) => !open && setSelectedArtifact(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          {selectedArtifact && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center', getKindConfig(selectedArtifact.kind).color)}>
                    {getKindConfig(selectedArtifact.kind).icon}
                  </div>
                  <div>
                    <DialogTitle>{selectedArtifact.title}</DialogTitle>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-xs">
                        {getKindConfig(selectedArtifact.kind).label}
                      </Badge>
                      {selectedArtifact.ownerAgent && (
                        <span className="text-xs text-muted-foreground">
                          by {selectedArtifact.ownerAgent.name}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatDate(selectedArtifact.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
              </DialogHeader>

              {selectedArtifact.summary && (
                <p className="text-sm text-muted-foreground border-b pb-3">
                  {selectedArtifact.summary}
                </p>
              )}

              <ScrollArea className="max-h-[50vh]">
                {selectedArtifact.content ? (
                  <pre className="text-sm whitespace-pre-wrap font-mono bg-muted rounded-lg p-4">
                    {selectedArtifact.content}
                  </pre>
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    此产出物没有文本内容
                  </p>
                )}
              </ScrollArea>

              {selectedArtifact.file && (
                <div className="flex items-center justify-between border-t pt-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <File className="h-4 w-4" />
                    <span>{selectedArtifact.file.name}</span>
                    <span>({formatFileSize(selectedArtifact.file.size)})</span>
                  </div>
                  <a
                    href={`${selectedArtifact.file.url}?download=1`}
                    download
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                  >
                    <Download className="h-4 w-4" />
                    下载
                  </a>
                </div>
              )}
            </>
          )}
          {isDetailLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
