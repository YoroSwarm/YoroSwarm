"use client";

import { useState } from "react";
import {
  Upload,
  FileText,
  Image as ImageIcon,
  FileCode,
  MoreHorizontal,
  Download,
  Trash2,
  Search,
  FolderOpen,
} from "lucide-react";

interface FileItem {
  id: string;
  name: string;
  type: "document" | "image" | "code" | "other";
  size: number;
  uploadedAt: string;
  uploadedBy: string;
}

const mockFiles: FileItem[] = [
  {
    id: "1",
    name: "项目需求文档.pdf",
    type: "document",
    size: 1024 * 1024 * 2.5,
    uploadedAt: "2024-01-15T10:30:00",
    uploadedBy: "Leader",
  },
  {
    id: "2",
    name: "架构设计图.png",
    type: "image",
    size: 1024 * 512,
    uploadedAt: "2024-01-14T15:20:00",
    uploadedBy: "Worker-1",
  },
  {
    id: "3",
    name: "api-client.ts",
    type: "code",
    size: 1024 * 15,
    uploadedAt: "2024-01-13T09:15:00",
    uploadedBy: "Specialist-1",
  },
];

export default function FilesPage() {
  const [files] = useState<FileItem[]>(mockFiles);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredFiles = files.filter((file) =>
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (type: FileItem["type"]) => {
    switch (type) {
      case "document":
        return <FileText className="h-5 w-5 text-blue-500" />;
      case "image":
        return <ImageIcon className="h-5 w-5 text-purple-500" />;
      case "code":
        return <FileCode className="h-5 w-5 text-green-500" />;
      default:
        return <FileText className="h-5 w-5 text-gray-500" />;
    }
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
              <p className="text-2xl font-bold">{files.length}</p>
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
              <p className="text-2xl font-bold">{files.filter((f) => f.type === "image").length}</p>
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
              <p className="text-2xl font-bold">{files.filter((f) => f.type === "code").length}</p>
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
              <p className="text-2xl font-bold">{files.filter((f) => f.type === "document").length}</p>
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
          className="w-full pl-10 pr-4 py-2 rounded-lg border bg-background"
        />
      </div>

      {/* 文件列表 */}
      <div className="rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left text-sm font-medium">文件名</th>
                <th className="px-4 py-3 text-left text-sm font-medium">类型</th>
                <th className="px-4 py-3 text-left text-sm font-medium">大小</th>
                <th className="px-4 py-3 text-left text-sm font-medium">上传者</th>
                <th className="px-4 py-3 text-left text-sm font-medium">上传时间</th>
                <th className="px-4 py-3 text-left text-sm font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredFiles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    暂无文件
                  </td>
                </tr>
              ) : (
                filteredFiles.map((file) => (
                  <tr key={file.id} className="border-b last:border-b-0 hover:bg-muted/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {getFileIcon(file.type)}
                        <span className="font-medium">{file.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm capitalize">{file.type}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-muted-foreground">{formatFileSize(file.size)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm">{file.uploadedBy}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-muted-foreground">
                        {new Date(file.uploadedAt).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button className="p-1.5 rounded hover:bg-accent" title="下载">
                          <Download className="h-4 w-4" />
                        </button>
                        <button className="p-1.5 rounded hover:bg-accent" title="删除">
                          <Trash2 className="h-4 w-4" />
                        </button>
                        <button className="p-1.5 rounded hover:bg-accent">
                          <MoreHorizontal className="h-4 w-4" />
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
    </div>
  );
}
