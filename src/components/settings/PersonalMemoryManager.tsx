"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import {
  Search,
  Plus,
  Trash2,
  Edit3,
  ChevronRight,
  Calendar,
  Tag,
  Star,
  X,
} from "lucide-react";

type MemoryType = "PERSONAL" | "DREAM" | "EXPERIENCE" | "FACT" | "PREFERENCE";

interface PersonalMemory {
  id: string;
  userId: string;
  workspaceId: string | null;
  title: string;
  content: string;
  memoryType: MemoryType;
  tags: string[];
  importance: number;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface MemoryFormData {
  title: string;
  content: string;
  memoryType: MemoryType;
  tags: string[];
  importance: number;
}

const memoryTypeLabels: Record<MemoryType, string> = {
  PERSONAL: "个人",
  DREAM: "梦境",
  EXPERIENCE: "经验",
  FACT: "事实",
  PREFERENCE: "偏好",
};

const memoryTypeColors: Record<MemoryType, "default" | "secondary" | "destructive" | "outline" | "ghost"> = {
  PERSONAL: "default",
  DREAM: "secondary",
  EXPERIENCE: "outline",
  FACT: "outline",
  PREFERENCE: "secondary",
};

const importanceLabels: Record<number, string> = {
  1: "很低",
  2: "低",
  3: "中",
  4: "高",
  5: "极高",
};

const emptyForm: MemoryFormData = {
  title: "",
  content: "",
  memoryType: "PERSONAL",
  tags: [],
  importance: 3,
};

export function PersonalMemoryManager() {
  const [memories, setMemories] = useState<PersonalMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<MemoryType | "ALL">("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingMemory, setEditingMemory] = useState<PersonalMemory | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [formData, setFormData] = useState<MemoryFormData>(emptyForm);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { confirm, Dialog: ConfirmDialogComponent } = useConfirmDialog();

  const fetchMemories = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterType !== "ALL") params.set("memoryType", filterType);
      if (searchQuery) params.set("query", searchQuery);
      params.set("limit", "100");

      const res = await fetch(`/api/personal-memories?${params}`);
      const data = await res.json();
      if (data.success) {
        setMemories(data.data);
      }
    } catch (err) {
      console.error("Failed to fetch memories:", err);
      toast.error("加载记忆失败");
    } finally {
      setLoading(false);
    }
  }, [filterType, searchQuery]);

  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  const handleCreate = async () => {
    if (!formData.title.trim() || !formData.content.trim()) {
      toast.error("标题和内容不能为空");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/personal-memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("记忆已创建");
        setIsCreateDialogOpen(false);
        setFormData(emptyForm);
        fetchMemories();
      } else {
        toast.error(data.error || "创建失败");
      }
    } catch (err) {
      console.error("Failed to create memory:", err);
      toast.error("创建失败");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingMemory) return;
    if (!formData.title.trim() || !formData.content.trim()) {
      toast.error("标题和内容不能为空");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/personal-memories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingMemory.id, ...formData }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("记忆已更新");
        setEditingMemory(null);
        setFormData(emptyForm);
        fetchMemories();
      } else {
        toast.error(data.error || "更新失败");
      }
    } catch (err) {
      console.error("Failed to update memory:", err);
      toast.error("更新失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (memory: PersonalMemory) => {
    const confirmed = await confirm({
      title: "删除记忆",
      description: `确定要删除「${memory.title}」吗？此操作无法撤销。`,
      confirmLabel: "确认删除",
      cancelLabel: "取消",
      variant: "destructive",
    });

    if (!confirmed) return;

    setDeletingId(memory.id);
    try {
      const res = await fetch(`/api/personal-memories?id=${memory.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        toast.success("记忆已删除");
        if (expandedId === memory.id) setExpandedId(null);
        fetchMemories();
      } else {
        toast.error(data.error || "删除失败");
      }
    } catch (err) {
      console.error("Failed to delete memory:", err);
      toast.error("删除失败");
    } finally {
      setDeletingId(null);
    }
  };

  const openEditDialog = (memory: PersonalMemory) => {
    setEditingMemory(memory);
    setFormData({
      title: memory.title,
      content: memory.content,
      memoryType: memory.memoryType,
      tags: memory.tags || [],
      importance: memory.importance,
    });
  };

  const closeDialog = () => {
    setIsCreateDialogOpen(false);
    setEditingMemory(null);
    setFormData(emptyForm);
    setTagInput("");
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !formData.tags.includes(tag)) {
      setFormData((prev) => ({ ...prev, tags: [...prev.tags, tag] }));
    }
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    setFormData((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tag) }));
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getSourceLabel = (memory: PersonalMemory) => {
    if (memory.relatedEntityType === "swarm_session") return "会话记录";
    return "手动添加";
  };

  const filteredMemories = memories;

  return (
    <>
      <ConfirmDialogComponent />
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <div className="flex-1 flex gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索记忆..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select
              value={filterType}
              onValueChange={(v) => setFilterType(v as MemoryType | "ALL")}
            >
              <SelectTrigger className="w-32">
                <SelectValue placeholder="类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部类型</SelectItem>
                <SelectItem value="PERSONAL">个人</SelectItem>
                <SelectItem value="DREAM">梦境</SelectItem>
                <SelectItem value="EXPERIENCE">经验</SelectItem>
                <SelectItem value="FACT">事实</SelectItem>
                <SelectItem value="PREFERENCE">偏好</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => {
              setFormData(emptyForm);
              setTagInput("");
              setIsCreateDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            新建记忆
          </Button>
        </div>

        {/* Memory List */}
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            加载中...
          </div>
        ) : filteredMemories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <p className="text-sm">{searchQuery || filterType !== "ALL" ? "没有找到匹配的记忆" : "暂无记忆"}</p>
            {!searchQuery && filterType === "ALL" && (
              <p className="text-xs mt-1">点击上方「新建记忆」开始记录</p>
            )}
          </div>
        ) : (
          <div className="grid gap-3">
            <AnimatePresence initial={false}>
              {filteredMemories.map((memory) => (
                <motion.div
                  key={memory.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15 }}
                >
                  <Card
                    className={`cursor-pointer transition-colors hover:bg-accent/20 ${
                      expandedId === memory.id ? "ring-1 ring-primary/50" : ""
                    } ${deletingId === memory.id ? "opacity-50" : ""}`}
                    onClick={() =>
                      setExpandedId(expandedId === memory.id ? null : memory.id)
                    }
                  >
                    <CardContent className="p-3">
                      {/* Header row */}
                      <div className="flex items-start gap-2">
                        <button
                          className="mt-0.5 text-muted-foreground hover:text-foreground transition-colors shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedId(expandedId === memory.id ? null : memory.id);
                          }}
                        >
                          <ChevronRight
                            className={`h-4 w-4 transition-transform duration-200 ${
                              expandedId === memory.id ? "rotate-90" : ""
                            }`}
                          />
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant={memoryTypeColors[memory.memoryType]} className="text-xs">
                              {memoryTypeLabels[memory.memoryType]}
                            </Badge>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Star className="h-3 w-3" />
                              {importanceLabels[memory.importance] || memory.importance}
                            </span>
                          </div>
                          <p className="font-medium text-sm mt-1.5 truncate">{memory.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                            {memory.content}
                          </p>
                        </div>
                        {/* Actions */}
                        <div
                          className="flex items-center gap-1 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => openEditDialog(memory)}
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(memory)}
                            disabled={deletingId === memory.id}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Expanded content */}
                      <div
                        className={`grid transition-all duration-200 ease-in-out ${
                          expandedId === memory.id
                            ? "grid-rows-[1fr] opacity-100"
                            : "grid-rows-[0fr] opacity-0"
                        }`}
                      >
                        <div className="overflow-hidden">
                          <div className="border-t mt-3 pt-3 space-y-3">
                            {/* Tags */}
                            {memory.tags && memory.tags.length > 0 && (
                              <div className="flex items-start gap-1.5">
                                <Tag className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                                <div className="flex flex-wrap gap-1">
                                  {memory.tags.map((tag) => (
                                    <Badge key={tag} variant="outline" className="text-xs h-5">
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            {/* Content */}
                            <div className="bg-muted/40 rounded-lg p-3">
                              <p className="text-sm whitespace-pre-wrap break-words">{memory.content}</p>
                            </div>
                            {/* Meta info */}
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {formatDate(memory.createdAt)}
                              </span>
                              <span>{getSourceLabel(memory)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={closeDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新建记忆</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">标题</label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
                placeholder="记忆标题"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">类型</label>
              <Select
                value={formData.memoryType}
                onValueChange={(v) => setFormData((p) => ({ ...p, memoryType: v as MemoryType }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERSONAL">个人</SelectItem>
                  <SelectItem value="DREAM">梦境</SelectItem>
                  <SelectItem value="EXPERIENCE">经验</SelectItem>
                  <SelectItem value="FACT">事实</SelectItem>
                  <SelectItem value="PREFERENCE">偏好</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">重要性</label>
              <Select
                value={String(formData.importance)}
                onValueChange={(v) => setFormData((p) => ({ ...p, importance: Number(v) }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">很低</SelectItem>
                  <SelectItem value="2">低</SelectItem>
                  <SelectItem value="3">中</SelectItem>
                  <SelectItem value="4">高</SelectItem>
                  <SelectItem value="5">极高</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">内容</label>
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData((p) => ({ ...p, content: e.target.value }))}
                placeholder="详细记录..."
                rows={5}
                className="resize-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">标签</label>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="输入标签后回车添加"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                />
                <Button type="button" variant="outline" size="sm" onClick={addTag}>
                  添加
                </Button>
              </div>
              {formData.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {formData.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="h-6 gap-1 pr-1.5">
                      {tag}
                      <button
                        className="ml-0.5 hover:text-destructive transition-colors"
                        onClick={() => removeTag(tag)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              取消
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingMemory} onOpenChange={closeDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>编辑记忆</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">标题</label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
                placeholder="记忆标题"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">类型</label>
              <Select
                value={formData.memoryType}
                onValueChange={(v) => setFormData((p) => ({ ...p, memoryType: v as MemoryType }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERSONAL">个人</SelectItem>
                  <SelectItem value="DREAM">梦境</SelectItem>
                  <SelectItem value="EXPERIENCE">经验</SelectItem>
                  <SelectItem value="FACT">事实</SelectItem>
                  <SelectItem value="PREFERENCE">偏好</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">重要性</label>
              <Select
                value={String(formData.importance)}
                onValueChange={(v) => setFormData((p) => ({ ...p, importance: Number(v) }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">很低</SelectItem>
                  <SelectItem value="2">低</SelectItem>
                  <SelectItem value="3">中</SelectItem>
                  <SelectItem value="4">高</SelectItem>
                  <SelectItem value="5">极高</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">内容</label>
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData((p) => ({ ...p, content: e.target.value }))}
                placeholder="详细记录..."
                rows={5}
                className="resize-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">标签</label>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="输入标签后回车添加"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                />
                <Button type="button" variant="outline" size="sm" onClick={addTag}>
                  添加
                </Button>
              </div>
              {formData.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {formData.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="h-6 gap-1 pr-1.5">
                      {tag}
                      <button
                        className="ml-0.5 hover:text-destructive transition-colors"
                        onClick={() => removeTag(tag)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              取消
            </Button>
            <Button onClick={handleUpdate} disabled={saving}>
              {saving ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
