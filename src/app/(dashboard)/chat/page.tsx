'use client';

import { useSearchParams } from 'next/navigation';
import { ChatLayout } from '@/components/chat/ChatLayout';

export default function ChatPage() {
  const searchParams = useSearchParams();
  const initialSessionId = searchParams.get('sessionId');

  return <ChatLayout initialSessionId={initialSessionId} />;
}
