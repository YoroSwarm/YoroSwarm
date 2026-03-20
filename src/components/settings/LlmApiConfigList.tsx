'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Key,
  GripVertical,
  Edit,
  Trash2,
  Plus,
  AlertCircle,
} from 'lucide-react';
import { useLlmConfigsStore, type LlmApiConfig } from '@/stores';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LlmApiConfigDialog, type LlmApiConfigInput } from './LlmApiConfigDialog';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';

interface SortableConfigItemProps {
  config: LlmApiConfig;
  onEdit: (config: LlmApiConfig) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
}

function SortableConfigItem({ config, onEdit, onDelete, onToggle }: SortableConfigItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: config.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const getProviderColor = (provider: string) => {
    switch (provider) {
      case 'ANTHROPIC':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100';
    }
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <Card
        className={`transition-all ${!config.isEnabled ? 'opacity-60' : ''}`}
      >
        <CardContent className="p-2.5">
          <div className="flex items-center gap-2">
            {/* Drag Handle */}
            <button
              className="cursor-grab active:cursor-grabbing p-1 hover:bg-accent rounded transition-colors"
              {...listeners}
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </button>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-sm truncate">{config.name}</span>
                <Badge className={`${getProviderColor(config.provider)} text-xs px-1.5 py-0`}>
                  {config.provider}
                </Badge>
                {!config.isEnabled && (
                  <Badge variant="outline" className="text-muted-foreground text-xs px-1.5 py-0">
                    已禁用
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                <span className="truncate">{config.defaultModel}</span>
                <span>•</span>
                <span className="truncate">{config.apiKey}</span>
              </div>
            </div>

            {/* Enable Toggle */}
            <Switch
              checked={config.isEnabled}
              onCheckedChange={(checked) => onToggle(config.id, checked)}
            />

            {/* Actions */}
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onEdit(config)}
                className="h-7 w-7"
              >
                <Edit className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(config.id)}
                className="h-7 w-7 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface LlmApiConfigListProps {
  onHasConfigChange?: (hasConfig: boolean) => void;
}

export function LlmApiConfigList({ onHasConfigChange }: LlmApiConfigListProps) {
  const {
    configs,
    isLoading,
    hasConfig,
    loadConfigs,
    createConfig,
    updateConfig,
    deleteConfig,
    reorderLeadConfigs,
    reorderTeammateConfigs,
    toggleConfig,
  } = useLlmConfigsStore();

  const [editingConfig, setEditingConfig] = useState<LlmApiConfig | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'lead' | 'teammate'>('lead');

  // 确认对话框
  const { confirm, Dialog: ConfirmDialogComponent } = useConfirmDialog();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Load configs on mount
  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  // Sort configs based on active tab
  const sortedConfigs = [...configs].sort((a, b) => {
    if (activeTab === 'lead') {
      return a.leadPriority - b.leadPriority;
    }
    return a.teammatePriority - b.teammatePriority;
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = sortedConfigs.findIndex((c) => c.id === active.id);
      const newIndex = sortedConfigs.findIndex((c) => c.id === over.id);

      const reordered = arrayMove(sortedConfigs, oldIndex, newIndex);

      if (activeTab === 'lead') {
        const configsForApi = reordered.map((c, index) => ({
          id: c.id,
          leadPriority: index,
        }));
        reorderLeadConfigs(configsForApi);
      } else {
        const configsForApi = reordered.map((c, index) => ({
          id: c.id,
          teammatePriority: index,
        }));
        reorderTeammateConfigs(configsForApi);
      }
    }
  };

  const handleCreate = async (data: LlmApiConfigInput) => {
    // Ensure required fields for creation
    await createConfig({
      provider: data.provider,
      name: data.name,
      apiKey: data.apiKey || '',
      baseUrl: data.baseUrl || '',
      defaultModel: data.defaultModel,
      maxContextTokens: data.maxContextTokens,
      maxOutputTokens: data.maxOutputTokens,
      temperature: data.temperature,
      authMode: data.authMode,
      customHeaders: data.customHeaders,
    });
    setIsDialogOpen(false);
    onHasConfigChange?.(true);
  };

  const handleUpdate = async (id: string, data: Parameters<typeof updateConfig>[1]) => {
    await updateConfig(id, data);
    setEditingConfig(null);
    setIsDialogOpen(false);
  };

  const handleDelete = async (id: string) => {
    const config = configs.find((c) => c.id === id);
    if (!config) return;

    // Check if this is the last enabled config
    const enabledCount = configs.filter((c) => c.isEnabled).length;
    if (config.isEnabled && enabledCount <= 1) {
      toast.error('无法删除最后一个启用的配置，请先启用其他配置');
      return;
    }

    const confirmed = await confirm({
      title: '确认删除',
      description: '确定要删除此 API 配置吗？此操作无法撤销。',
      confirmLabel: '删除',
      cancelLabel: '取消',
      variant: 'destructive',
    });

    if (confirmed) {
      await deleteConfig(id);

      // Update parent callback
      const enabledCount = configs.filter((c) => c.isEnabled && c.id !== id).length;
      onHasConfigChange?.(enabledCount > 0);
    }
  };

  const handleToggle = async (id: string, isEnabled: boolean) => {
    // Check if disabling the last enabled config
    if (!isEnabled) {
      const enabledCount = configs.filter((c) => c.isEnabled && c.id !== id).length;
      if (enabledCount === 0) {
        toast.error('无法禁用最后一个启用的配置，请先启用其他配置');
        return;
      }
    }

    await toggleConfig(id, isEnabled);
    onHasConfigChange?.(isEnabled);
  };

  const handleEdit = (config: LlmApiConfig) => {
    setEditingConfig(config);
    setIsDialogOpen(true);
  };

  const handleAddNew = () => {
    setEditingConfig(null);
    setIsDialogOpen(true);
  };

  return (
    <>
      <ConfirmDialogComponent />
      <div className="space-y-3">
        {/* Header - Actions */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            配置您的 LLM API 提供商，分别为 Lead 和 Teammate 排序
          </p>
          <Button onClick={handleAddNew} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            添加配置
          </Button>
        </div>

        {/* Configs List */}
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            加载中...
          </div>
        ) : configs.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <Key className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <h4 className="text-base font-semibold mb-1.5">暂无 LLM API 配置</h4>
              <p className="text-sm text-muted-foreground mb-3">
                您需要配置至少一个 LLM API 才能使用系统
              </p>
              <Button onClick={handleAddNew} size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                添加配置
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'lead' | 'teammate')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="lead">Lead 优先级</TabsTrigger>
              <TabsTrigger value="teammate">Teammate 优先级</TabsTrigger>
            </TabsList>
            <TabsContent value="lead" className="mt-3">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={sortedConfigs.map((c) => c.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-1.5">
                    {sortedConfigs.map((config) => (
                      <SortableConfigItem
                        key={config.id}
                        config={config}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        onToggle={handleToggle}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </TabsContent>
            <TabsContent value="teammate" className="mt-3">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={sortedConfigs.map((c) => c.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-1.5">
                    {sortedConfigs.map((config) => (
                      <SortableConfigItem
                        key={config.id}
                        config={config}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        onToggle={handleToggle}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </TabsContent>
          </Tabs>
        )}

        {/* Warning when no enabled configs */}
        {configs.length > 0 && !hasConfig && (
          <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
            <CardContent className="p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div>
                  <p className="font-medium text-sm text-amber-900 dark:text-amber-100">
                    没有启用的 API 配置
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    至少需要启用一个 LLM API 配置才能创建会话
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <LlmApiConfigDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        config={editingConfig}
        onSave={editingConfig ? (data) => handleUpdate(editingConfig.id, data) : handleCreate}
      />
    </>
  );
}
