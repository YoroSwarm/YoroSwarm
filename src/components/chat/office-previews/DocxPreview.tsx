'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, FileText } from 'lucide-react';

interface DocxPreviewProps {
  url: string;
  fileName: string;
}

export function DocxPreview({ url }: DocxPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDocx = useCallback(async () => {
    if (!containerRef.current) return;
    setLoading(true);
    setError(null);

    try {
      const [response, mammothModule] = await Promise.all([
        fetch(url),
        import('mammoth'),
      ]);
      const mammoth = mammothModule as unknown as { convertToHtml: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> };

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer });

      if (containerRef.current) {
        containerRef.current.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.className = 'docx-content';
        wrapper.innerHTML = result.value;
        containerRef.current.appendChild(wrapper);
      }
    } catch (e) {
      setError(`加载失败: ${e instanceof Error ? e.message : '未知错误'}`);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    loadDocx();
  }, [loadDocx]);

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <FileText className="h-12 w-12 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative max-h-[70vh] overflow-auto rounded border border-border bg-white dark:bg-zinc-900">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">正在解析文档...</span>
        </div>
      )}
      <div
        ref={containerRef}
        className="p-6 text-sm leading-relaxed [&_.docx-content]:space-y-2 [&_.docx-content_table]:border-collapse [&_.docx-content_table]:w-full [&_.docx-content_td]:border [&_.docx-content_td]:border-border [&_.docx-content_td]:p-2 [&_.docx-content_th]:border [&_.docx-content_th]:border-border [&_.docx-content_th]:p-2 [&_.docx-content_th]:bg-muted [&_.docx-content_img]:max-w-full [&_.docx-content_h1]:text-2xl [&_.docx-content_h1]:font-bold [&_.docx-content_h1]:mt-4 [&_.docx-content_h2]:text-xl [&_.docx-content_h2]:font-semibold [&_.docx-content_h2]:mt-3 [&_.docx-content_h3]:text-lg [&_.docx-content_h3]:font-medium [&_.docx-content_h3]:mt-2 [&_.docx-content_p]:my-1 [&_.docx-content_ul]:list-disc [&_.docx-content_ul]:pl-6 [&_.docx-content_ol]:list-decimal [&_.docx-content_ol]:pl-6 [&_.docx-content_li]:my-0.5"
      />
    </div>
  );
}
