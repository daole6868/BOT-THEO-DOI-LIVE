import { Suspense } from 'react';
import { ChatView } from '@/components/ChatView';

export const metadata = { title: 'Tin nhắn' };

export default function MessagesPage() {
  return (
    <Suspense>
      <ChatView />
    </Suspense>
  );
}
