'use client';

import { useState, useEffect, useRef } from 'react';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { Message } from '@/lib/hooks/useMessages';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/features/profile/UserAvatar';
import { ArrowLeft } from 'lucide-react';
import { ClickableAvatar } from '@/components/features/user-profile/ClickableAvatar';
import { ClickableUserName } from '@/components/features/user-profile/ClickableUserName';

interface ChatWindowProps {
  messages: Message[];
  loading: boolean;
  hasMore: boolean;
  onSendMessage: (content: string) => Promise<void>;
  onEditMessage: (messageId: string, newContent: string) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onLoadMore: () => void;
  typingUsers: string[];
  disabled?: boolean;
  onBack?: () => void;
  contactName?: string;
  contactAvatarUrl?: string | null;
  contactFullName?: string;
  contactUserId?: string | null;
  contactFirstName?: string | null;
  contactLastName?: string | null;
}

export function ChatWindow({
  messages,
  loading,
  hasMore,
  onSendMessage,
  onEditMessage,
  onDeleteMessage,
  onLoadMore,
  typingUsers,
  disabled = false,
  onBack,
  contactName = "Contact",
  contactAvatarUrl = null,
  contactFullName = "Contact",
  contactUserId = null,
  contactFirstName = null,
  contactLastName = null
}: ChatWindowProps) {
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [appHeaderHeight, setAppHeaderHeight] = useState(0);
  const [bottomNavHeight, setBottomNavHeight] = useState(80);
  const [headerHeight, setHeaderHeight] = useState(60);
  const [inputHeight, setInputHeight] = useState(60);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(typeof window !== 'undefined' && window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Get app header height (the Trailblaize header at the top)
  useEffect(() => {
    const getAppHeaderHeight = () => {
      if (typeof window === 'undefined' || !isMobile) {
        setAppHeaderHeight(0);
        return;
      }

      const appHeader = document.querySelector('header') || 
                       document.querySelector('[data-app-header]') ||
                       document.querySelector('.sticky.top-0');
      
      const height = appHeader?.getBoundingClientRect().height || 56;
      setAppHeaderHeight(height);
    };

    getAppHeaderHeight();
    window.addEventListener('resize', getAppHeaderHeight);
    const timeout = setTimeout(getAppHeaderHeight, 100);
    
    return () => {
      window.removeEventListener('resize', getAppHeaderHeight);
      clearTimeout(timeout);
    };
  }, [isMobile]);

  // Get MobileBottomNavigation height
  useEffect(() => {
    const getBottomNavHeight = () => {
      if (typeof window === 'undefined' || !isMobile) {
        setBottomNavHeight(0);
        return;
      }

      const bottomNav = document.querySelector('[class*="fixed bottom-0"]');
      if (bottomNav) {
        const rect = bottomNav.getBoundingClientRect();
        setBottomNavHeight(rect.height);
      } else {
        setBottomNavHeight(80);
      }
    };

    getBottomNavHeight();
    window.addEventListener('resize', getBottomNavHeight);
    const timeout = setTimeout(getBottomNavHeight, 100);
    
    return () => {
      window.removeEventListener('resize', getBottomNavHeight);
      clearTimeout(timeout);
    };
  }, [isMobile]);

  // Track header and input heights for positioning
  useEffect(() => {
    const updateHeights = () => {
      if (!isMobile) return;
      
      if (headerRef.current) {
        setHeaderHeight(headerRef.current.getBoundingClientRect().height);
      }
      if (inputRef.current) {
        setInputHeight(inputRef.current.getBoundingClientRect().height);
      }
    };

    updateHeights();
    window.addEventListener('resize', updateHeights);
    const timeout = setTimeout(updateHeights, 100);
    
    return () => {
      window.removeEventListener('resize', updateHeights);
      clearTimeout(timeout);
    };
  }, [isMobile, messages]); // Recalculate when messages change (input might resize)

  const handleTyping = () => {
    // This function is called when user types
  };

  const getTypingText = () => {
    if (typingUsers.length === 0) return '';
    
    if (typingUsers.length === 1) {
      return `${typingUsers[0]} is typing...`;
    }
    
    if (typingUsers.length === 2) {
      return `${typingUsers[0]} and ${typingUsers[1]} are typing...`;
    }
    
    return 'Several people are typing...';
  };

  // Calculate top and bottom positions for messages area on mobile
  const messagesTop = isMobile ? appHeaderHeight + headerHeight : undefined;
  const messagesBottom = isMobile ? bottomNavHeight + inputHeight : undefined;

  return (
    // Use full height with proper flex layout, prevent all scrolling
    <div className="h-full flex flex-col bg-white overflow-hidden relative">
      {/* Chat header - fixed below app header on mobile, sticky on desktop */}
      <div 
        ref={headerRef}
        data-chat-header
        className={`flex-shrink-0 bg-white border-b border-gray-200 px-4 py-2.5 z-20 ${
          isMobile 
            ? 'fixed left-0 right-0' 
            : 'sticky top-0'
        }`}
        style={isMobile ? { top: `${appHeaderHeight}px` } : undefined}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {/* Back Button */}
            {onBack && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onBack}
                className="p-2 hover:bg-gray-100"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            
            {/* Contact Info */}
            <div className="flex items-center space-x-3">
              {contactUserId ? (
                <ClickableAvatar
                  userId={contactUserId}
                  avatarUrl={contactAvatarUrl}
                  fullName={contactFullName || contactName}
                  firstName={contactFirstName}
                  lastName={contactLastName}
                  size="md"
                />
              ) : (
                <UserAvatar
                  user={{
                    email: null,
                    user_metadata: {
                      avatar_url: contactAvatarUrl,
                      full_name: contactFullName || contactName
                    }
                  }}
                  completionPercent={100}
                  hasUnread={false}
                  size="md"
                />
              )}
              <div>
                {contactUserId ? (
                  <ClickableUserName
                    userId={contactUserId}
                    fullName={contactName}
                    className="font-medium text-gray-900"
                  />
                ) : (
                  <h3 className="font-medium text-gray-900">{contactName}</h3>
                )}
              </div>
            </div>
          </div>
          
          {/* Typing indicator */}
          {typingUsers.length > 0 && (
            <div className="flex items-center space-x-2">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-brand-primary rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-brand-primary rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-brand-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
              <span className="text-xs text-gray-500">{getTypingText()}</span>
            </div>
          )}
        </div>
      </div>

      {/* Messages area - scrollable, fills space between header and input on mobile */}
      <div 
        ref={messagesContainerRef}
        className={`overflow-y-auto overflow-x-hidden ${
          isMobile ? 'fixed left-0 right-0' : 'flex-1 min-h-0'
        }`}
        style={isMobile ? {
          top: `${messagesTop}px`,
          bottom: `${messagesBottom}px`,
        } : undefined}
      >
        <MessageList
          messages={messages}
          loading={loading}
          hasMore={hasMore}
          onLoadMore={onLoadMore}
          onEditMessage={onEditMessage}
          onDeleteMessage={onDeleteMessage}
        />
      </div>

      {/* Message input - fixed at bottom, positioned right above bottom nav on mobile */}
      <div 
        ref={inputRef}
        data-message-input
        className={`flex-shrink-0 border-t border-gray-200 bg-white ${
          isMobile ? 'fixed left-0 right-0' : ''
        }`}
        style={isMobile ? { bottom: `${bottomNavHeight}px` } : undefined}
      >
        <MessageInput
          onSendMessage={onSendMessage}
          onTyping={handleTyping}
          disabled={disabled}
          placeholder="Type a message..."
        />
      </div>
    </div>
  );
} 