'use client';

import { useUserPosts } from '@/lib/hooks/useUserPosts';
import { PostCard } from '@/components/features/social/PostCard';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Lock } from 'lucide-react';

interface PostsTabProps {
  userId: string;
  isOwnProfile?: boolean;
  onDeletePost?: (postId: string) => void;
  requireAuth?: boolean;
  isLoggedIn?: boolean;
  profileName?: string;
}

export function PostsTab({ 
  userId, 
  isOwnProfile = false, 
  onDeletePost,
  requireAuth = false,
  isLoggedIn = false,
  profileName
}: PostsTabProps) {
  const { posts, loading, error, likePost, deletePost, refetch } = useUserPosts(userId);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);

  // Show sign-up wall if auth is required and user is not logged in
  if (requireAuth && !isLoggedIn) {
    return (
      <div className="flex flex-col items-center justify-center px-4">
        <div className="max-w-md text-center">
          <div className="flex justify-center mb-4 pt-4 sm:pt-0">
            <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{
              background: 'linear-gradient(135deg, #e5e7eb 0%, #fff 100%)'
            }}>
              <Lock className="h-8 w-8 text-slate-600" />
            </div>
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Sign in to engage
          </h3>
          <p className="text-gray-600 mb-6">
            Create an account or sign in to view {profileName || 'this user'}'s posts and activity.
          </p>
          <div className="flex gap-3 justify-center">
            <Link href="/sign-in">
              <Button variant="outline" className="px-6 rounded-full" 
              style={{
              background: 'linear-gradient(135deg, #e5e7eb 0%, #fff 100%)' 
              }}>
                Sign In
              </Button>
            </Link>
            <Link href="/sign-up">
              <Button
                className="text-white px-6 rounded-full bg-brand-primary hover:bg-brand-primary-hover"
              >
                Join Trailblaize
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const handleLike = async (postId: string) => {
    await likePost(postId);
  };

  const handleDelete = async (postId: string) => {
    const success = await deletePost(postId);
    if (success && onDeletePost) {
      onDeletePost(postId);
    }
  };

  const handleCommentAdded = () => {
    // Refresh posts to get updated comment counts
    refetch();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading posts...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12 px-4">
        <div className="text-center">
          <p className="text-red-600 mb-2">Error loading posts</p>
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 px-4">
        <div className="text-center">
          <p className="text-gray-500 text-lg mb-2">No posts yet</p>
          <p className="text-gray-400 text-sm">Posts will appear here when they're shared</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {posts.map((post, index) => (
        <PostCard
          key={post.id}
          post={post}
          onLike={handleLike}
          onDelete={isOwnProfile ? handleDelete : undefined}
          onCommentAdded={handleCommentAdded}
          isExpanded={expandedPostId === post.id}
          onToggleExpand={() => {
            setExpandedPostId((prev) => (prev === post.id ? null : post.id));
          }}
          variant="feed"
          showDivider={index < posts.length - 1}
        />
      ))}
    </div>
  );
}

