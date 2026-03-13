"use client";

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
  X,
  File,
} from "lucide-react";
import { filesApi, type UploadedFileResponse } from "@/lib/api/files";

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

export default function FilesPage() {
  const [files, setFiles] = useState<UploadedFileResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await filesApi.listFiles();
      setFiles(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载文件失败");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

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

  const stats = {
    total: files.length,
    images: files.filter((f) => getFileType(f.mimeType) === "image").length,
    code: files.filter((f) => getFileType(f.mimeType) === "code").length,
    documents: files.filter((f) => getFileType(f.mimeType) === "document").length,
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">文件管理</h1>
          <p className="text-muted-foreground mt-1">上传、管理和共享文件</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
          <Upload className="h-4 w-4" />
          上传文件
        </button>
      </div>

      {/* 统计 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <FolderOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">总文件数</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <ImageIcon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">图片</p>
              <p className="text-2xl font-bold">{stats.images}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <FileCode className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">代码文件</p>
              <p className="text-2xl font-bold">{stats.code}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
              <FileText className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">文档</p>
              <p className="text-2xl font-bold">{stats.documents}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 搜索 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="搜索文件..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-10 py-2 rounded-lg border bg-background"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* 文件列表 */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-12 text-destructive">
          <p>{error}</p>
          <button onClick={loadFiles} className="mt-2 text-sm underline">
            重试
          </button>
        </div>
      ) : (
        <div className="rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left text-sm font-medium">文件名</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">类型</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">大小</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">上传时间</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredFiles.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      暂无文件
                    </td>
                  </tr>
                ) : (
                  filteredFiles.map((file) => (
                    <tr key={file.id} className="border-b last:border-b-0 hover:bg-muted/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {getFileIcon(file.mimeType)}
                          <span className="font-medium">{file.originalName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-muted-foreground">{file.mimeType}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-muted-foreground">{formatFileSize(file.size)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-muted-foreground">
                          {new Date(file.createdAt).toLocaleDateString("zh-CN")}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <a
                            href={`/api/files/${file.id}?download=1`}
                            download
                            className="p-1.5 rounded hover:bg-accent"
                            title="下载"
                          >
                            <Download className="h-4 w-4" />
                          </a>
                          <button
                            onClick={() => handleDelete(file.id)}
                            className="p-1.5 rounded hover:bg-destructive/10 hover:text-destructive"
                            title="删除"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
