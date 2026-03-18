'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Key, ArrowRight, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface NoApiConfigPromptProps {
  onNavigateToSettings?: () => void;
}

export function NoApiConfigPrompt({ onNavigateToSettings }: NoApiConfigPromptProps) {
  const router = useRouter();

  const handleGoToSettings = () => {
    if (onNavigateToSettings) {
      onNavigateToSettings();
    } else {
      router.push('/settings?tab=llm-api');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="p-8 text-center">
          <div className="mb-6">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
              <Key className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-2xl font-bold mb-2">需要配置 LLM API</h2>
            <p className="text-muted-foreground">
              在使用 Swarm 之前，您需要配置至少一个 LLM API 提供商
            </p>
          </div>

          <div className="space-y-3 text-sm text-left bg-muted/50 rounded-lg p-4 mb-6">
            <p className="font-medium">支持的提供商：</p>
            <ul className="space-y-1 text-muted-foreground ml-4">
              <li>• Anthropic Claude (推荐)</li>
              <li>• OpenAI GPT</li>
              <li>• DeepSeek</li>
              <li>• 自定义 API</li>
            </ul>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button onClick={handleGoToSettings} className="flex-1 gap-2">
              <Settings className="w-4 h-4" />
              前往设置
              <ArrowRight className="w-4 h-4" />
            </Button>
            <Link href="/dashboard" className="flex-1">
              <Button variant="outline" className="w-full">
                返回首页
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
