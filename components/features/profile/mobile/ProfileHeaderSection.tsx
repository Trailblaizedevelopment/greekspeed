'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UserAvatar } from '@/components/features/profile/UserAvatar';
import { Edit } from 'lucide-react';
import ImageWithFallback from '@/components/figma/ImageWithFallback';
import { DEFAULT_BANNER_IMAGE } from '@/lib/constants';

interface ProfileHeaderSectionProps {
  profile: any;
  connectionsCount: number;
  onEditClick: () => void;
  /** Shown to the right of Edit Profile (e.g. alumni chapter invite). */
  secondaryAction?: ReactNode;
  completion?: { percentage: number } | null;
  recentConnections?: Array<{
    id: string;
    avatar_url?: string | null;
    full_name?: string;
    first_name?: string;
    last_name?: string;
  }>;
}

export function ProfileHeaderSection({
  profile,
  connectionsCount,
  onEditClick,
  secondaryAction,
  completion,
  recentConnections = [],
}: ProfileHeaderSectionProps) {
  if (!profile) return null;

  // Get up to 3 most recent connections for avatar display
  const displayConnections = recentConnections.slice(0, 3);

  return (
    <div className="bg-white border-b border-gray-200">
      {/* Banner Section */}
      <div className="relative w-full h-32 overflow-hidden">
        <img
          src={profile.banner_url || DEFAULT_BANNER_IMAGE}
          alt="Profile banner"
          className="w-full h-full object-cover"
        />
      </div>

      {/* Profile Info Section */}
      <div className="px-4 pb-4">
        {/* Avatar - Positioned to overlap banner */}
        <div className="flex justify-center -mt-12 mb-3">
          <div className="relative">
            <UserAvatar
              user={{
                user_metadata: {
                  avatar_url: profile.avatar_url,
                  full_name: profile.full_name,
                },
              }}
              completionPercent={completion?.percentage || 0}
              hasUnread={false}
              size="lg"
            />
            {completion && completion.percentage < 100 && (
              <div className="absolute -bottom-1.5 -right-3">
                <Badge className="text-brand-primary border-brand-primary border-opacity-80 text-xs px-1.5 py-0.5">
                  {completion.percentage}%
                </Badge>
              </div>
            )}
          </div>
        </div>

        {/* Name and Chapter */}
        <div className="text-center mb-3">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">
            {profile.full_name || 'User Name'}
          </h1>
          <p className="text-sm text-gray-600">
            {profile.chapter || 'Chapter'}
          </p>
          {profile.role && (
            <p className="text-xs text-gray-500 mt-1 capitalize">
              {profile.role.replace('_', ' ')}
            </p>
          )}
        </div>

        {/* Bio */}
        {profile.bio && (
          <div className="mb-3">
            <p className="text-sm text-gray-700 text-center leading-relaxed">
              {profile.bio}
            </p>
          </div>
        )}

        {/* Connection Count with Avatars */}
        <div className="flex justify-center mb-4">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            {/* Connection Avatars */}
            {displayConnections.length > 0 && (
              <div className="flex -space-x-1">
                {displayConnections.map((connection, i) => {
                  const name = connection.full_name || 
                    `${connection.first_name || ''} ${connection.last_name || ''}`.trim() || 
                    'Unknown';
                  const initials = name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2);

                  return (
                    <div
                      key={connection.id || `connection-${i}`}
                      className="w-6 h-6 rounded-full border-2 border-white overflow-hidden bg-gray-200 relative z-10"
                      style={{ zIndex: 10 - i }}
                      title={name}
                    >
                      {connection.avatar_url ? (
                        <ImageWithFallback
                          src={connection.avatar_url}
                          alt={name}
                          width={24}
                          height={24}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center">
                          <span className="text-white text-xs font-medium">
                            {initials || '?'}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {/* Connection Count Text */}
            <div className="flex items-center gap-1">
              <span className="font-medium">{connectionsCount}</span>
              <span>connections</span>
            </div>
          </div>
        </div>

        {/* Edit Profile (+ optional alumni invite) */}
        <div
          className={
            secondaryAction
              ? 'flex flex-row items-stretch justify-center gap-2 max-w-md mx-auto'
              : 'flex justify-center'
          }
        >
          <Button
            onClick={onEditClick}
            variant="outline"
            className={
              secondaryAction
                ? 'min-w-0 flex-1 rounded-full text-brand-primary border-brand-primary hover:bg-primary-50 h-10 text-sm sm:text-base px-3 sm:px-6'
                : 'mx-auto rounded-full text-brand-primary border-brand-primary hover:bg-primary-50 h-10 text-base px-6'
            }
          >
            <Edit className="w-5 h-5 mr-2 shrink-0" />
            Edit Profile
          </Button>
          {secondaryAction ? (
            <div className="min-w-0 flex-1 [&_button]:w-full [&_button]:h-10 [&_button]:text-sm sm:[&_button]:text-base">
              {secondaryAction}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

