'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useWorkspacesStore } from '@/stores';

interface RenameWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  currentName: string;
  currentDescription?: string | null;
}

export function RenameWorkspaceDialog({
  open,
  onOpenChange,
  workspaceId,
  currentName,
  currentDescription,
}: RenameWorkspaceDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const updateWorkspace = useWorkspacesStore((state) => state.updateWorkspace);

  useEffect(() => {
    if (open) {
      setName(currentName);
      setDescription(currentDescription || '');
      setError(null);
    }
  }, [open, currentName, currentDescription]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('请输入工作空间名称');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await updateWorkspace(workspaceId, name.trim(), description.trim() || undefined);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>重命名工作空间</DialogTitle>
          <DialogDescription>
            修改工作空间的名称和描述。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">名称</label>
            <Input
              placeholder="工作空间名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim()) {
                  void handleSave();
                }
              }}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">描述（可选）</label>
            <Textarea
              placeholder="描述这个工作空间的用途..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={() => void handleSave()} disabled={isSaving || !name.trim()}>
            {isSaving ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
