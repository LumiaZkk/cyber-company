import { useEffect } from 'react';
import { gateway } from '../backend';

export function useGatewayEvent(
  eventType: string, 
  handler: (payload: unknown) => void
) {
  useEffect(() => {
    // Since we don't have one, let's implement a simple observer pattern in Client
    // Wait, let's just expose a subscribe method on gateway.
    
    // As a simple workaround for the singleton limitation on events:
    const unsubscribe = gateway.subscribe(eventType, handler);
    return () => unsubscribe();
    
  }, [eventType, handler]);
}
