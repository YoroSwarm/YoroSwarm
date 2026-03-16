'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface FilePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileUrl: string;
  fileName: string;
  mimeType?: string;
  fileSize?: number;
}

const EXTENSION_LANG_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust',
  java: 'java', kt: 'kotlin', swift: 'swift', c: 'c',
  cpp: 'cpp', h: 'c', hpp: 'cpp', cs: 'csharp',
  css: 'css', scss: 'scss', less: 'less',
  html: 'html', xml: 'xml', svg: 'svg',
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
  sql: 'sql', sh: 'bash', bash: 'bash', zsh: 'bash',
  dockerfile: 'docker', makefile: 'makefile',
  md: 'markdown', mdx: 'markdown',
  prisma: 'prisma', graphql: 'graphql', gql: 'graphql',
};

const TEXT_PREVIEW_LIMIT = 512 * 1024; // 512KB

function getLanguageFromFilename(filename: string): string | null {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return EXTENSION_LANG_MAP[ext] || null;
}

function isPreviewableText(mimeType?: string, fileName?: string): boolean {
  if (mimeType?.startsWith('text/')) return true;
  if (mimeType === 'application/json' || mimeType === 'application/xml') return true;
  if (mimeType === 'application/javascript' || mimeType === 'application/typescript') return true;
  const ext = fileName?.split('.').pop()?.toLowerCase() || '';
  return ext in EXTENSION_LANG_MAP || ['txt', 'log', 'env', 'gitignore', 'editorconfig', 'prettierrc'].includes(ext);
}

function isImage(mimeType?: string): boolean {
  return !!mimeType?.startsWith('image/');
}

function isPdf(mimeType?: string): boolean {
  return mimeType === 'application/pdf';
}

function isAudio(mimeType?: string): boolean {
  return !!mimeType?.startsWith('audio/');
}

function isVideo(mimeType?: string): boolean {
  return !!mimeType?.startsWith('video/');
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FilePreviewDialog({
  open,
  onOpenChange,
  fileUrl,
  fileName,
  mimeType,
  fileSize,
}: FilePreviewDialogProps) {
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isTextFile = isPreviewableText(mimeType, fileName);
  const isImageFile = isImage(mimeType);
  const isPdfFile = isPdf(mimeType);
  const isAudioFile = isAudio(mimeType);
  const isVideoFile = isVideo(mimeType);
  const language = getLanguageFromFilename(fileName);

  const downloadUrl = `${fileUrl}?download=1`;
  // For inline display, omit the download param
  const inlineUrl = fileUrl;

  const fetchTextContent = useCallback(async () => {
    if (!isTextFile || !open) return;
    if (fileSize && fileSize > TEXT_PREVIEW_LIMIT) {
      setError(`文件过大 (${formatFileSize(fileSize)})，超出预览限制`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(inlineUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const contentLength = res.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > TEXT_PREVIEW_LIMIT) {
        setError(`文件过大 (${formatFileSize(parseInt(contentLength))})，超出预览限制`);
        setLoading(false);
        return;
      }
      const text = await res.text();
      setTextContent(text);
    } catch (e) {
      setError(`加载失败: ${e instanceof Error ? e.message : '未知错误'}`);
    } finally {
      setLoading(false);
    }
  }, [isTextFile, open, fileSize, inlineUrl]);

  useEffect(() => {
    if (open && isTextFile) {
      fetchTextContent();
    }
    if (!open) {
      setTextContent(null);
      setError(null);
    }
  }, [open, isTextFile, fetchTextContent]);

  const renderPreview = () => {
    // Image preview
    if (isImageFile) {
      return (
        <div className="flex items-center justify-center max-h-[70vh] overflow-auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={inlineUrl}
            alt={fileName}
            className="max-w-full max-h-[70vh] object-contain rounded"
          />
        </div>
      );
    }

    // PDF preview
    if (isPdfFile) {
      return (
        <iframe
          src={inlineUrl}
          className="w-full h-[70vh] rounded border border-border"
          title={fileName}
        />
      );
    }

    // Audio preview
    if (isAudioFile) {
      return (
        <div className="flex flex-col items-center gap-4 py-8">
          <FileText className="h-16 w-16 text-muted-foreground" />
          <audio controls className="w-full max-w-md">
            <source src={inlineUrl} type={mimeType} />
            您的浏览器不支持音频播放
          </audio>
        </div>
      );
    }

    // Video preview
    if (isVideoFile) {
      return (
        <div className="flex items-center justify-center">
          <video controls className="max-w-full max-h-[70vh] rounded">
            <source src={inlineUrl} type={mimeType} />
            您的浏览器不支持视频播放
          </video>
        </div>
      );
    }

    // Text / Code preview
    if (isTextFile) {
      if (loading) {
        return (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">加载中...</span>
          </div>
        );
      }
      if (error) {
        return (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <FileText className="h-12 w-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        );
      }
      if (textContent !== null) {
        if (language) {
          return (
            <div className="max-h-[70vh] overflow-auto rounded border border-border text-sm">
              <SyntaxHighlighter
                language={language}
                style={vscDarkPlus}
                showLineNumbers
                customStyle={{
                  margin: 0,
                  borderRadius: '0.375rem',
                  fontSize: '0.8125rem',
                }}
              >
                {textContent}
              </SyntaxHighlighter>
            </div>
          );
        }
        return (
          <pre className="max-h-[70vh] overflow-auto rounded border border-border bg-muted/50 p-4 text-sm font-mono whitespace-pre-wrap wrap-break-word">
            {textContent}
          </pre>
        );
      }
    }

    // Fallback - unsupported format
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <FileText className="h-16 w-16 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">{fileName}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {mimeType || '未知类型'}
            {fileSize ? ` · ${formatFileSize(fileSize)}` : ''}
          </p>
          <p className="text-xs text-muted-foreground mt-2">此文件类型不支持在线预览</p>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "sm:max-w-3xl max-h-[90vh] flex flex-col",
          (isPdfFile || isVideoFile) && "sm:max-w-4xl"
        )}
      >
        {/* Download button - positioned at top-right, left of close button */}
        <a
          href={downloadUrl}
          download={fileName}
          className="absolute top-2 right-10 z-10"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            title="下载文件"
          >
            <Download className="h-4 w-4" />
          </Button>
        </a>
        <DialogHeader className="flex flex-row items-center gap-2 pr-20">
          <DialogTitle className="truncate text-sm font-medium">{fileName}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-auto">
          {renderPreview()}
        </div>
      </DialogContent>
    </Dialog>
  );
}
