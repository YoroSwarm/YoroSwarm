'use client';

import React from 'react';

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
  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const shouldReset = await onCreate();
    if (shouldReset === false) return;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/30 bg-white/80 shadow-2xl shadow-black/10 backdrop-blur-2xl">
        <div className="border-b border-black/10 bg-gradient-to-br from-white via-white to-neutral-100 px-7 py-6">
          <p className="text-xs font-medium uppercase tracking-[0.32em] text-neutral-500">Swarm Session</p>
          <h2 className="mt-2 text-2xl font-semibold text-neutral-950">开始一个新对话</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-600">
            点击创建后会立即生成一个新的 Lead 会话。你直接开始对话，剩余的编队、拆解和协作由蜂群系统在后台完成。
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-7 py-7">
          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="rounded-3xl border border-black/10 bg-neutral-950 px-5 py-4 text-sm text-white">
            <div className="font-medium">初始化方式</div>
            <div className="mt-2 text-white/75">
              初始仅创建 Team Lead。首条用户消息将作为工作目标输入，Lead 再按需动态扩编 teammate。
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-black/10 px-5 py-3 text-sm font-medium text-neutral-700 transition hover:bg-black/5"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-2xl bg-neutral-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? '创建中...' : '立即开始'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
