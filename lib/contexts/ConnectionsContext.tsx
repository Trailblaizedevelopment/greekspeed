'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/supabase/auth-context';

export interface Connection {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'blocked';
  message?: string;
  created_at: string;
  updated_at: string;
  // Add profile information
  requester: {
    id: string;
    full_name: string;
    first_name: string | null;
    last_name: string | null;
    chapter: string | null;
    avatar_url: string | null;
  };
  recipient: {
    id: string;
    full_name: string;
    first_name: string | null;
    last_name: string | null;
    chapter: string | null;
    avatar_url: string | null;
  };
}

interface ConnectionsContextType {
  connections: Connection[];
  loading: boolean;
  error: string | null;
  sendConnectionRequest: (recipientId: string, message?: string) => Promise<any>;
  updateConnectionStatus: (connectionId: string, status: 'accepted' | 'declined' | 'blocked') => Promise<any>;
  cancelConnectionRequest: (connectionId: string) => Promise<void>;
  getConnectionStatus: (otherUserId: string) => 'none' | 'pending_sent' | 'pending_received' | 'accepted' | 'declined' | 'blocked';
  getConnectionId: (otherUserId: string) => string | null;
  refreshConnections: () => Promise<void>;
}

const ConnectionsContext = createContext<ConnectionsContextType | undefined>(undefined);

export function ConnectionsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use useRef to store stable function reference
  const fetchConnectionsRef = useRef<(() => Promise<void>) | null>(null);

  const fetchConnections = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/connections?userId=${user.id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch connections');
      }
      
      const data = await response.json();
      setConnections(data.connections || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch connections');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Store the latest fetchConnections in ref
  fetchConnectionsRef.current = fetchConnections;

  // Wrap other functions that use fetchConnections with useCallback
  const sendConnectionRequest = useCallback(async (recipientId: string, message?: string) => {
    if (!user) throw new Error('User not authenticated');
    
    try {
      const response = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesterId: user.id,
          recipientId,
          message
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send connection request');
      }
      
      const data = await response.json();
      // Use ref to call the latest function
      if (fetchConnectionsRef.current) {
        await fetchConnectionsRef.current();
      }
      return data.connection;
    } catch (err) {
      throw err;
    }
  }, [user]);

  const updateConnectionStatus = useCallback(async (connectionId: string, status: 'accepted' | 'declined' | 'blocked') => {
    try {
      const response = await fetch(`/api/connections/${connectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update connection');
      }
      
      const data = await response.json();
      // Use ref to call the latest function
      if (fetchConnectionsRef.current) {
        await fetchConnectionsRef.current();
      }
      return data.connection;
    } catch (err) {
      throw err;
    }
  }, []);

  const cancelConnectionRequest = useCallback(async (connectionId: string) => {
    try {
      const response = await fetch(`/api/connections/${connectionId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to cancel connection request');
      }
      
      // Use ref to call the latest function
      if (fetchConnectionsRef.current) {
        await fetchConnectionsRef.current();
      }
    } catch (err) {
      throw err;
    }
  }, []);

  const getConnectionStatus = useCallback((otherUserId: string): 'none' | 'pending_sent' | 'pending_received' | 'accepted' | 'declined' | 'blocked' => {
    if (!user || !connections.length) return 'none';
    
    const connection = connections.find(conn => 
      (conn.requester_id === user.id && conn.recipient_id === otherUserId) ||
      (conn.requester_id === otherUserId && conn.recipient_id === user.id)
    );
    
    if (!connection) return 'none';
    
    if (connection.status === 'pending') {
      return connection.requester_id === user.id ? 'pending_sent' : 'pending_received';
    }
    
    return connection.status as 'accepted' | 'declined' | 'blocked';
  }, [user, connections]);

  const getConnectionId = useCallback((otherUserId: string): string | null => {
    if (!user || !connections.length) return null;
    
    const connection = connections.find(conn => 
      (conn.requester_id === user.id && conn.recipient_id === otherUserId) ||
      (conn.requester_id === otherUserId && conn.recipient_id === user.id)
    );
    
    return connection?.id || null;
  }, [user, connections]);

  useEffect(() => {
    if (!user?.id) return;
    if (fetchConnectionsRef.current) {
      fetchConnectionsRef.current();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const value = {
    connections,
    loading,
    error,
    sendConnectionRequest,
    updateConnectionStatus,
    cancelConnectionRequest,
    getConnectionStatus,
    getConnectionId,
    refreshConnections: fetchConnections
  };

  return (
    <ConnectionsContext.Provider value={value}>
      {children}
    </ConnectionsContext.Provider>
  );
}

export function useConnections() {
  const context = useContext(ConnectionsContext);
  if (context === undefined) {
    throw new Error('useConnections must be used within a ConnectionsProvider');
  }
  return context;
}
