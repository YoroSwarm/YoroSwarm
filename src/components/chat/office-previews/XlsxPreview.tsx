'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface XlsxPreviewProps {
  url: string;
  fileName: string;
}

interface SheetData {
  name: string;
  headers: string[];
  rows: string[][];
  totalRows: number;
}

const MAX_PREVIEW_ROWS = 500;

export function XlsxPreview({ url }: XlsxPreviewProps) {
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadXlsx = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [response, XLSX] = await Promise.all([
        fetch(url),
        import('xlsx'),
      ]);

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });

      const parsedSheets: SheetData[] = workbook.SheetNames.map((name) => {
        const worksheet = workbook.Sheets[name];
        const jsonData = XLSX.utils.sheet_to_json<string[]>(worksheet, {
          header: 1,
          defval: '',
        });

        if (jsonData.length === 0) {
          return { name, headers: [], rows: [], totalRows: 0 };
        }

        const headers = (jsonData[0] as string[]).map((h) => String(h));
        const allRows = jsonData.slice(1).map((row) =>
          (row as string[]).map((cell) => String(cell ?? ''))
        );
        const totalRows = allRows.length;
        const rows = allRows.slice(0, MAX_PREVIEW_ROWS);

        return { name, headers, rows, totalRows };
      });

      setSheets(parsedSheets);
    } catch (e) {
      setError(`加载失败: ${e instanceof Error ? e.message : '未知错误'}`);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    loadXlsx();
  }, [loadXlsx]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">正在解析表格...</span>
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

  if (sheets.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <FileText className="h-12 w-12 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">表格为空</p>
      </div>
    );
  }

  const currentSheet = sheets[activeSheet];

  return (
    <div className="flex flex-col max-h-[70vh] rounded border border-border overflow-hidden">
      {/* Sheet tabs */}
      {sheets.length > 1 && (
        <div className="flex items-center gap-0.5 px-2 py-1 bg-muted/50 border-b border-border overflow-x-auto shrink-0">
          {sheets.map((sheet, idx) => (
            <button
              key={sheet.name}
              onClick={() => setActiveSheet(idx)}
              className={cn(
                'px-3 py-1 text-xs rounded-t transition-colors whitespace-nowrap',
                idx === activeSheet
                  ? 'bg-background text-foreground font-medium border border-border border-b-0'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              {sheet.name}
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {currentSheet && currentSheet.headers.length > 0 ? (
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted">
                <th className="px-2 py-1.5 text-center font-medium text-muted-foreground border border-border w-10">
                  #
                </th>
                {currentSheet.headers.map((header, i) => (
                  <th
                    key={i}
                    className="px-2 py-1.5 text-left font-medium text-foreground border border-border whitespace-nowrap max-w-[200px] truncate"
                  >
                    {header || `列 ${i + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {currentSheet.rows.map((row, rowIdx) => (
                <tr key={rowIdx} className="hover:bg-muted/30">
                  <td className="px-2 py-1 text-center text-muted-foreground border border-border font-mono">
                    {rowIdx + 1}
                  </td>
                  {currentSheet.headers.map((_, colIdx) => (
                    <td
                      key={colIdx}
                      className="px-2 py-1 border border-border max-w-[300px] truncate"
                      title={row[colIdx] || ''}
                    >
                      {row[colIdx] || ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            此工作表为空
          </div>
        )}
      </div>

      {/* Footer info */}
      {currentSheet && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 border-t border-border text-xs text-muted-foreground shrink-0">
          <span>
            {currentSheet.totalRows > MAX_PREVIEW_ROWS
              ? `显示前 ${MAX_PREVIEW_ROWS} 行（共 ${currentSheet.totalRows} 行）`
              : `共 ${currentSheet.totalRows} 行`}
            {' · '}
            {currentSheet.headers.length} 列
          </span>
          {sheets.length > 1 && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                disabled={activeSheet === 0}
                onClick={() => setActiveSheet((v) => v - 1)}
              >
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <span>
                {activeSheet + 1}/{sheets.length}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                disabled={activeSheet === sheets.length - 1}
                onClick={() => setActiveSheet((v) => v + 1)}
              >
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
