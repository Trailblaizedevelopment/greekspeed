'use client';

import { Button } from '@/components/ui/button';
import { MessageCircle, UserCheck } from 'lucide-react';
import { ClickableAvatar } from '@/components/features/user-profile/ClickableAvatar';
import { ClickableUserName } from '@/components/features/user-profile/ClickableUserName';
import { PostCard } from '@/components/features/social/PostCard';

interface ContentFeedSectionProps {
  activeTab: string;
  posts: any[];
  connections: any[];
  postsLoading: boolean;
  connectionsLoading: boolean;
  onMessageClick: (connectionId: string) => void;
  onDeletePost: (postId: string) => void;
  onLikePost: (postId: string) => void;
  onCommentAdded: () => void;
  getConnectionPartner: (connection: any) => any;
}

export function ContentFeedSection({
  activeTab,
  posts,
  connections,
  postsLoading,
  connectionsLoading,
  onMessageClick,
  onDeletePost,
  onLikePost,
  onCommentAdded,
  getConnectionPartner,
}: ContentFeedSectionProps) {
  // Posts Tab Content
  if (activeTab === 'posts') {
    if (postsLoading) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
        </div>
      );
    }

    if (posts.length === 0) {
      return (
        <div className="text-center py-12 px-4">
          <MessageCircle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-lg font-medium text-gray-900 mb-1">No posts yet</p>
          <p className="text-sm text-gray-500">
            You haven't shared any posts yet. Start sharing updates with your chapter!
          </p>
        </div>
      );
    }

    return (
      <div>
        {posts.map((post, index) => (
          <PostCard
            key={post.id}
            post={post}
            onLike={onLikePost}
            onDelete={onDeletePost}
            onCommentAdded={onCommentAdded}
            variant="feed"
            showDivider={index < posts.length - 1}
          />
        ))}
      </div>
    );
  }

  // Connections Tab Content
  if (activeTab === 'connections') {
    if (connectionsLoading) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
        </div>
      );
    }

    if (connections.length === 0) {
      return (
        <div className="text-center py-12 px-4">
          <UserCheck className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-lg font-medium text-gray-900 mb-1">No connections yet</p>
          <p className="text-sm text-gray-500">
            Start connecting with other members!
          </p>
        </div>
      );
    }

    return (
      <div className="divide-y divide-gray-100">
        {connections.map((connection) => {
          const partner = getConnectionPartner(connection);
          if (!partner) return null;

          return (
            <div
              key={connection.id}
              className="p-4 bg-white flex items-center justify-between"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <ClickableAvatar
                  userId={partner.id}
                  avatarUrl={partner.avatar_url}
                  fullName={partner.full_name}
                  firstName={partner.first_name}
                  lastName={partner.last_name}
                  size="lg"
                />
                <div className="flex-1 min-w-0">
                  <ClickableUserName
                    userId={partner.id}
                    fullName={partner.full_name || 'Unknown User'}
                    className="text-gray-900 truncate block"
                  />
                  <p className="text-sm text-gray-500 truncate">
                    {partner?.email || 'No email provided'}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="rounded-full text-brand-primary border-primary-300 hover:bg-primary-50 shrink-0"
                onClick={() => onMessageClick(connection.id)}
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                Message
              </Button>
            </div>
          );
        })}
      </div>
    );
  }

  return null;
}

