'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function UnsubscribeButton({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function unsubscribe() {
    setState('busy');
    const response = await fetch('/api/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setState('error');
      setMessage(body.error ?? 'Something went wrong. Reply to the email and we will take you off the list.');
      return;
    }
    setState('done');
    setMessage(`Done - ${body.shop} won't get update emails any more.`);
  }

  if (state === 'done' || state === 'error') {
    return <p className={state === 'error' ? 'text-sm text-destructive' : 'text-sm'}>{message}</p>;
  }
  return (
    <Button onClick={unsubscribe} disabled={state === 'busy'}>
      {state === 'busy' ? 'Unsubscribing…' : 'Unsubscribe'}
    </Button>
  );
}
