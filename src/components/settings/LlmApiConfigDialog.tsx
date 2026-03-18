'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { type LlmApiConfig, type LlmProvider } from '@/stores';

interface LlmApiConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config?: LlmApiConfig | null;
  onSave: (data: LlmApiConfigInput) => Promise<void>;
}

interface LlmApiConfigInput {
  provider: LlmProvider;
  name: string;
  apiKey: string;
  baseUrl?: string;
  defaultModel: string;
  maxContextTokens?: number;
  maxOutputTokens?: number;
  temperature?: number;
}

const PROVIDER_OPTIONS: Array<{ value: LlmProvider; label: string; defaultModel: string; defaultBaseUrl: string }> = [
  { value: 'ANTHROPIC', label: 'Anthropic', defaultModel: 'claude-sonnet-4-20250514', defaultBaseUrl: 'https://api.anthropic.com' },
  { value: 'OPENAI', label: 'OpenAI', defaultModel: 'gpt-4o', defaultBaseUrl: 'https://api.openai.com/v1' },
];

const RECENT_MODELS_KEY = 'llm_recent_models';

function getRecentModels(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(RECENT_MODELS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function addRecentModel(model: string) {
  if (typeof window === 'undefined') return;
  try {
    const recent = getRecentModels().filter((m) => m !== model);
    recent.unshift(model);
    const updated = recent.slice(0, 10); // Keep only 10 most recent
    localStorage.setItem(RECENT_MODELS_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage errors
  }
}

export function LlmApiConfigDialog({ open, onOpenChange, config, onSave }: LlmApiConfigDialogProps) {
  const [provider, setProvider] = useState<LlmProvider>('ANTHROPIC');
  const [name, setName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [defaultModel, setDefaultModel] = useState('');
  const [maxContextTokens, setMaxContextTokens] = useState('128000');
  const [maxOutputTokens, setMaxOutputTokens] = useState('4096');
  const [temperature, setTemperature] = useState('0.7');
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const recentModels = getRecentModels();
  const isEditing = !!config;

  // Reset form when dialog opens/closes or config changes
  useEffect(() => {
    if (open) {
      if (config) {
        setProvider(config.provider);
        setName(config.name);
        setApiKey(config.apiKey);
        setBaseUrl(config.baseUrl || '');
        setDefaultModel(config.defaultModel);
        setMaxContextTokens(config.maxContextTokens.toString());
        setMaxOutputTokens(config.maxOutputTokens.toString());
        setTemperature(config.temperature.toString());
      } else {
        const defaultProvider = PROVIDER_OPTIONS[0];
        setProvider(defaultProvider.value);
        setName('');
        setApiKey('');
        setBaseUrl(defaultProvider.defaultBaseUrl);
        setDefaultModel(defaultProvider.defaultModel);
        setMaxContextTokens('128000');
        setMaxOutputTokens('4096');
        setTemperature('0.7');
      }
      setErrors({});
      setIsAdvancedOpen(false);
    }
  }, [open, config]);

  // Update default model and base URL when provider changes (only for new configs)
  const handleProviderChange = (value: LlmProvider) => {
    setProvider(value);
    if (!isEditing) {
      const option = PROVIDER_OPTIONS.find((p) => p.value === value);
      if (option) {
        setDefaultModel(option.defaultModel);
        setBaseUrl(option.defaultBaseUrl);
      }
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = '请输入配置名称';
    }

    if (!apiKey.trim()) {
      newErrors.apiKey = '请输入 API Key';
    }

    if (!baseUrl.trim()) {
      newErrors.baseUrl = '请输入 Base URL';
    }

    if (!defaultModel.trim()) {
      newErrors.defaultModel = '请输入默认模型';
    }

    const maxCtx = parseInt(maxContextTokens, 10);
    if (isNaN(maxCtx) || maxCtx < 1 || maxCtx > 2000000) {
      newErrors.maxContextTokens = '最大上下文必须在 1-2000000 之间';
    }

    const maxOut = parseInt(maxOutputTokens, 10);
    if (isNaN(maxOut) || maxOut < 1 || maxOut > 128000) {
      newErrors.maxOutputTokens = '最大输出必须在 1-128000 之间';
    }

    const temp = parseFloat(temperature);
    if (isNaN(temp) || temp < 0 || temp > 2) {
      newErrors.temperature = '温度必须在 0-2 之间';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    setIsSaving(true);
    try {
      await onSave({
        provider,
        name: name.trim(),
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim() || undefined,
        defaultModel: defaultModel.trim(),
        maxContextTokens: parseInt(maxContextTokens, 10),
        maxOutputTokens: parseInt(maxOutputTokens, 10),
        temperature: parseFloat(temperature),
      });

      // Add to recent models
      addRecentModel(defaultModel.trim());

      onOpenChange(false);
    } catch (error) {
      console.error('Failed to save config:', error);
      setErrors({ form: error instanceof Error ? error.message : '保存失败' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleModelInputChange = (value: string) => {
    setDefaultModel(value);
    setErrors((prev) => ({ ...prev, defaultModel: '' }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? '编辑 LLM API 配置' : '添加 LLM API 配置'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {errors.form && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
              {errors.form}
            </div>
          )}

          {/* Provider */}
          <div className="space-y-2">
            <Label htmlFor="provider">
              提供商 <span className="text-destructive">*</span>
            </Label>
            <Select value={provider} onValueChange={handleProviderChange} disabled={isEditing}>
              <SelectTrigger id="provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">
              配置名称 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setErrors((prev) => ({ ...prev, name: '' }));
              }}
              placeholder="例如: Claude 3.5 Sonnet (主要)"
            />
            {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
          </div>

          {/* API Key */}
          <div className="space-y-2">
            <Label htmlFor="apiKey">
              API Key <span className="text-destructive">*</span>
            </Label>
            <Input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setErrors((prev) => ({ ...prev, apiKey: '' }));
              }}
              placeholder={isEditing ? '留空保持不变' : 'sk-ant-... 或 sk-...'}
            />
            {errors.apiKey && <p className="text-sm text-destructive">{errors.apiKey}</p>}
          </div>

          {/* Base URL */}
          <div className="space-y-2">
            <Label htmlFor="baseUrl">
              Base URL <span className="text-destructive">*</span>
            </Label>
            <Input
              id="baseUrl"
              type="url"
              value={baseUrl}
              onChange={(e) => {
                setBaseUrl(e.target.value);
                setErrors((prev) => ({ ...prev, baseUrl: '' }));
              }}
              placeholder="https://api.example.com/v1"
            />
            {errors.baseUrl && <p className="text-sm text-destructive">{errors.baseUrl}</p>}
          </div>

          {/* Default Model */}
          <div className="space-y-2">
            <Label htmlFor="defaultModel">
              默认模型 <span className="text-destructive">*</span>
            </Label>
            <div className="space-y-2">
              <Input
                id="defaultModel"
                list="recent-models"
                value={defaultModel}
                onChange={(e) => handleModelInputChange(e.target.value)}
                placeholder="claude-sonnet-4-20250514"
              />
              <datalist id="recent-models">
                {recentModels.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
              <p className="text-xs text-muted-foreground">
                常用模型: claude-sonnet-4-20250514, claude-opus-4-20250514, gpt-4o, gpt-4o-mini, deepseek-chat
              </p>
            </div>
            {errors.defaultModel && <p className="text-sm text-destructive">{errors.defaultModel}</p>}
          </div>

          <Separator />

          {/* Advanced Settings */}
          <div className="space-y-4">
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-between"
              onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
            >
              <span>高级设置</span>
              {isAdvancedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>

            {isAdvancedOpen && (
              <div className="space-y-4 pt-4">
                {/* Max Context Tokens */}
                <div className="space-y-2">
                  <Label htmlFor="maxContextTokens">最大上下文 (Tokens)</Label>
                  <Input
                    id="maxContextTokens"
                    type="number"
                    value={maxContextTokens}
                    onChange={(e) => setMaxContextTokens(e.target.value)}
                    min={1}
                    max={2000000}
                  />
                  {errors.maxContextTokens && <p className="text-sm text-destructive">{errors.maxContextTokens}</p>}
                </div>

                {/* Max Output Tokens */}
                <div className="space-y-2">
                  <Label htmlFor="maxOutputTokens">最大输出 (Tokens)</Label>
                  <Input
                    id="maxOutputTokens"
                    type="number"
                    value={maxOutputTokens}
                    onChange={(e) => setMaxOutputTokens(e.target.value)}
                    min={1}
                    max={128000}
                  />
                  {errors.maxOutputTokens && <p className="text-sm text-destructive">{errors.maxOutputTokens}</p>}
                </div>

                {/* Temperature */}
                <div className="space-y-2">
                  <Label htmlFor="temperature">温度</Label>
                  <Input
                    id="temperature"
                    type="number"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value)}
                    min={0}
                    max={2}
                  />
                  {errors.temperature && <p className="text-sm text-destructive">{errors.temperature}</p>}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
