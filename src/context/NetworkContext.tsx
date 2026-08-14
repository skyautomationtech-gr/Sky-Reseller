import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Network } from '@capacitor/network';

interface NetworkContextType {
  isOnline: boolean;
  connectionType: string;
  isChecking: boolean;
  showReconnectedBanner: boolean;
  recheckConnection: () => Promise<boolean>;
  setShowReconnectedBanner: (val: boolean) => void;
}

const NetworkContext = createContext<NetworkContextType>({
  isOnline: true,
  connectionType: 'unknown',
  isChecking: false,
  showReconnectedBanner: false,
  recheckConnection: async () => true,
  setShowReconnectedBanner: () => {},
});

export const NetworkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [connectionType, setConnectionType] = useState<string>('unknown');
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [showReconnectedBanner, setShowReconnectedBanner] = useState<boolean>(false);
  
  // Track previous online status to detect transitions (e.g., offline -> online)
  const prevOnlineRef = useRef<boolean>(true);

  const updateOnlineState = (nextOnline: boolean, nextType: string) => {
    const prevOnline = prevOnlineRef.current;
    
    // Detect reconnection transition
    if (!prevOnline && nextOnline) {
      setShowReconnectedBanner(true);
      // Auto-hide the "Back online!" success banner after 4 seconds
      setTimeout(() => {
        setShowReconnectedBanner(false);
      }, 4000);
    }
    
    setIsOnline(nextOnline);
    setConnectionType(nextType);
    prevOnlineRef.current = nextOnline;
  };

  const recheckConnection = async (): Promise<boolean> => {
    setIsChecking(true);
    // Add artificial delay of 600ms for solid visual confirmation/loading feedback
    await new Promise((resolve) => setTimeout(resolve, 600));
    
    let connected = true;
    let type = 'unknown';
    
    try {
      const status = await Network.getStatus();
      connected = status.connected;
      type = status.connectionType;
    } catch (err) {
      connected = navigator.onLine;
      type = navigator.onLine ? 'wifi' : 'none';
    }

    updateOnlineState(connected, type);
    setIsChecking(false);
    return connected;
  };

  useEffect(() => {
    let active = true;
    let statusListener: any = null;

    const initializeNetwork = async () => {
      try {
        const status = await Network.getStatus();
        if (active) {
          updateOnlineState(status.connected, status.connectionType);
        }

        const handle = await Network.addListener('networkStatusChange', (status) => {
          if (active) {
            updateOnlineState(status.connected, status.connectionType);
          }
        });
        if (active) {
          statusListener = handle;
        } else if (handle && typeof handle.remove === 'function') {
          try {
            handle.remove();
          } catch (e) {
            // ignore
          }
        }
      } catch (err) {
        console.warn('Capacitor Network plugin not fully available, using window/navigator fallback:', err);
        if (active) {
          updateOnlineState(navigator.onLine, navigator.onLine ? 'wifi' : 'none');
        }
      }
    };

    initializeNetwork();

    // Web Event Listeners fallback
    const handleOnline = () => {
      if (active) {
        updateOnlineState(true, 'wifi');
      }
    };

    const handleOffline = () => {
      if (active) {
        updateOnlineState(false, 'none');
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Auto-retry every 5 seconds in background if offline to detect connection restoration
    const intervalId = setInterval(async () => {
      if (active && !prevOnlineRef.current) {
        try {
          const status = await Network.getStatus();
          updateOnlineState(status.connected, status.connectionType);
        } catch (err) {
          updateOnlineState(navigator.onLine, navigator.onLine ? 'wifi' : 'none');
        }
      }
    }, 5000);

    return () => {
      active = false;
      clearInterval(intervalId);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (statusListener && typeof statusListener.remove === 'function') {
        statusListener.remove();
      }
    };
  }, []);

  return (
    <NetworkContext.Provider
      value={{
        isOnline,
        connectionType,
        isChecking,
        showReconnectedBanner,
        recheckConnection,
        setShowReconnectedBanner,
      }}
    >
      {children}
    </NetworkContext.Provider>
  );
};

export const useNetwork = () => {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error('useNetwork must be used within a NetworkProvider');
  }
  return context;
};
