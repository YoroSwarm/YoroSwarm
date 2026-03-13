import { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { artifactsApi, type ArtifactListItem, type ArtifactDetail } from "@/lib/api/artifacts";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SessionArtifactsProps {
  sessionId: string;
}

const KIND_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  document: {
    label: "文档",
    icon: <FileText className="h-5 w-5" />,
    color: "text-blue-600 bg-blue-100",
  },
  code: {
    label: "代码",
    icon: <Code className="h-5 w-5" />,
    color: "text-green-600 bg-green-100",
  },
  analysis: {
    label: "分析",
    icon: <BarChart3 className="h-5 w-5" />,
    color: "text-purple-600 bg-purple-100",
  },
  report: {
    label: "报告",
    icon: <FileText className="h-5 w-5" />,
    color: "text-orange-600 bg-orange-100",
  },
  spreadsheet: {
    label: "表格",
    icon: <FileSpreadsheet className="h-5 w-5" />,
    color: "text-emerald-600 bg-emerald-100",
  },
  outline: {
    label: "大纲",
    icon: <FileText className="h-5 w-5" />,
    color: "text-cyan-600 bg-cyan-100",
  },
  generated_file: {
    label: "生成文件",
    icon: <File className="h-5 w-5" />,
    color: "text-indigo-600 bg-indigo-100",
  },
  file_attachment: {
    label: "附件",
    icon: <File className="h-5 w-5" />,
    color: "text-gray-600 bg-gray-100",
  },
  other: {
    label: "其他",
    icon: <Layers className="h-5 w-5" />,
    color: "text-gray-600 bg-gray-100",
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
  return date.toLocaleDateString("zh-CN");
}

export function SessionArtifacts({ sessionId }: SessionArtifactsProps) {
  const [artifacts, setArtifacts] = useState<ArtifactListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactDetail | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  const loadArtifacts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await artifactsApi.list({ swarmSessionId: sessionId });
      setArtifacts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载产出物失败");
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (sessionId) {
      loadArtifacts();
    }
  }, [sessionId, loadArtifacts]);

  const handleViewDetail = async (artifactId: string) => {
    setIsDetailLoading(true);
    try {
      const detail = await artifactsApi.get(artifactId);
      setSelectedArtifact(detail);
    } catch (err) {
      console.error("Failed to load artifact detail:", err);
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
      console.error("Failed to delete artifact:", err);
    }
  };

  const filteredArtifacts = artifacts.filter((a) =>
    a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.summary?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.ownerAgent?.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-4 p-4 h-full">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="搜索产出物..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 input-hand"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 text-destructive">
            <p>{error}</p>
            <Button variant="link" onClick={loadArtifacts} className="mt-2">
              重试
            </Button>
          </div>
        ) : filteredArtifacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border border-border rounded-xl">
            <Layers className="h-12 w-12 mb-3 opacity-50" />
            <p className="font-medium">暂无产出物</p>
            <p className="text-sm mt-1">Agent 完成任务后，产出物会显示在这里</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredArtifacts.map((artifact) => {
              const config = getKindConfig(artifact.kind);

              return (
                <div
                  key={artifact.id}
                  className="card-hand p-4 flex flex-col gap-3 relative group hover:shadow-md transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0 border border-border/50", config.color)}>
                      {config.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm truncate">{artifact.title}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] px-2 py-0.5 rounded-full border border-border/50 bg-muted">
                          {config.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(artifact.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {artifact.summary && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {artifact.summary}
                    </p>
                  )}

                  <div className="mt-auto pt-2 border-t border-border/20 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {artifact.hasContent && (
                        <button
                            onClick={() => handleViewDetail(artifact.id)}
                            className="text-xs flex items-center gap-1 hover:text-primary transition-colors"
                        >
                            <ExternalLink className="h-3 w-3" />
                            查看
                        </button>
                        )}
                        {artifact.file && (
                        <a
                            href={`${artifact.file.url}?download=1`}
                            download
                            className="text-xs flex items-center gap-1 hover:text-primary transition-colors"
                        >
                            <Download className="h-3 w-3" />
                            下载
                        </a>
                        )}
                    </div>
                    <button
                        onClick={() => handleDelete(artifact.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!selectedArtifact} onOpenChange={(open) => !open && setSelectedArtifact(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] card-hand border-4">
          {selectedArtifact && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center border border-border/50", getKindConfig(selectedArtifact.kind).color)}>
                    {getKindConfig(selectedArtifact.kind).icon}
                  </div>
                  <div>
                    <DialogTitle className="text-xl font-semibold">{selectedArtifact.title}</DialogTitle>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">
                            {getKindConfig(selectedArtifact.kind).label}
                        </span>
                        {selectedArtifact.ownerAgent && (
                            <span className="text-xs text-muted-foreground">
                            by {selectedArtifact.ownerAgent.name}
                            </span>
                        )}
                    </div>
                  </div>
                </div>
              </DialogHeader>

              <ScrollArea className="max-h-[50vh] mt-4">
                {selectedArtifact.content ? (
                  <pre className="text-sm whitespace-pre-wrap font-mono bg-muted/50 rounded-lg p-4 border border-border">
                    {selectedArtifact.content}
                  </pre>
                ) : (
                    <p className="text-sm text-muted-foreground py-8 text-center border border-border rounded-lg">
                    此产出物没有文本内容
                  </p>
                )}
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}