'use client';

import React, { useState } from 'react';

interface CreateSwarmSessionModalProps {
  isOpen: boolean;
  isSubmitting?: boolean;
  onClose: () => void;
  onCreate: (sessionData: {
    name: string;
    description: string;
    sessionGoal: string;
  }) => Promise<void> | void;
}

export const CreateSwarmSessionModal: React.FC<CreateSwarmSessionModalProps> = ({
  isOpen,
  isSubmitting = false,
  onClose,
  onCreate,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sessionGoal, setSessionGoal] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onCreate({
      name: name.trim(),
      description: description.trim(),
      sessionGoal: sessionGoal.trim(),
    });
    setName('');
    setDescription('');
    setSessionGoal('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/30 bg-white/80 shadow-2xl shadow-black/10 backdrop-blur-2xl">
        <div className="border-b border-black/10 bg-gradient-to-br from-white via-white to-neutral-100 px-7 py-6">
          <p className="text-xs font-medium uppercase tracking-[0.32em] text-neutral-500">Swarm Session</p>
          <h2 className="mt-2 text-2xl font-semibold text-neutral-950">创建新的 Team Lead 会话</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-600">
            创建后会自动生成 Team Lead 与默认 teammates，用于信息搜集、文档撰写、分析和代码执行。
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-7 py-7">
          <div className="grid gap-5 md:grid-cols-2">
            <label className="space-y-2 text-sm text-neutral-700">
              <span className="font-medium">会话名称</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：品牌调研与提案生成"
                className="w-full rounded-2xl border border-black/10 bg-white/80 px-4 py-3 text-neutral-950 outline-none transition focus:border-black/30 focus:ring-4 focus:ring-black/5"
                required
              />
            </label>

            <label className="space-y-2 text-sm text-neutral-700">
              <span className="font-medium">主目标</span>
              <input
                type="text"
                value={sessionGoal}
                onChange={(e) => setSessionGoal(e.target.value)}
                placeholder="例如：输出竞品分析、PPT 大纲和执行方案"
                className="w-full rounded-2xl border border-black/10 bg-white/80 px-4 py-3 text-neutral-950 outline-none transition focus:border-black/30 focus:ring-4 focus:ring-black/5"
              />
            </label>
          </div>

          <label className="block space-y-2 text-sm text-neutral-700">
            <span className="font-medium">会话说明</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder="描述用户要完成的办公任务、交付物和关注重点。"
              className="w-full rounded-3xl border border-black/10 bg-white/80 px-4 py-3 text-neutral-950 outline-none transition focus:border-black/30 focus:ring-4 focus:ring-black/5"
            />
          </label>

          <div className="rounded-3xl border border-black/10 bg-neutral-950 px-5 py-4 text-sm text-white">
            <div className="font-medium">默认编队</div>
            <div className="mt-2 text-white/75">
              Team Lead, Researcher, Documenter, Analyst, Builder
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
              {isSubmitting ? '创建中...' : '创建 Swarm 会话'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
