'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { appConfig } from '@/lib/config/app';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

interface CreateSwarmSessionModalProps {
  isOpen: boolean;
  isSubmitting?: boolean;
  error?: string | null;
  onClose: () => void;
  onCreate: () => Promise<boolean | void> | boolean | void;
}

export const CreateSwarmSessionModal: React.FC<CreateSwarmSessionModalProps> = ({
  isOpen,
  isSubmitting = false,
  error = null,
  onClose,
  onCreate,
}) => {
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const shouldReset = await onCreate();
    if (shouldReset === false) return;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="max-w-2xl gap-0 overflow-hidden rounded-[28px] border border-white/30 bg-white/80 p-0 shadow-2xl shadow-black/10 ring-0 backdrop-blur-2xl"
      >
        <DialogHeader className="gap-0 border-b border-black/10 bg-linear-to-br from-white via-white to-neutral-100 px-7 py-6">
          <p className="text-xs font-medium uppercase tracking-[0.32em] text-neutral-500">{appConfig.name} Session</p>
          <DialogTitle className="mt-2 text-2xl font-semibold text-neutral-950">
            开始一个新对话
          </DialogTitle>
          <DialogDescription className="mt-2 max-w-xl text-sm leading-6 text-neutral-600">
            点击创建后会立即生成一个新的 Lead 会话。你直接开始对话，剩余的编队、拆解和协作由蜂群系统在后台完成。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 px-7 py-7">
          {error ? (
            <Alert variant="destructive" className="rounded-2xl border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </Alert>
          ) : null}

          <div className="rounded-3xl border border-black/10 bg-neutral-950 px-5 py-4 text-sm text-white">
            <div className="font-medium">初始化方式</div>
            <div className="mt-2 text-white/75">
              初始仅创建 Team Lead。首条用户消息将作为工作目标输入，Lead 再按需动态扩编 teammate。
            </div>
          </div>

          <DialogFooter className="mx-0 mb-0 flex-row justify-end gap-3 rounded-none border-0 bg-transparent p-0 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="h-auto rounded-2xl border-black/10 px-5 py-3 text-sm font-medium text-neutral-700 hover:bg-black/5"
            >
              取消
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="h-auto rounded-2xl bg-neutral-950 px-5 py-3 text-sm font-medium text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? '创建中...' : '立即开始'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
