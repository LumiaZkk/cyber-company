import { useEffect } from 'react';
import { gateway } from '../../features/backend';
import { useGatewayStore } from '../../features/gateway/store';
import { toast } from '../../features/ui/toast-store';

export function GatewayNotificationHost() {
  const connected = useGatewayStore((s) => s.connected);

  useEffect(() => {
    if (!connected) return;

    const unsubscribe = gateway.subscribe('*', (evt: any) => {
      if (!evt || typeof evt !== 'object') return;
      
      const eventName = evt.event;
      const eventPayload = evt.payload;
      
      if (!eventName || typeof eventName !== 'string') return;
      if (!eventPayload || typeof eventPayload !== 'object') return;

      const payloadObj = eventPayload as Record<string, any>;
      
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
        msg = payloadObj.errorMessage || payloadObj.error || payloadObj.message || '操作被拒绝或执行失败';
      } else if (
        payloadObj.state === 'error' || 
        payloadObj.status === 'error' || 
        (typeof payloadObj.error === 'string' && payloadObj.error.length > 0)
      ) {
        shouldAlert = true;
        title = `运行异常 (${eventName})`;
        msg = payloadObj.errorMessage || payloadObj.error || payloadObj.message || '后台任务执行发生异常';
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
