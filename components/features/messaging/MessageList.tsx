'use client';

import { useEffect, useRef, useState } from 'react';
import { Message, ProfileMessageMetadata, EventMessageMetadata } from '@/lib/hooks/useMessages';
import { useAuth } from '@/lib/supabase/auth-context';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UserAvatar } from '@/components/features/profile/UserAvatar';
import { MoreHorizontal, Edit, Trash2, Check, X, User, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import ImageWithFallback from '@/components/figma/ImageWithFallback';
import { useRouter } from 'next/navigation';
import { Calendar, MapPin } from 'lucide-react';
import { MessageBubble } from './MessageBubble';
interface MessageListProps {
  messages: Message[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onEditMessage: (messageId: string, newContent: string) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
}

export function MessageList({
  messages,
  loading,
  hasMore,
  onLoadMore,
  onEditMessage,
  onDeleteMessage
}: MessageListProps) {
  const { user } = useAuth();
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const handleProfileClick = (profileId: string, profileType: 'member' | 'alumni') => {
    if (profileType === 'alumni') {
      router.push(`/dashboard/profile/${profileId}`);
    } else {
      router.push(`/dashboard/profile/${profileId}`);
    }
  };

  // Helper function to extract text content from profile messages
  const getProfileMessageContent = (message: Message) => {
    if (message.message_type !== 'profile' || !message.content) {
      return { hasText: !!message.content, text: message.content || '', isProfileOnly: false };
    }

    const contentTrimmed = message.content.trim();
    const profileMetadata = message.metadata as ProfileMessageMetadata;

    // Check if content is just a URL (starts with http/https)
    const isUrlPattern = /^https?:\/\/.+$/i.test(contentTrimmed);

    // If content contains a profile URL, remove it
    let textWithoutUrl = contentTrimmed;
    if (profileMetadata?.shared_profile_id && isUrlPattern) {
      // Match profile URLs with slug format: /profile/{slug} or /profile/{userId}
      // Also match dashboard profile URLs: /dashboard/profile/{userId}
      // Match the full URL including query parameters
      const profileUrlPatterns = [
        // Match /profile/{slug or userId} with optional query params
        new RegExp(`https?://[^\\s]*/profile/[^\\s]*`, 'gi'),
        // Match /dashboard/profile/{userId} with optional query params (for backward compatibility)
        new RegExp(`https?://[^\\s]*/dashboard/profile/${profileMetadata.shared_profile_id}[^\\s]*`, 'gi'),
      ];

      // Remove all matching profile URL patterns
      profileUrlPatterns.forEach(pattern => {
        textWithoutUrl = textWithoutUrl.replace(pattern, '').trim();
      });
    } else if (isUrlPattern) {
      // If it's just a URL pattern but we don't have profile metadata, treat as empty
      // This handles the case where a profile link URL was sent but metadata is missing
      textWithoutUrl = '';
    }

    return {
      hasText: !!textWithoutUrl,
      text: textWithoutUrl,
      isProfileOnly: !textWithoutUrl && !!profileMetadata
    };
  };

  // Helper function to extract text content from event messages
  const getEventMessageContent = (message: Message) => {
    if (message.message_type !== 'event' || !message.content) {
      return { hasText: !!message.content, text: message.content || '', isEventOnly: false };
    }

    const contentTrimmed = message.content.trim();
    const eventMetadata = message.metadata as EventMessageMetadata;

    // Check if content is just a URL
    const isUrlPattern = /^https?:\/\/.+$/i.test(contentTrimmed);

    let textWithoutUrl = contentTrimmed;
    if (eventMetadata?.shared_event_id && isUrlPattern) {
      const eventUrlPattern = new RegExp(`https?://[^\\s]*/event/[^\\s]*`, 'gi');
      textWithoutUrl = textWithoutUrl.replace(eventUrlPattern, '').trim();
    } else if (isUrlPattern) {
      textWithoutUrl = '';
    }

    return {
      hasText: !!textWithoutUrl,
      text: textWithoutUrl,
      isEventOnly: !textWithoutUrl && !!eventMetadata
    };
  };

  const renderProfileMessage = (metadata: ProfileMessageMetadata, isOwnMessage: boolean, standalone: boolean = false) => {
    const profileMetadata = metadata as ProfileMessageMetadata;

    return (
      <div
        className={`${standalone ? '' : 'mt-2'} p-3 rounded-lg border cursor-pointer transition-colors ${isOwnMessage
          ? standalone
            ? 'bg-accent-50 border-accent-200 hover:bg-accent-100' // More visible when standalone
            : 'bg-white/10 border-white/20 hover:bg-white/20' // Original transparent for inside bubble
          : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
          }`}
        onClick={() => handleProfileClick(profileMetadata.shared_profile_id, profileMetadata.shared_profile_type)}
      >
        <div className="flex items-center space-x-3">
          {profileMetadata.shared_profile_avatar ? (
            <div className={`w-10 h-10 rounded-full overflow-hidden flex-shrink-0 border-2 ${isOwnMessage && standalone
              ? 'border-accent-200'
              : 'border-white/20'
              }`}>
              <ImageWithFallback
                src={profileMetadata.shared_profile_avatar}
                alt={profileMetadata.shared_profile_name}
                width={40}
                height={40}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center flex-shrink-0">
              <User className="w-5 h-5 text-gray-600" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium truncate ${isOwnMessage && standalone
              ? 'text-gray-900' // Dark text for light background
              : isOwnMessage
                ? 'text-white' // White text for transparent background
                : 'text-gray-900'
              }`}>
              {profileMetadata.shared_profile_name}
            </p>
            <p className={`text-xs capitalize ${isOwnMessage && standalone
              ? 'text-gray-500' // Gray text for light background
              : isOwnMessage
                ? 'text-white/70' // Transparent white for transparent background
                : 'text-gray-500'
              }`}>
              {profileMetadata.shared_profile_type}
            </p>
          </div>
        </div>
      </div>
    );
  };

  // Format date for event display
  const formatEventDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'Time TBD';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  // Render event message card
  const renderEventMessage = (metadata: EventMessageMetadata, isOwnMessage: boolean, standalone: boolean = false) => {
    return (
      <div
        className={`${standalone ? '' : 'mt-2'} p-4 rounded-xl border cursor-pointer transition-all hover:shadow-md ${isOwnMessage
          ? standalone
            ? 'bg-gradient-to-br from-accent-50 to-white border-accent-200 hover:border-accent-300'
            : 'bg-white/10 border-white/20 hover:bg-white/20'
          : 'bg-gradient-to-br from-gray-50 to-white border-gray-200 hover:border-gray-300'
          }`}
        onClick={() => router.push(`/event/${metadata.shared_event_id}`)}
      >
        <div className="flex items-start space-x-3">
          {/* Calendar Icon with date badge */}
          <div className="flex-shrink-0">
            <div className="w-12 h-12 rounded-xl bg-brand-primary/10 flex flex-col items-center justify-center">
              <Calendar className="w-5 h-5 text-brand-primary" />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            {/* Event Title */}
            <p className={`text-sm font-semibold truncate ${isOwnMessage && standalone ? 'text-gray-900' : isOwnMessage ? 'text-white' : 'text-gray-900'
              }`}>
              {metadata.shared_event_title}
            </p>

            {/* Date & Location */}
            <div className={`flex items-center gap-2 mt-1 text-xs ${isOwnMessage && standalone ? 'text-gray-500' : isOwnMessage ? 'text-white/70' : 'text-gray-500'
              }`}>
              <Clock className="w-3 h-3" />
              <span>{formatEventDate(metadata.shared_event_start_time)}</span>
            </div>

            {metadata.shared_event_location && (
              <div className={`flex items-center gap-2 mt-0.5 text-xs ${isOwnMessage && standalone ? 'text-gray-500' : isOwnMessage ? 'text-white/70' : 'text-gray-500'
                }`}>
                <MapPin className="w-3 h-3" />
                <span className="truncate">{metadata.shared_event_location}</span>
              </div>
            )}

            {/* View Details indicator */}
            <p className={`text-xs mt-2 font-medium ${isOwnMessage && standalone ? 'text-brand-primary' : isOwnMessage ? 'text-white/80' : 'text-brand-primary'
              }`}>
              Tap to view details →
            </p>
          </div>
        </div>
      </div>
    );
  };

  const getEventUrlFromContent = (content: string) => {
    // Match /event/{uuid} URLs
    const eventUrlPattern = /https?:\/\/[^\s]*\/event\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
    const match = content.match(eventUrlPattern);
    if (match) {
      return {
        fullUrl: match[0],
        eventId: match[1]
      };
    }
    return null;
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleEdit = (message: Message) => {
    setEditingMessageId(message.id);
    setEditContent(message.content ?? '');
  };

  const handleSaveEdit = async () => {
    if (editingMessageId && editContent.trim()) {
      try {
        await onEditMessage(editingMessageId, editContent);
        setEditingMessageId(null);
        setEditContent('');
      } catch (error) {
        console.error('Failed to edit message:', error);
      }
    }
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditContent('');
  };

  const handleDelete = async (messageId: string) => {
    try {
      await onDeleteMessage(messageId);
    } catch (error) {
      console.error('Failed to delete message:', error);
    }
  };

  const groupMessagesByDate = (messages: Message[]) => {
    // CRITICAL: Deduplicate messages by ID first (defensive measure against StrictMode/race conditions)
    const seenIds = new Set<string>();
    const uniqueMessages = messages.filter(message => {
      if (seenIds.has(message.id)) {
        console.warn('Duplicate message detected and filtered:', message.id, message.content.substring(0, 30));
        return false; // Skip duplicate
      }
      seenIds.add(message.id);
      return true;
    });

    // Messages are already in ascending order from API, so we can group directly
    const groups: { [key: string]: Message[] } = {};

    uniqueMessages.forEach(message => {
      const date = new Date(message.created_at).toDateString();
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(message);
    });

    // Sort date groups chronologically (oldest date first, newest date last)
    // Messages within each group are already in order
    return Object.entries(groups)
      .sort(([dateA], [dateB]) =>
        new Date(dateA).getTime() - new Date(dateB).getTime()
      )
      .map(([date, msgs]) => ({
        date,
        messages: msgs // Already sorted from API
      }));
  };

  const messageGroups = groupMessagesByDate(messages);

  // Add event card render function
  const renderEventLink = (eventUrl: string, eventId: string, isOwnMessage: boolean) => {
    return (
      <a
        href={eventUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`block mt-2 p-3 rounded-lg border cursor-pointer transition-colors ${isOwnMessage
          ? 'bg-accent-50 border-accent-200 hover:bg-accent-100'
          : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
          }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg bg-brand-primary/10 flex items-center justify-center flex-shrink-0">
            <Calendar className="w-5 h-5 text-brand-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900">View Event</p>
            <p className="text-xs text-gray-500">Click to open event details</p>
          </div>
        </div>
      </a>
    );
  };

  if (loading && messages.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary mx-auto mb-2"></div>
          <p className="text-gray-500">Loading messages...</p>
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <p className="text-gray-500 text-lg font-medium">No messages yet</p>
          <p className="text-gray-400">Start the conversation by sending a message!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden overscroll-contain p-4">
      {/* Load more button */}
      {hasMore && (
        <div className="flex justify-center mb-4">
          <Button
            onClick={onLoadMore}
            disabled={loading}
            variant="outline"
            size="sm"
            className="text-brand-primary border-primary-200 hover:bg-primary-50"
          >
            {loading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b border-brand-primary mr-2" />
            ) : (
              'Load more messages'
            )}
          </Button>
        </div>
      )}

      {/* Messages */}
      {messageGroups.map(({ date, messages: groupMessages }) => (
        <div key={date} className="space-y-4 mb-6">
          {/* Date separator */}
          <div className="flex items-center justify-center">
            <div className="bg-gray-100 px-3 py-1 rounded-full">
              <span className="text-xs text-gray-500 font-medium">
                {new Date(date).toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </span>
            </div>
          </div>

          {/* Messages in this group */}
          {groupMessages.map((message) => {
            const isOwnMessage = message.sender_id === user?.id;
            const isEditing = editingMessageId === message.id;

            return (
              <div
                key={message.id}
                className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} mb-2`}
              >
                {/* Left side - Avatar and content for received messages */}
                {!isOwnMessage && (
                  <div className="flex items-end space-x-2 max-w-[70%] min-w-0">
                    {/* Avatar */}
                    <div className="flex-shrink-0">
                      <UserAvatar
                        user={{
                          email: null,
                          user_metadata: {
                            avatar_url: message.sender?.avatar_url || null, // Ensure null fallback
                            full_name: message.sender?.full_name || 'Unknown User' // Ensure fallback
                          }
                        }}
                        completionPercent={100}
                        hasUnread={false}
                        size="sm"
                      />
                    </div>

                    {/* Message content */}
                    <div className="flex flex-col min-w-0 flex-1">
                      {/* Sender name */}
                      <span className="text-xs text-gray-500 mb-1 px-2">
                        {message.sender.full_name}
                      </span>

                      {/* Message bubble */}
                      <div className="relative group min-w-0 max-w-full">
                        {isEditing ? (
                          <div className="bg-white border border-primary-200 rounded-lg p-3 shadow-sm">
                            <textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              className="w-full resize-none border-none outline-none text-sm"
                              rows={1}
                              autoFocus
                            />
                            <div className="flex justify-end space-x-2 mt-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={handleCancelEdit}
                                className="h-6 px-2 text-xs"
                              >
                                <X className="w-3 h-3 mr-1" />
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                onClick={handleSaveEdit}
                                className="h-6 px-2 text-xs bg-brand-primary hover:bg-brand-primary-hover"
                              >
                                <Check className="w-3 h-3 mr-1" />
                                Save
                              </Button>
                            </div>
                          </div>
                        ) : (
                          (() => {
                            const isProfileMessage = message.message_type === 'profile' && message.metadata;
                            const isEventMessage = message.message_type === 'event' && message.metadata;

                            // Only extract text for profile/event messages
                            const { hasText: hasProfileText, text: profileText, isProfileOnly } = isProfileMessage
                              ? getProfileMessageContent(message)
                              : { hasText: false, text: '', isProfileOnly: false };

                            const { hasText: hasEventText, text: eventText, isEventOnly } = isEventMessage
                              ? getEventMessageContent(message)
                              : { hasText: false, text: '', isEventOnly: false };

                            // Determine what to show
                            const showText = isEventMessage ? hasEventText : (isProfileMessage ? hasProfileText : !!message.content);
                            const textContent = isEventMessage ? eventText : (isProfileMessage ? profileText : message.content || '');

                            return (
                              <>
                                {/* Event-only or Profile-only: show card only */}
                                {(isEventOnly || isProfileOnly) ? (
                                  <div className="relative group min-w-0 max-w-full">
                                    {isEventOnly && renderEventMessage(message.metadata as EventMessageMetadata, false, true)}
                                    {isProfileOnly && renderProfileMessage(message.metadata as ProfileMessageMetadata, false, true)}
                                  </div>
                                ) : (
                                  <>
                                    {/* Show text bubble if there's text content */}
                                    {showText && textContent && (
                                      <div className="relative group min-w-0 max-w-full">
                                        <MessageBubble variant="incoming">{textContent}</MessageBubble>
                                      </div>
                                    )}
                                    {/* Event card below text */}
                                    {isEventMessage && (
                                      <div className="relative group min-w-0 max-w-full mt-2">
                                        {renderEventMessage(message.metadata as EventMessageMetadata, false, true)}
                                      </div>
                                    )}
                                    {/* Profile card below text */}
                                    {isProfileMessage && (
                                      <div className="relative group min-w-0 max-w-full mt-2">
                                        {renderProfileMessage(message.metadata as ProfileMessageMetadata, false, true)}
                                      </div>
                                    )}
                                  </>
                                )}
                              </>
                            );
                          })()
                        )}
                      </div>

                      {/* Timestamp */}
                      <span className="text-xs text-gray-400 mt-1 px-2">
                        {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                )}

                {/* Right side - Content and avatar for own messages */}
                {isOwnMessage && (
                  <div className="flex items-end space-x-2 max-w-[70%] min-w-0">
                    {/* Message content */}
                    <div className="flex flex-col items-end min-w-0 flex-1">
                      {/* Message bubble */}
                      <div className="relative group">
                        {isEditing ? (
                          <div className="bg-white border border-primary-200 rounded-lg p-3 shadow-sm">
                            <textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              className="w-full resize-none border-none outline-none text-sm"
                              rows={1}
                              autoFocus
                            />
                            <div className="flex justify-end space-x-2 mt-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={handleCancelEdit}
                                className="h-6 px-2 text-xs"
                              >
                                <X className="w-3 h-3 mr-1" />
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                onClick={handleSaveEdit}
                                className="h-6 px-2 text-xs bg-brand-primary hover:bg-brand-primary-hover"
                              >
                                <Check className="w-3 h-3 mr-1" />
                                Save
                              </Button>
                            </div>
                          </div>
                        ) : (
                          (() => {
                            const isProfileMessage = message.message_type === 'profile' && message.metadata;
                            const isEventMessage = message.message_type === 'event' && message.metadata;

                            // Only extract text for profile/event messages
                            const { hasText: hasProfileText, text: profileText, isProfileOnly } = isProfileMessage
                              ? getProfileMessageContent(message)
                              : { hasText: false, text: '', isProfileOnly: false };

                            const { hasText: hasEventText, text: eventText, isEventOnly } = isEventMessage
                              ? getEventMessageContent(message)
                              : { hasText: false, text: '', isEventOnly: false };

                            // Determine what to show
                            const showText = isEventMessage ? hasEventText : (isProfileMessage ? hasProfileText : !!message.content);
                            const textContent = isEventMessage ? eventText : (isProfileMessage ? profileText : message.content || '');

                            return (
                              <>
                                {/* Event-only or Profile-only: show card only */}
                                {(isEventOnly || isProfileOnly) ? (
                                  <div className="relative group min-w-0 max-w-full">
                                    {isEventOnly && renderEventMessage(message.metadata as EventMessageMetadata, true, true)}
                                    {isProfileOnly && renderProfileMessage(message.metadata as ProfileMessageMetadata, true, true)}
                                    {/* Message actions menu for event/profile-only messages */}
                                    <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-6 w-6 p-0 bg-white/90 hover:bg-white shadow-sm"
                                            aria-label="Message actions"
                                          >
                                            <MoreHorizontal className="w-3 h-3" />
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="min-w-[8rem]">
                                          <DropdownMenuItem onClick={() => handleEdit(message)} className="gap-2">
                                            <Edit className="h-4 w-4" />
                                            Edit
                                          </DropdownMenuItem>
                                          <DropdownMenuItem
                                            onClick={() => handleDelete(message.id)}
                                            className="gap-2 text-red-600 hover:bg-red-50 hover:text-red-700"
                                          >
                                            <Trash2 className="h-4 w-4" />
                                            Delete
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    {/* Show text bubble if there's text content - SINGLE RENDER POINT */}
                                    {showText && textContent && (
                                      <div className="relative group min-w-0 max-w-full">
                                        <MessageBubble variant="outgoing">{textContent}</MessageBubble>
                                        {/* Message actions menu */}
                                        <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                          <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-6 w-6 p-0 bg-white/90 hover:bg-white shadow-sm"
                                                aria-label="Message actions"
                                              >
                                                <MoreHorizontal className="w-3 h-3" />
                                              </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="min-w-[8rem]">
                                              <DropdownMenuItem onClick={() => handleEdit(message)} className="gap-2">
                                                <Edit className="h-4 w-4" />
                                                Edit
                                              </DropdownMenuItem>
                                              <DropdownMenuItem
                                                onClick={() => handleDelete(message.id)}
                                                className="gap-2 text-red-600 hover:bg-red-50 hover:text-red-700"
                                              >
                                                <Trash2 className="h-4 w-4" />
                                                Delete
                                              </DropdownMenuItem>
                                            </DropdownMenuContent>
                                          </DropdownMenu>
                                        </div>
                                      </div>
                                    )}
                                    {/* Event card below text */}
                                    {isEventMessage && (
                                      <div className="relative group min-w-0 max-w-full mt-2">
                                        {renderEventMessage(message.metadata as EventMessageMetadata, true, true)}
                                      </div>
                                    )}
                                    {/* Profile card below text */}
                                    {isProfileMessage && (
                                      <div className="relative group min-w-0 max-w-full mt-2">
                                        {renderProfileMessage(message.metadata as ProfileMessageMetadata, true, true)}
                                      </div>
                                    )}
                                  </>
                                )}
                              </>
                            );
                          })()
                        )}
                      </div>

                      {/* Timestamp */}
                      <span className="text-xs text-gray-400 mt-1 px-2">
                        {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
                      </span>
                    </div>

                    {/* Avatar */}
                    <div className="flex-shrink-0">
                      <UserAvatar
                        user={{
                          email: null,
                          user_metadata: {
                            avatar_url: message.sender?.avatar_url || null, // Ensure null fallback
                            full_name: message.sender?.full_name || 'You' // Ensure fallback
                          }
                        }}
                        completionPercent={100}
                        hasUnread={false}
                        size="sm"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {/* Scroll to bottom reference */}
      <div ref={messagesEndRef} />
    </div>
  );
} 