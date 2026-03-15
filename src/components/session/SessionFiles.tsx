import { useState, useEffect, useCallback } from "react";
import {
  Upload,
  FileText,
  Image as ImageIcon,
  FileCode,
  Download,
  Trash2,
  Search,
  FolderOpen,
  Loader2,
  File,
  ChevronRight,
  FolderTree,
} from "lucide-react";
import { filesApi, type UploadedFileResponse, type WorkspaceDirectoryEntry } from "@/lib/api/files";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SessionFilesProps {
  sessionId: string;
  refreshToken?: number;
}

function getFileType(mimeType: string): "document" | "image" | "code" | "other" {
  if (mimeType.startsWith("image/")) return "image";
  if (
    mimeType.includes("javascript") ||
    mimeType.includes("typescript") ||
    mimeType.includes("json") ||
    mimeType.includes("xml") ||
    mimeType.includes("html") ||
    mimeType.includes("css") ||
    mimeType.includes("python") ||
    mimeType.includes("java") ||
    mimeType.includes("text/x-")
  ) return "code";
  if (
    mimeType.includes("pdf") ||
    mimeType.includes("word") ||
    mimeType.includes("document") ||
    mimeType.includes("text/plain") ||
    mimeType.includes("markdown") ||
    mimeType.includes("spreadsheet") ||
    mimeType.includes("presentation")
  ) return "document";
  return "other";
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mimeType: string) {
  const type = getFileType(mimeType);
  switch (type) {
    case "document":
      return <FileText className="h-4 w-4 text-blue-500" />;
    case "image":
      return <ImageIcon className="h-4 w-4 text-purple-500" />;
    case "code":
      return <FileCode className="h-4 w-4 text-green-500" />;
    default:
      return <File className="h-4 w-4 text-gray-500" />;
  }
}

export function SessionFiles({ sessionId, refreshToken = 0 }: SessionFilesProps) {
  const [files, setFiles] = useState<UploadedFileResponse[]>([]);
  const [entries, setEntries] = useState<WorkspaceDirectoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [currentDir, setCurrentDir] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [allFiles, tree] = await Promise.all([
        filesApi.listFiles(sessionId),
        filesApi.listDirectory(sessionId, currentDir, false),
      ]);
      setFiles(allFiles);
      setEntries(tree.entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载文件失败");
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, currentDir]);

  useEffect(() => {
    if (sessionId) {
      void load();
    }
  }, [sessionId, load, refreshToken]);

  const visibleEntries = searchQuery.trim()
    ? entries.filter((entry) => entry.path.toLowerCase().includes(searchQuery.toLowerCase()))
    : entries;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const rel = currentDir ? `${currentDir}/${file.name}` : file.name;
      await filesApi.uploadFile(file, sessionId, rel);
      await load();
    } catch (err) {
      console.error("Failed to upload file:", err);
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleDelete = async (fileId: string) => {
    try {
      await filesApi.deleteFile(fileId);
      await load();
    } catch (err) {
      console.error("Failed to delete file:", err);
    }
  };

  const breadcrumbs = currentDir ? currentDir.split('/').filter(Boolean) : [];

  return (
    <div className="flex flex-col gap-4 p-4 h-full">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="搜索当前目录..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 input-hand"
          />
        </div>
        <div className="relative">
          <input
            type="file"
            onChange={handleUpload}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={isUploading}
          />
          <Button disabled={isUploading} className="btn-hand">
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
            上传到当前目录
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground border rounded-lg px-3 py-2 bg-muted/30">
        <FolderTree className="h-4 w-4" />
        <button className="hover:underline" onClick={() => setCurrentDir("")}>工作区</button>
        {breadcrumbs.map((part, index) => {
          const next = breadcrumbs.slice(0, index + 1).join('/');
          return (
            <div key={next} className="flex items-center gap-2">
              <span>/</span>
              <button className="hover:underline" onClick={() => setCurrentDir(next)}>{part}</button>
            </div>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto pr-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 text-destructive">
            <p>{error}</p>
            <Button variant="link" onClick={() => void load()} className="mt-2">重试</Button>
          </div>
        ) : visibleEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border border-border rounded-xl">
            <FolderOpen className="h-12 w-12 mb-3 opacity-50" />
            <p className="font-medium">当前目录为空</p>
            <p className="text-sm mt-1">这里显示真实工作区目录内容</p>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleEntries.map((entry) => {
              if (entry.type === 'directory') {
                return (
                  <button
                    key={entry.path}
                    onClick={() => setCurrentDir(entry.path)}
                    className="w-full text-left card-hand px-4 py-3 flex items-center gap-3 hover:bg-accent/20"
                  >
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    <FolderOpen className="h-4 w-4 text-amber-500" />
                    <span className="font-medium truncate">{entry.name}</span>
                  </button>
                );
              }

              const file = files.find((item) => (item.relativePath || item.originalName) === entry.path);
              const downloadHref = file ? `/api/files/${file.id}?download=1` : filesApi.getPathDownloadUrl(sessionId, entry.path, true);
              const handleDeleteClick = () => file ? handleDelete(file.id) : filesApi.deleteFileByPath(sessionId, entry.path).then(load).catch((err) => console.error('Failed to delete file:', err));
              return (
                <div key={entry.path} className="card-hand px-4 py-3 flex items-center justify-between gap-3 group">
                  <div className="flex items-center gap-3 min-w-0">
                    {getFileIcon(entry.mimeType || file?.mimeType || 'application/octet-stream')}
                    <div className="min-w-0">
                      <p className="font-medium truncate" title={entry.path}>{entry.name}</p>
                      <p className="text-xs text-muted-foreground">{typeof entry.size === 'number' ? formatFileSize(entry.size) : '-'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <a href={downloadHref} download className="text-xs flex items-center gap-1 hover:underline text-primary">
                      <Download className="h-3 w-3" />下载
                    </a>
                    <button onClick={() => void handleDeleteClick()} className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
