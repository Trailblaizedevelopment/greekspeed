'use client';

import { useState, useEffect, useLayoutEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Connection } from '@/lib/contexts/ConnectionsContext';
import { useAuth } from '@/lib/supabase/auth-context';
import { UserAvatar } from '@/components/features/profile/UserAvatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, MessageSquare, Menu, X, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ClickableAvatar } from '@/components/features/user-profile/ClickableAvatar';
import { ClickableUserName } from '@/components/features/user-profile/ClickableUserName';
import type { MessagingInboxPreview } from '@/types/messagingInbox';

interface MessagesSidebarProps {
  connections: Connection[];
  loading: boolean;
  selectedConnectionId: string | null;
  onConnectionSelect: (connectionId: string) => void;
  onMobileMenuToggle?: () => void;
  isMobile?: boolean;
  isMainView?: boolean;
  sidebarCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onClose?: () => void;
  /** When true, last message previews come from /api/messaging/inbox only (no N+1 refetch / reorder). */
  inboxHydrated?: boolean;
  inboxPreviews?: Record<string, MessagingInboxPreview>;
}

interface LastMessage {
  connectionId: string;
  content: string;
  createdAt: string;
  senderId: string;
  unreadCount?: number;
}

export function MessagesSidebar({
  connections,
  loading,
  selectedConnectionId,
  onConnectionSelect,
  onMobileMenuToggle,
  isMobile = false,
  isMainView = false,
  sidebarCollapsed = false,
  onToggleCollapse,
  onClose,
  inboxHydrated = false,
  inboxPreviews = {},
}: MessagesSidebarProps) {
  const { user, session } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [lastMessages, setLastMessages] = useState<Map<string, LastMessage>>(new Map());

  useLayoutEffect(() => {
    if (!inboxHydrated) return;
    const map = new Map<string, LastMessage>();
    for (const [id, p] of Object.entries(inboxPreviews)) {
      map.set(id, {
        connectionId: id,
        content: p.content,
        createdAt: p.createdAt,
        senderId: p.senderId,
        unreadCount: p.unreadCount,
      });
    }
    setLastMessages(map);
  }, [inboxHydrated, inboxPreviews]);

  // Fetch last message and unread count for each connection
  useEffect(() => {
    if (inboxHydrated) return;
    if (!user || !session || connections.length === 0) return;

    const fetchLastMessages = async () => {
      const messagesMap = new Map<string, LastMessage>();
      
      // Fetch last message and unread count for each connection in parallel
      const promises = connections.map(async (connection) => {
        try {
          // Fetch last message
          const response = await fetch(`/api/messages?connectionId=${connection.id}&page=1&limit=1`, {
            headers: {
              'Authorization': `Bearer ${session.access_token}`
            }
          });
          if (response.ok) {
            const data = await response.json();
            if (data.messages && data.messages.length > 0) {
              const lastMessage = data.messages[0]; // Most recent message (first in descending order)
              
              // Fetch unread count using the dedicated endpoint
              let unreadCount = 0;
              try {
                const unreadResponse = await fetch(`/api/messages/unread-count?connectionId=${connection.id}&userId=${user.id}`, {
                  headers: {
                    'Authorization': `Bearer ${session.access_token}`
                  }
                });
                
                if (unreadResponse.ok) {
                  const unreadData = await unreadResponse.json();
                  unreadCount = unreadData.unreadCount || 0;
                }
              } catch (unreadError) {
                console.error(`Failed to fetch unread count for connection ${connection.id}:`, unreadError);
              }
              
              messagesMap.set(connection.id, {
                connectionId: connection.id,
                content: lastMessage.content,
                createdAt: lastMessage.created_at,
                senderId: lastMessage.sender_id,
                unreadCount
              });
            }
          }
        } catch (error) {
          console.error(`Failed to fetch last message for connection ${connection.id}:`, error);
        }
      });

      await Promise.all(promises);
      setLastMessages(messagesMap);
    };

    fetchLastMessages();
  }, [connections, user, session, inboxHydrated]);

  // Refresh unread count for selected connection when it changes
  useEffect(() => {
    if (!user || !session || !selectedConnectionId) return;

    const refreshUnreadCount = async () => {
      try {
        const unreadResponse = await fetch(`/api/messages/unread-count?connectionId=${selectedConnectionId}&userId=${user.id}`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        });
        
        if (unreadResponse.ok) {
          const unreadData = await unreadResponse.json();
          const unreadCount = unreadData.unreadCount || 0;
          
          // Update the unread count for this connection
          setLastMessages(prev => {
            const updated = new Map(prev);
            const existing = updated.get(selectedConnectionId);
            if (existing) {
              updated.set(selectedConnectionId, {
                ...existing,
                unreadCount
              });
            }
            return updated;
          });
        }
      } catch (error) {
        console.error(`Failed to refresh unread count for connection ${selectedConnectionId}:`, error);
      }
    };

    // Refresh immediately and then periodically while connection is selected
    refreshUnreadCount();
    const interval = setInterval(refreshUnreadCount, 2000); // Refresh every 2 seconds while viewing

    return () => clearInterval(interval);
  }, [selectedConnectionId, user, session]);

  // Filter connections based on search query and status
  const filteredConnections = useMemo(() => {
    if (!user) return [];
    
    return connections.filter(connection => {
      // Only show accepted connections in messages
      if (connection.status !== 'accepted') {
        return false;
      }
      
      const otherUser = connection.requester_id === user.id 
        ? connection.recipient 
        : connection.requester;
      
      return otherUser.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
             otherUser.chapter?.toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [connections, searchQuery, user]);

  // Sort connections by last message time or connection updated_at
  const sortedConnections = useMemo(() => {
    return [...filteredConnections].sort((a, b) => {
      const lastMessageA = lastMessages.get(a.id);
      const lastMessageB = lastMessages.get(b.id);
      
      // Get timestamp for comparison
      const timestampA = lastMessageA 
        ? new Date(lastMessageA.createdAt).getTime()
        : new Date(a.updated_at || a.created_at).getTime();
      
      const timestampB = lastMessageB
        ? new Date(lastMessageB.createdAt).getTime()
        : new Date(b.updated_at || b.created_at).getTime();
      
      // Sort descending (most recent first)
      return timestampB - timestampA;
    });
  }, [filteredConnections, lastMessages]);

  const getOtherUser = (connection: Connection) => {
    if (!user) return connection.requester;
    
    return connection.requester_id === user.id 
      ? connection.recipient 
      : connection.requester;
  };

  const getLastActivity = (connection: Connection) => {
    const lastMessage = lastMessages.get(connection.id);
    if (lastMessage) {
      return lastMessage.createdAt;
    }
    return connection.updated_at || connection.created_at;
  };

  const getLastMessagePreview = (connection: Connection) => {
    const lastMessage = lastMessages.get(connection.id);
    if (!lastMessage || !user) return 'Click to start chatting';
    
    const isFromCurrentUser = lastMessage.senderId === user.id;
    const prefix = isFromCurrentUser ? 'You: ' : '';
    return `${prefix}${lastMessage.content}`;
  };

  // Early return if no user
  if (!user) {
    return (
      <div className={`${isMainView ? 'w-full' : 'w-80'} bg-gray-50 ${isMainView ? '' : 'border-r border-gray-200'} flex flex-col h-full min-h-0`}>
        <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-3">
          {!isMainView && <h2 className="text-lg font-semibold text-gray-900">Messages</h2>}
        </div>
        <div className="flex-1 flex items-center justify-center min-h-0">
          <div className="text-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-primary mx-auto mb-2"></div>
            <p className="text-gray-500">Loading user...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      {!isMainView && (
        <div className="flex-shrink-0 bg-white border-b border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <MessageSquare className="h-5 w-5 text-brand-primary flex-shrink-0" />
              {!sidebarCollapsed && (
                <motion.h2 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-lg font-semibold text-gray-900"
                >
                  Messages
                </motion.h2>
              )}
            </div>
            {!isMobile && (
              <div className="flex items-center space-x-1">
                {onToggleCollapse && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onToggleCollapse}
                    className="h-8 w-8 p-0"
                  >
                    {sidebarCollapsed ? (
                      <ChevronRight className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4 rotate-180" />
                    )}
                  </Button>
                )}
                {onClose && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClose}
                    className="h-8 w-8 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
          </div>
          
          {/* Search - Hide when collapsed */}
          {!sidebarCollapsed && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-3 relative"
            >
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search connections..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-gray-50 border-gray-200 focus:bg-white focus:border-primary-300"
              />
            </motion.div>
          )}
        </div>
      )}

      {/* Search bar for main view on mobile */}
      {isMainView && (
        <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search connections..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-gray-50 border-gray-200 focus:bg-white focus:border-primary-300"
            />
          </div>
        </div>
      )}

      {/* Connections List */}
      <div className={`flex-1 overflow-y-auto ${isMobile && isMainView ? 'pb-20' : ''}`}>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            {sidebarCollapsed ? (
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-primary"></div>
            ) : (
              <>
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-primary"></div>
                <span className="ml-2 text-gray-500">Loading...</span>
              </>
            )}
          </div>
        ) : sortedConnections.length === 0 ? (
          <div className={`text-center py-8 ${sidebarCollapsed ? 'px-2' : 'px-4'}`}>
            {!sidebarCollapsed && (
              <>
                {searchQuery ? (
                  <>
                    <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-500">No connections found</p>
                    <p className="text-sm text-gray-400">Try adjusting your search</p>
                  </>
                ) : (
                  <>
                    <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-500">No connections yet</p>
                    <p className="text-sm text-gray-400">Connect with alumni to start messaging</p>
                  </>
                )}
              </>
            )}
          </div>
        ) : (
          <div className={sidebarCollapsed ? 'py-2 space-y-2' : 'py-2'}>
            {sortedConnections.map((connection) => {
              const otherUser = getOtherUser(connection);
              const isSelected = selectedConnectionId === connection.id;
              const lastActivity = getLastActivity(connection);
              const lastMessagePreview = getLastMessagePreview(connection);
              const lastMessage = lastMessages.get(connection.id);
              const unreadCount = lastMessage?.unreadCount || 0;
              const hasUnread = unreadCount > 0;
              
              if (sidebarCollapsed) {
                // Collapsed view - show only avatar with unread indicator
                return (
                  <div
                    key={connection.id}
                    className={`flex justify-center py-2 cursor-pointer transition-colors ${
                      isSelected ? 'bg-primary-50' : 'hover:bg-gray-100'
                    }`}
                    onClick={() => onConnectionSelect(connection.id)}
                    title={otherUser.full_name}
                  >
                    <div className="relative" onClick={(e) => e.stopPropagation()}>
                      {otherUser.id ? (
                        <ClickableAvatar
                          userId={otherUser.id}
                          avatarUrl={otherUser.avatar_url}
                          fullName={otherUser.full_name}
                          firstName={otherUser.first_name}
                          lastName={otherUser.last_name}
                          size="md"
                          className="relative"
                        />
                      ) : (
                        <UserAvatar
                          user={{ 
                            email: null, 
                            user_metadata: { 
                              avatar_url: otherUser.avatar_url, 
                              full_name: otherUser.full_name 
                            } 
                          }}
                          completionPercent={100}
                          hasUnread={hasUnread}
                          size="md"
                        />
                      )}
                      {/* Unread dot indicator */}
                      {hasUnread && (
                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-brand-primary rounded-full border-2 border-white"></div>
                      )}
                    </div>
                  </div>
                );
              }
              
              // Expanded view - show full connection info
              return (
                <div
                  key={connection.id}
                  className={`px-4 py-3 cursor-pointer transition-colors ${
                    isSelected 
                      ? 'bg-primary-50 border-r-2 border-brand-primary' 
                      : 'hover:bg-gray-100'
                  } ${hasUnread && !isSelected ? 'bg-accent-50/50' : ''}`}
                  onClick={() => onConnectionSelect(connection.id)}
                >
                  <div className="flex items-center space-x-3">
                    {/* Avatar with unread indicator */}
                    <div className="flex-shrink-0 relative" onClick={(e) => e.stopPropagation()}>
                      {otherUser.id ? (
                        <ClickableAvatar
                          userId={otherUser.id}
                          avatarUrl={otherUser.avatar_url}
                          fullName={otherUser.full_name}
                          firstName={otherUser.first_name}
                          lastName={otherUser.last_name}
                          size="md"
                          className="relative"
                        />
                      ) : (
                        <UserAvatar
                          user={{ 
                            email: null, 
                            user_metadata: { 
                              avatar_url: otherUser.avatar_url, 
                              full_name: otherUser.full_name 
                            } 
                          }}
                          completionPercent={100}
                          hasUnread={hasUnread}
                          size="md"
                        />
                      )}
                      {/* Unread dot indicator */}
                      {hasUnread && (
                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-brand-primary rounded-full border-2 border-white"></div>
                      )}
                    </div>
                    
                    {/* User Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          {otherUser.id ? (
                            <ClickableUserName
                              userId={otherUser.id}
                              fullName={otherUser.full_name}
                              className={`font-medium truncate ${
                                isSelected ? 'text-primary-900' : 'text-gray-900'
                              } ${hasUnread ? 'font-semibold' : ''}`}
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <h3 className={`font-medium truncate ${
                              isSelected ? 'text-primary-900' : 'text-gray-900'
                            } ${hasUnread ? 'font-semibold' : ''}`}>
                              {otherUser.full_name}
                            </h3>
                          )}
                          {/* Unread count badge */}
                          {hasUnread && unreadCount > 0 && (
                            <span className="flex-shrink-0 bg-brand-primary text-white text-xs font-semibold rounded-full px-2 py-0.5 min-w-[20px] text-center">
                              {unreadCount > 99 ? '99+' : unreadCount}
                            </span>
                          )}
                        </div>
                        {lastActivity && (
                          <span className={`text-xs flex-shrink-0 ml-2 ${
                            hasUnread ? 'text-brand-primary font-medium' : 'text-gray-400'
                          }`}>
                            {formatDistanceToNow(new Date(lastActivity), { addSuffix: true })}
                          </span>
                        )}
                      </div>
                      
                      <p className="text-sm text-gray-500 truncate">
                        {otherUser.chapter || 'Chapter not specified'}
                      </p>
                      
                      {/* Last message preview */}
                      <p className={`text-xs truncate mt-1 ${
                        hasUnread ? 'text-gray-900 font-medium' : 'text-gray-400'
                      }`}>
                        {lastMessagePreview}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
} 