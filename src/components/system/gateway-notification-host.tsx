import { useEffect } from 'react';
import { gateway, useGatewayStore } from '../../application/gateway';
import { toast } from './toast-store';

export function GatewayNotificationHost() {
  const connected = useGatewayStore((s) => s.connected);

  useEffect(() => {
    if (!connected) return;

    const unsubscribe = gateway.subscribe('*', (evt: unknown) => {
      if (!evt || typeof evt !== 'object') return;
      
      const eventRecord = evt as { event?: unknown; payload?: unknown };
      const eventName = eventRecord.event;
      const eventPayload = eventRecord.payload;
      
      if (!eventName || typeof eventName !== 'string') return;
      if (!eventPayload || typeof eventPayload !== 'object') return;

      const payloadObj = eventPayload as Record<string, unknown>;
      
      let shouldAlert = false;
      let title = '系统提示';
      let msg = '';

      if (
        eventName.endsWith('.error') || 
        eventName.includes('fail') || 
        eventName.includes('denied')
      ) {
        shouldAlert = true;
        title = `系统警告 (${eventName})`;
        msg = String(payloadObj.errorMessage || payloadObj.error || payloadObj.message || '操作被拒绝或执行失败');
      } else if (
        payloadObj.state === 'error' || 
        payloadObj.status === 'error' || 
        (typeof payloadObj.error === 'string' && payloadObj.error.length > 0)
      ) {
        shouldAlert = true;
        title = `运行异常 (${eventName})`;
        msg = String(payloadObj.errorMessage || payloadObj.error || payloadObj.message || '后台任务执行发生异常');
      }

      if (shouldAlert && msg) {
        toast.error(title, String(msg));
      }
    });

    return () => {
      unsubscribe();
    };
  }, [connected]);

  return null;
}
