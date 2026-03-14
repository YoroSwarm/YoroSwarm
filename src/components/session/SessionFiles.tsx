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
} from "lucide-react";
import { filesApi, type UploadedFileResponse } from "@/lib/api/files";
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
  )
    return "code";
  if (
    mimeType.includes("pdf") ||
    mimeType.includes("word") ||
    mimeType.includes("document") ||
    mimeType.includes("text/plain") ||
    mimeType.includes("spreadsheet") ||
    mimeType.includes("presentation")
  )
    return "document";
  return "other";
}

export function SessionFiles({ sessionId, refreshToken = 0 }: SessionFilesProps) {
  const [files, setFiles] = useState<UploadedFileResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await filesApi.listFiles(sessionId);
      setFiles(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载文件失败");
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (sessionId) {
      loadFiles();
    }
  }, [sessionId, loadFiles, refreshToken]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      await filesApi.uploadFile(file, sessionId);
      await loadFiles();
    } catch (err) {
      console.error("Failed to upload file:", err);
      // You might want to show a toast here
    } finally {
      setIsUploading(false);
      // Reset input
      e.target.value = "";
    }
  };

  const handleDelete = async (fileId: string) => {
    try {
      await filesApi.deleteFile(fileId);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch (err) {
      console.error("Failed to delete file:", err);
    }
  };

  const filteredFiles = files.filter((file) =>
    file.originalName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (mimeType: string) => {
    const type = getFileType(mimeType);
    switch (type) {
      case "document":
        return <FileText className="h-5 w-5 text-blue-500" />;
      case "image":
        return <ImageIcon className="h-5 w-5 text-purple-500" />;
      case "code":
        return <FileCode className="h-5 w-5 text-green-500" />;
      default:
        return <File className="h-5 w-5 text-gray-500" />;
    }
  };

  return (
    <div className="flex flex-col gap-6 p-4 h-full">
      <div className="flex items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="搜索当前会话文件..."
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
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            上传文件
          </Button>
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
            <Button variant="link" onClick={loadFiles} className="mt-2">
              重试
            </Button>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border border-border rounded-xl">
            <FolderOpen className="h-12 w-12 mb-3 opacity-50" />
            <p className="font-medium">暂无文件</p>
            <p className="text-sm mt-1">上传的文件将显示在这里</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredFiles.map((file) => (
              <div
                key={file.id}
                className="card-hand p-4 flex flex-col gap-3 relative group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="p-2 bg-muted rounded-md shrink-0">
                        {getFileIcon(file.mimeType)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate" title={file.originalName}>
                        {file.originalName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleDelete(file.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                
                <div className="mt-auto pt-2 flex justify-end">
                    <a
                      href={`/api/files/${file.id}?download=1`}
                      download
                      className="text-xs flex items-center gap-1 hover:underline text-primary"
                    >
                      <Download className="h-3 w-3" />
                      下载
                    </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}