'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, FileText, Loader2, Code, Eye, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ReactMarkdown from 'react-markdown';
import { DocxPreview } from './office-previews/DocxPreview';
import { XlsxPreview } from './office-previews/XlsxPreview';
import remarkGfm from 'remark-gfm';

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

function isMarkdownFile(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return ext === 'md' || ext === 'mdx';
}

function isHtmlFile(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return ext === 'html' || ext === 'htm';
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

function isDocx(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.docx');
}

function isDoc(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.doc');
}

function isXlsx(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith('.xlsx') || lower.endsWith('.xls');
}

function isPptx(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith('.pptx') || lower.endsWith('.ppt');
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Server-side text extraction preview for .doc files */
function DocServerPreview({ url }: { url: string; fileName: string }) {
  const [content, setContent] = useState<{ text?: string; html?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadContent = useCallback(async () => {
    const params = new URL(url, window.location.origin).searchParams;
    const sessionId = params.get('swarmSessionId') || '';
    const filePath = params.get('path') || '';
    if (!sessionId || !filePath) {
      setError('无法解析文件路径');
      setLoading(false);
      return;
    }

    try {
      const extractUrl = `/api/files/extract-text?swarmSessionId=${encodeURIComponent(sessionId)}&path=${encodeURIComponent(filePath)}`;
      const res = await fetch(extractUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.data?.html) {
        setContent({ html: data.data.html });
      } else if (data.data?.text) {
        setContent({ text: data.data.text });
      } else {
        throw new Error('无法提取文本');
      }
    } catch (e) {
      setError(`加载失败: ${e instanceof Error ? e.message : '未知错误'}`);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    loadContent();
  }, [loadContent]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">正在提取文本...</span>
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

  if (content?.html) {
    return (
      <div
        className="max-h-[70vh] overflow-auto rounded border border-border bg-white dark:bg-zinc-900 p-6 text-sm leading-relaxed"
        dangerouslySetInnerHTML={{ __html: content.html }}
      />
    );
  }

  return (
    <pre className="max-h-[70vh] overflow-auto rounded border border-border bg-muted/50 p-4 text-sm font-mono whitespace-pre-wrap wrap-break-word">
      {content?.text || '（空文档）'}
    </pre>
  );
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
  const [htmlViewSource, setHtmlViewSource] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  const isHtml = isHtmlFile(fileName);

  const isTextFile = isPreviewableText(mimeType, fileName);
  const isImageFile = isImage(mimeType);
  const isPdfFile = isPdf(mimeType);
  const isAudioFile = isAudio(mimeType);
  const isVideoFile = isVideo(mimeType);
  const isDocxFile = isDocx(fileName);
  const isDocFile = isDoc(fileName);
  const isXlsxFile = isXlsx(fileName);
  const isPptxFile = isPptx(fileName);
  const language = getLanguageFromFilename(fileName);

  const downloadUrl = fileUrl.includes('?') ? `${fileUrl}&download=1` : `${fileUrl}?download=1`;
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
      setHtmlViewSource(false);
      setIsMaximized(false);
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

    // DOCX preview
    if (isDocxFile) {
      return <DocxPreview url={inlineUrl} fileName={fileName} />;
    }

    // DOC preview (server-side text extraction)
    if (isDocFile) {
      return <DocServerPreview url={inlineUrl} fileName={fileName} />;
    }

    // XLSX/XLS preview
    if (isXlsxFile) {
      return <XlsxPreview url={inlineUrl} fileName={fileName} />;
    }

    // PPTX/PPT - not supported yet
    if (isPptxFile) {
      return (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <FileText className="h-16 w-16 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">{fileName}</p>
            <p className="text-xs text-muted-foreground mt-2">
              PPT/PPTX 格式暂不支持在线预览，请下载后查看
            </p>
          </div>
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
        // HTML 文件：默认渲染，可切换查看源码
        if (isHtmlFile(fileName)) {
          if (htmlViewSource) {
            return (
              <div className="relative h-full overflow-auto rounded border border-border text-sm">
                <button
                  onClick={() => setHtmlViewSource(false)}
                  className="sticky top-2 right-2 float-right z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-background/80 backdrop-blur border border-border text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  title="切换到渲染视图"
                >
                  <Eye className="h-3.5 w-3.5" />
                  渲染
                </button>
                <SyntaxHighlighter
                  language="html"
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
            <div className="relative h-full rounded border border-border">
              <button
                onClick={() => setHtmlViewSource(true)}
                className="absolute top-2 right-2 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-background/80 backdrop-blur border border-border text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                title="查看源码"
              >
                <Code className="h-3.5 w-3.5" />
                源码
              </button>
              <iframe
                srcDoc={textContent}
                className="w-full h-full rounded bg-white"
                title={fileName}
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
          );
        }
        // Markdown 文件渲染为 HTML
        if (isMarkdownFile(fileName)) {
          return (
            <div className="max-h-[70vh] overflow-auto rounded border border-border bg-background p-6 markdown-content text-sm">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // 代码块使用语法高亮
                  pre: ({ children, ...props }) => (
                    <pre className="bg-muted p-4 rounded-lg overflow-x-auto" {...props}>
                      {children}
                    </pre>
                  ),
                  code: ({ className, children, ...props }) => {
                    const match = /language-(\w+)/.exec(className || '');
                    const lang = match ? match[1] : '';
                    const isInline = !match;
                    if (!isInline && lang) {
                      return (
                        <SyntaxHighlighter
                          language={lang}
                          style={vscDarkPlus}
                          customStyle={{
                            margin: 0,
                            borderRadius: '0.375rem',
                            fontSize: '0.8125rem',
                            background: 'transparent',
                          }}
                          PreTag="div"
                          {...props}
                        >
                          {String(children).replace(/\n$/, '')}
                        </SyntaxHighlighter>
                      );
                    }
                    return (
                      <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {textContent}
              </ReactMarkdown>
            </div>
          );
        }
        // 其他代码文件使用语法高亮
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
        // 普通文本文件
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
          "flex flex-col transition-all duration-200",
          isMaximized
            ? "max-w-[95vw]! w-[95vw]! h-[90vh]! max-h-[90vh]!"
            : cn(
                "sm:max-w-3xl max-h-[90vh]",
                (isPdfFile || isVideoFile) && "sm:max-w-4xl",
                isHtml && "sm:max-w-5xl h-[85vh]",
                (isXlsxFile || isDocxFile || isDocFile) && "sm:max-w-5xl"
              )
        )}
      >
        {/* Toolbar buttons - left of close button */}
        <div className="absolute top-2 right-10 z-10 flex items-center gap-1">
          <a
            href={downloadUrl}
            download={fileName}
            onClick={(e) => e.stopPropagation()}
          >
            <Button variant="ghost" size="icon" className="h-6 w-6" title="下载文件">
              <Download className="h-4 w-4" />
            </Button>
          </a>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            title={isMaximized ? '恢复大小' : '最大化'}
            onClick={() => setIsMaximized(v => !v)}
          >
            {isMaximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
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
