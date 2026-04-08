'use client';

import { MessageCircle, Heart, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Post } from '@/types/posts';

interface RecentActivityCardProps {
  posts: Post[];
  loading: boolean;
  profileName?: string;
}

function timeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function RecentActivityCard({ posts, loading, profileName }: RecentActivityCardProps) {
  const recentPosts = posts.slice(0, 3);

  if (loading) {
    return (
      <Card className="bg-white rounded-xl shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-900">
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex justify-center py-4">
            <div className="w-5 h-5 border-2 border-gray-200 border-t-brand-primary rounded-full animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (recentPosts.length === 0) {
    return (
      <Card className="bg-white rounded-xl shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-900">
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-gray-500 text-center py-3">
            {profileName ? `${profileName} hasn't posted yet` : 'No recent activity'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white rounded-xl shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-gray-900">
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {recentPosts.map((post) => (
          <div
            key={post.id}
            className="p-3 bg-gray-50 rounded-lg"
          >
            <p className="text-sm text-gray-900 line-clamp-2 mb-1.5">
              {post.content}
            </p>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {timeAgo(post.created_at)}
              </span>
              {(post.likes_count ?? 0) > 0 && (
                <span className="flex items-center gap-1">
                  <Heart className="w-3 h-3" />
                  {post.likes_count}
                </span>
              )}
              {(post.comments_count ?? 0) > 0 && (
                <span className="flex items-center gap-1">
                  <MessageCircle className="w-3 h-3" />
                  {post.comments_count}
                </span>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
