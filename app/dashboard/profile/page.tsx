'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { User, Mail, MapPin, Building, Shield, FileText, Phone, MessageCircle, Users, Calendar, Settings, Edit, UserCheck, UserPlus, Lock, Upload, Heart, Trash2, X, Linkedin, Copy, Check, ExternalLink, Clock } from 'lucide-react';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { useConnections } from '@/lib/contexts/ConnectionsContext';
import { useAuth } from '@/lib/supabase/auth-context';
import { UserAvatar } from '@/components/features/profile/UserAvatar';
import { ProfileService } from '@/lib/services/profileService';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useChapterMembers } from '@/lib/hooks/useChapterMembers';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { AvatarService } from '@/lib/services/avatarService';
import { BannerService } from '@/lib/services/bannerService';
import { DEFAULT_BANNER_IMAGE } from '@/lib/constants';
import { useUserPosts } from '@/lib/hooks/useUserPosts';
import { formatDistanceToNow } from 'date-fns';
import { DeletePostModal } from '@/components/features/social/DeletePostModal';
import { EmailService } from '@/lib/services/emailService';
import { useModal } from '@/lib/contexts/ModalContext';
import { Save, AlertTriangle } from 'lucide-react';
import ImageWithFallback from '@/components/figma/ImageWithFallback';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MobileBottomNavigation } from '@/components/features/dashboard/dashboards/ui/MobileBottomNavigation';
import { ProfileHeaderSection } from '@/components/features/profile/mobile/ProfileHeaderSection';
import { ContentNavigationTabs } from '@/components/features/profile/mobile/ContentNavigationTabs';
import { ContentFeedSection } from '@/components/features/profile/mobile/ContentFeedSection';
import { PostCard } from '@/components/features/social/PostCard';
import { ConnectionRequestDialog } from '@/components/features/connections/ConnectionRequestDialog';
import { formatLocationLineForApp } from '@/types/canonicalPlace';

// Add a helper function to format system roles for display (add this near the top of the component, after other helper functions)
const formatSystemRole = (role: string | null | undefined): string => {
  if (!role) return 'Not provided';

  const roleMap: Record<string, string> = {
    'admin': 'Admin',
    'active_member': 'Member',
    'alumni': 'Alumni',
  };

  // Return mapped value if exists, otherwise capitalize first letter and replace underscores
  return roleMap[role.toLowerCase()] || role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

export default function ProfilePage() {
  const { profile, loading, refreshProfile } = useProfile();
  const { connections, loading: connectionsLoading, sendConnectionRequest, getConnectionStatus, getConnectionId, cancelConnectionRequest } = useConnections();
  const [activeTab, setActiveTab] = useState('posts');
  const [connectionLoading, setConnectionLoading] = useState<string | null>(null);
  const router = useRouter();
  const { openEditProfileModal } = useModal();
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [postToDelete, setPostToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConnectionsModalOpen, setIsConnectionsModalOpen] = useState(false);

  // Stable suggested users - computed once, not re-shuffled on re-renders
  const [suggestedUsers, setSuggestedUsers] = useState<any[]>([]);
  const suggestedUsersInitializedRef = useRef(false);
  const [pendingRequestUserIds, setPendingRequestUserIds] = useState<Set<string>>(new Set());

  const [showConnectionDialog, setShowConnectionDialog] = useState(false);
  const [selectedUserForConnection, setSelectedUserForConnection] = useState<any | null>(null);

  // Calculate completion percentage
  const completion = profile ? ProfileService.calculateCompletion(profile) : null;

  // Add state for dismissing the completion toast
  const [isCompletionDismissed, setIsCompletionDismissed] = useState(false);

  // State for copy feedback and upcoming events
  const [copied, setCopied] = useState(false);
  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  // Handle dismissing the toast
  const handleDismissCompletion = () => {
    setIsCompletionDismissed(true);
  };

  // Fetch chapter members for suggestions
  const { members: chapterMembers, loading: membersLoading } = useChapterMembers(profile?.chapter_id || undefined);

  // Filter connections based on status and user role
  const acceptedConnections = connections.filter(conn =>
    conn.status === 'accepted' &&
    (conn.requester_id === profile?.id || conn.recipient_id === profile?.id)
  );

  const pendingRequests = connections.filter(conn =>
    conn.status === 'pending' && conn.requester_id === profile?.id
  );

  // Helper function to get the other user in a connection
  const getConnectionPartner = (connection: any) => {
    if (!profile) return null;
    return connection.requester_id === profile.id ? connection.recipient : connection.requester;
  };

  // Compute suggested users ONCE when data is available — prevents re-shuffling on re-renders
  useEffect(() => {
    // Already computed — don't re-shuffle
    if (suggestedUsersInitializedRef.current) return;
    if (!chapterMembers?.length || !profile) return;

    // Get IDs of users the current user is already connected with (accepted or pending)
    const connectedUserIds = new Set(
      connections
        .filter(c => c.status === 'accepted' || c.status === 'pending')
        .map(conn => conn.requester_id === profile.id ? conn.recipient_id : conn.requester_id)
    );

    // Filter out current user and already connected users
    const availableUsers = chapterMembers.filter(member =>
      member.id !== profile.id &&
      !connectedUserIds.has(member.id)
    );

    if (availableUsers.length > 0) {
      const shuffled = [...availableUsers].sort(() => Math.random() - 0.5).slice(0, 3);
      setSuggestedUsers(shuffled);
      suggestedUsersInitializedRef.current = true;
    }
  }, [chapterMembers, profile, connections]);
  const MAX_VISIBLE_CONNECTIONS = 6;
  const sortedConnections = useMemo(() => {
    return [...acceptedConnections].sort((a, b) => {
      const aDate = new Date(a.updated_at || a.created_at || 0).getTime();
      const bDate = new Date(b.updated_at || b.created_at || 0).getTime();
      return bDate - aDate;
    });
  }, [acceptedConnections]);
  const visibleConnections = sortedConnections.slice(0, MAX_VISIBLE_CONNECTIONS);
  const hasMoreConnections = sortedConnections.length > MAX_VISIBLE_CONNECTIONS;

  // Handle message button click
  const handleMessageClick = (connectionId: string) => {
    router.push(`/dashboard/messages?connection=${connectionId}`);
  };

  const handleSendConnectionRequest = async (message?: string) => {
    if (!selectedUserForConnection) return;
    
    setConnectionLoading(selectedUserForConnection.id);
    try {
      await sendConnectionRequest(selectedUserForConnection.id, message);
      setPendingRequestUserIds(prev => new Set(prev).add(selectedUserForConnection.id));
      setShowConnectionDialog(false);
      setSelectedUserForConnection(null);
    } catch (error) {
      console.error('Failed to send connection request:', error);
    } finally {
      setConnectionLoading(null);
    }
  };

  // Handle profile update
  const handleProfileUpdate = async (updatedProfile: any) => {
    try {
      // Update profile data
      const result = await ProfileService.updateProfile(updatedProfile);

      if (result) {
        // Refresh profile data using context refresh method
        await refreshProfile();
      }
    } catch (error) {
      console.error('Error updating profile:', error);
    }
  };

  // Debug: Log the profile data to see what's available
  useEffect(() => {
    if (profile) {
      // Full profile object loaded
    }
  }, [profile]);

  // Fetch upcoming events for sidebar
  useEffect(() => {
    const fetchEvents = async () => {
      if (!profile?.chapter_id) {
        setEventsLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/events?chapter_id=${profile.chapter_id}&scope=upcoming`);
        if (response.ok) {
          const data = await response.json();
          setUpcomingEvents(data.slice(0, 2)); // Only show 2 events in sidebar
        }
      } catch (error) {
        console.error('Error fetching events:', error);
      } finally {
        setEventsLoading(false);
      }
    };

    fetchEvents();
  }, [profile?.chapter_id]);

  // Copy profile link to clipboard
  const handleCopyProfileLink = async () => {
    const profileSlug = profile?.username || profile?.profile_slug || profile?.id;
    const profileUrl = `${window.location.origin}/profile/${profileSlug}`;

    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  // Get public profile URL
  const getPublicProfileUrl = () => {
    const profileSlug = profile?.username || profile?.profile_slug || profile?.id;
    return `/profile/${profileSlug}`;
  };

  // Move useUserPosts BEFORE the early returns
  const { posts: userPosts, loading: postsLoading, deletePost, likePost, refetch: refetchPosts } = useUserPosts(profile?.id || '');

  // Get recent connections for avatar display (up to 3) - Move this BEFORE early returns too
  const recentConnectionsForAvatars = useMemo(() => {
    if (!profile) return [];
    return sortedConnections.slice(0, 3).map((connection) => {
      const partner = connection.requester_id === profile.id
        ? connection.recipient
        : connection.requester;
      return partner ? {
        id: partner.id || connection.id,
        avatar_url: partner.avatar_url,
        full_name: partner.full_name,
        first_name: partner.first_name,
        last_name: partner.last_name,
      } : null;
    }).filter(Boolean) as Array<{
      id: string;
      avatar_url?: string | null;
      full_name?: string;
      first_name?: string;
      last_name?: string;
    }>;
  }, [sortedConnections, profile]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-accent-50/20">
        <div className="max-w-7xl mx-auto px-6 py-10">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-8"></div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="h-64 bg-gray-200 rounded"></div>
              <div className="h-64 bg-gray-200 rounded"></div>
              <div className="h-64 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-accent-50/20">
        <div className="max-w-7xl mx-auto px-6 py-10">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-red-600 mb-4">Error Loading Profile</h1>
            <p className="text-gray-600">Profile not found.</p>
          </div>
        </div>
      </div>
    );
  }

  const profileFields = [
    { label: 'Full Name', value: profile.full_name, icon: User, required: true },
    { label: 'Email', value: profile.email, icon: Mail, required: true },
    { label: 'Chapter', value: profile.chapter, icon: Building, required: true },
    { label: 'Role', value: formatSystemRole(profile.role), icon: Shield, required: true }, // Apply formatting here
    { label: 'Bio', value: profile.bio, icon: FileText, required: false },
    { label: 'Phone', value: profile.phone, icon: Phone, required: false },
    { label: 'Location', value: formatLocationLineForApp(profile.location), icon: MapPin, required: false },
  ];

  // Mobile Layout - Threads-style
  const mobileTabs = [
    { id: 'posts', label: 'Posts' },
    { id: 'connections', label: 'Connections' },
  ];

  const formatTimestamp = (timestamp: string) => {
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch {
      return 'recently';
    }
  };

  const handleDeleteClick = (postId: string) => {
    setPostToDelete(postId);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!postToDelete) return;

    setIsDeleting(true);
    try {
      await deletePost(postToDelete);
      setDeleteModalOpen(false);
      setPostToDelete(null);
    } catch (error) {
      console.error('Failed to delete post:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteModalOpen(false);
    setPostToDelete(null);
  };

  const renderConnectionRow = (connection: any) => {
    const partner = getConnectionPartner(connection);
    if (!partner) return null;

    return (
      <div
        key={connection.id}
        className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-primary-300 transition-colors"
      >
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          <UserAvatar
            user={{
              user_metadata: {
                avatar_url: partner?.avatar_url,
                full_name: partner?.full_name,
              },
            }}
            completionPercent={0}
            hasUnread={false}
            size="md"
          />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 truncate">
              {partner?.full_name || 'Unknown User'}
            </p>
            <p className="text-sm text-gray-500 truncate">
              {partner?.email || 'No email provided'}
            </p>
          </div>
        </div>
        <div className="flex-shrink-0 ml-2">
          <Button
            size="sm"
            variant="outline"
            className="text-brand-primary border-primary-300 hover:bg-primary-50 px-2 sm:px-3"
            onClick={() => handleMessageClick(connection.id)}
          >
            <MessageCircle className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Message</span>
          </Button>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Mobile Layout */}
      <div className="min-h-screen bg-white sm:hidden pb-20">
        {/* Profile Header Section */}
        <ProfileHeaderSection
          profile={profile}
          connectionsCount={acceptedConnections.length}
          onEditClick={openEditProfileModal}
          completion={completion}
          recentConnections={recentConnectionsForAvatars}
        />

        {/* Content Navigation Tabs */}
        <ContentNavigationTabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
          tabs={mobileTabs}
        />

        {/* Content Feed Section */}
        <ContentFeedSection
          activeTab={activeTab}
          posts={userPosts}
          connections={sortedConnections}
          postsLoading={postsLoading}
          connectionsLoading={connectionsLoading}
          onMessageClick={handleMessageClick}
          onDeletePost={handleDeleteClick}
          onLikePost={async (postId: string) => { await likePost(postId); }}
          onCommentAdded={async () => { await refetchPosts(); }}
          getConnectionPartner={getConnectionPartner}
        />

        {/* Mobile Bottom Navigation */}
        <MobileBottomNavigation />
      </div>

      {/* Desktop Layout - Twitter/X Style with Sidebar */}
      <div className="min-h-screen bg-gray-50 hidden sm:block">
        {/* Profile Completion Toast - Fixed at top, overlays content */}
        {completion && completion.percentage < 100 && !isCompletionDismissed && (
          <div className="sticky top-0 z-50 w-full">
            <div className="p-4 bg-white border-b border-gray-200 shadow-sm flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0 max-w-5xl mx-auto flex items-center gap-4">
                <button
                  type="button"
                  onClick={openEditProfileModal}
                  className="flex flex-1 min-w-0 items-center gap-3 cursor-pointer rounded-lg -m-2 p-2 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-shrink-0">
                    <Badge className="bg-brand-primary text-white">
                      {completion.percentage}% Complete
                    </Badge>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      Profile Completion: {completion.percentage}%
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                      Complete your profile to unlock full features and improve your visibility in the network
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={handleDismissCompletion}
                  className="flex-shrink-0 p-1.5 rounded-full hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
                  aria-label="Dismiss profile completion notice"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Layout Container - Grid with sidebar */}
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Content Column (2/3) */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">

                {/* Banner Section - Full width within container */}
                <div className="relative">
                  <div className="w-full h-48 overflow-hidden">
                    {profile?.banner_url ? (
                      <img
                        src={profile.banner_url}
                        alt="Profile banner"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <img
                        src={DEFAULT_BANNER_IMAGE}
                        alt="Default banner"
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>

                  {/* Avatar - Overlapping banner */}
                  <div className="absolute -bottom-16 left-4">
                    <div className="w-32 h-32 rounded-full border-4 border-white bg-white overflow-hidden">
                      {profile?.avatar_url ? (
                        <img
                          src={profile.avatar_url}
                          alt={profile.full_name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-brand-primary to-brand-accent flex items-center justify-center">
                          <span className="text-white font-bold text-3xl">
                            {profile?.first_name?.[0] || ''}{profile?.last_name?.[0] || ''}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Profile Info Section */}
                <div className="pt-4 px-4">
                  {/* Edit Profile Button - Right aligned */}
                  <div className="flex justify-end mb-8">
                    <Button
                      variant="outline"
                      onClick={openEditProfileModal}
                      className="rounded-full px-4 py-2 font-semibold border-gray-300 hover:bg-gray-100"
                    >
                      Edit profile
                    </Button>
                  </div>

                  {/* Name and Username */}
                  <div className="mb-3">
                    <h1 className="text-xl font-bold text-gray-900">
                      {profile.full_name || 'User Name'}
                    </h1>
                    <p className="text-gray-500">
                      @{profile.username || profile.email?.split('@')[0] || 'username'}
                    </p>
                  </div>

                  {/* Bio */}
                  {profile.bio && (
                    <p className="text-gray-900 mb-3 whitespace-pre-wrap">
                      {profile.bio}
                    </p>
                  )}

                  {/* Meta Info Row - Location, Chapter, Join Date */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-500 text-sm mb-3">
                    {profile.location && (
                      <div className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        <span>{formatLocationLineForApp(profile.location)}</span>
                      </div>
                    )}
                    {profile.chapter && (
                      <div className="flex items-center gap-1">
                        <Building className="w-4 h-4" />
                        <span>{profile.chapter}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      <span>Joined {new Date(profile.created_at || Date.now()).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                    </div>
                  </div>

                  {/* Connections Count - Twitter style */}
                  <div className="flex items-center gap-4 mb-4">
                    <button
                      onClick={() => setIsConnectionsModalOpen(true)}
                      className="hover:underline"
                    >
                      <span className="font-bold text-gray-900">{acceptedConnections.length}</span>
                      <span className="text-gray-500 ml-1">Connections</span>
                    </button>
                  </div>

                  {/* Profile Completion Banner - Subtle */}
                  {completion && completion.percentage < 100 && !isCompletionDismissed && (
                    <div className="mb-4 flex items-stretch gap-2 rounded-xl border border-accent-200 bg-accent-50 p-3 hover:bg-accent-100/80 transition-colors">
                      <button
                        type="button"
                        onClick={openEditProfileModal}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 rounded-lg"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-accent/10">
                          <User className="h-5 w-5 text-brand-accent" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900">Complete your profile</p>
                          <p className="text-xs text-gray-500">{completion.percentage}% complete</p>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={handleDismissCompletion}
                        className="shrink-0 self-start rounded-full p-1 hover:bg-gray-200/80 transition-colors"
                        aria-label="Dismiss profile completion notice"
                      >
                        <X className="h-4 w-4 text-gray-400" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Tab Navigation - Twitter style underline tabs */}
                <div className="border-b border-gray-200">
                  <div className="flex">
                    <button
                      onClick={() => setActiveTab('posts')}
                      className={`flex-1 py-4 text-center text-sm font-medium relative hover:bg-gray-50 transition-colors ${activeTab === 'posts' ? 'text-gray-900' : 'text-gray-500'
                        }`}
                    >
                      Posts
                      {activeTab === 'posts' && (
                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-1 bg-brand-primary rounded-full" />
                      )}
                    </button>
                    <button
                      onClick={() => setActiveTab('connections')}
                      className={`flex-1 py-4 text-center text-sm font-medium relative hover:bg-gray-50 transition-colors ${activeTab === 'connections' ? 'text-gray-900' : 'text-gray-500'
                        }`}
                    >
                      Connections
                      {activeTab === 'connections' && (
                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-20 h-1 bg-brand-primary rounded-full" />
                      )}
                    </button>
                    <button
                      onClick={() => setActiveTab('about')}
                      className={`flex-1 py-4 text-center text-sm font-medium relative hover:bg-gray-50 transition-colors ${activeTab === 'about' ? 'text-gray-900' : 'text-gray-500'
                        }`}
                    >
                      About
                      {activeTab === 'about' && (
                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-brand-primary rounded-full" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Tab Content — posts use PostCard feed variant dividers; connections use divide-y below */}
                <div>
                  {/* Posts Tab */}
                  {activeTab === 'posts' && (
                    <>
                      {postsLoading ? (
                        <div className="flex justify-center py-8">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
                        </div>
                      ) : userPosts.length > 0 ? (
                        userPosts.map((post, index) => (
                          <PostCard
                            variant="feed"
                            key={post.id}
                            post={post}
                            showDivider={index < userPosts.length - 1}
                            onLike={async (postId) => { await likePost(postId); }}
                            onDelete={(postId) => handleDeleteClick(postId)}
                            onCommentAdded={async () => { await refetchPosts(); }}
                          />
                        ))
                      ) : (
                        <div className="py-12 text-center">
                          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                            <MessageCircle className="w-8 h-8 text-gray-400" />
                          </div>
                          <h3 className="text-xl font-bold text-gray-900 mb-1">No posts yet</h3>
                          <p className="text-gray-500">When you post, they'll show up here.</p>
                        </div>
                      )}
                    </>
                  )}

                  {/* Connections Tab */}
                  {activeTab === 'connections' && (
                    <>
                      {connectionsLoading ? (
                        <div className="flex justify-center py-8">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
                        </div>
                      ) : sortedConnections.length > 0 ? (
                        <div className="divide-y divide-gray-200">
                        {sortedConnections.map((connection) => {
                          const partner = getConnectionPartner(connection);
                          if (!partner) return null;

                          return (
                            <div key={connection.id} className="p-4 hover:bg-gray-50 transition-colors">
                              <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 bg-gray-200">
                                  {partner.avatar_url ? (
                                    <img
                                      src={partner.avatar_url}
                                      alt={partner.full_name}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-full h-full bg-brand-primary flex items-center justify-center">
                                      <span className="text-white font-medium">
                                        {partner.first_name?.[0] || partner.full_name?.[0] || '?'}
                                      </span>
                                    </div>
                                  )}
                                </div>

                                <div className="flex-1 min-w-0">
                                  <p className="font-bold text-gray-900 truncate">
                                    {partner.full_name || 'Unknown User'}
                                  </p>
                                  <p className="text-gray-500 text-sm truncate">
                                    {partner.chapter_role || partner.member_status || 'Member'}
                                  </p>
                                </div>

                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="rounded-full px-4 font-semibold"
                                  onClick={() => handleMessageClick(connection.id)}
                                >
                                  Message
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                        </div>
                      ) : (
                        <div className="py-12 text-center">
                          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                            <Users className="w-8 h-8 text-gray-400" />
                          </div>
                          <h3 className="text-xl font-bold text-gray-900 mb-1">No connections yet</h3>
                          <p className="text-gray-500">Start connecting with other members!</p>
                        </div>
                      )}
                    </>
                  )}

                  {/* About Tab - New */}
                  {activeTab === 'about' && (
                    <div className="p-4 space-y-6">
                      {profileFields
                        .filter(field => field.value)
                        .map((field) => (
                          <div key={field.label} className="flex items-start gap-3">
                            <field.icon className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                                {field.label}
                              </p>
                              <p className="text-gray-900">{field.value}</p>
                            </div>
                          </div>
                        ))}

                      {profileFields.filter(field => field.value).length === 0 && (
                        <div className="py-12 text-center">
                          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                            <User className="w-8 h-8 text-gray-400" />
                          </div>
                          <h3 className="text-xl font-bold text-gray-900 mb-1">No details yet</h3>
                          <p className="text-gray-500 mb-4">Add more info to your profile.</p>
                          <Button onClick={openEditProfileModal} variant="outline" className="rounded-full">
                            Edit profile
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Sidebar (1/3) */}
            <div className="lg:col-span-1 space-y-4">
              {/* Card 1: Import LinkedIn PDF */}
              {/* DISABLED - LinkedIn import feature is temporarily hidden */}
              {/*
              <Card className="bg-white rounded-xl shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <Linkedin className="w-4 h-4 text-[#0A66C2]" />
                    Import from LinkedIn
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-xs text-gray-500 mb-3">
                    Update your profile with your LinkedIn data by importing your PDF.
                  </p>
                  <Link href="/onboarding/prefill-profile/upload?type=linkedin">
                    <Button variant="outline" size="sm" className="w-full rounded-full text-sm">
                      <Upload className="w-3.5 h-3.5 mr-2" />
                      Import LinkedIn PDF
                    </Button>
                  </Link>
                </CardContent>
              </Card>
              */}
              {/* Card 2: Share Profile */}
              <Card className="bg-white rounded-xl shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-gray-900">
                    Share Your Profile
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full rounded-full text-sm"
                    onClick={handleCopyProfileLink}
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 mr-2 text-green-500" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 mr-2" />
                        Copy Profile Link
                      </>
                    )}
                  </Button>

                  {/* Public Profile URL Display */}
                  <div className="p-2 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500 mb-1">Your public profile</p>
                    <div className="flex items-center gap-2">
                      <code className="text-xs text-gray-700 truncate flex-1">
                        {typeof window !== 'undefined' ? window.location.origin : ''}{getPublicProfileUrl()}
                      </code>
                      <Link href={getPublicProfileUrl()} target="_blank">
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                          <ExternalLink className="w-3 h-3 text-gray-400" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Card 3: People You May Know */}
              {suggestedUsers.length > 0 && (
                <Card className="bg-white rounded-xl shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold text-gray-900">
                      People You May Know
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-3">
                    {suggestedUsers.map((user) => (
                      <div key={user.id} className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-gray-200">
                          {user.avatar_url ? (
                            <img
                              src={user.avatar_url}
                              alt={user.full_name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-brand-primary flex items-center justify-center">
                              <span className="text-white text-sm font-medium">
                                {user.first_name?.[0] || user.full_name?.[0] || '?'}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {user.full_name}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {user.chapter_role || user.member_status || 'Member'}
                          </p>
                        </div>
                        {(() => {
                          const status = getConnectionStatus(user.id);
                          const isPending = pendingRequestUserIds.has(user.id) || status === 'pending_sent';
                          const isConnected = status === 'accepted';

                          if (isConnected) {
                            return (
                              <Button
                                size="sm"
                                variant="outline"
                                className="rounded-full text-xs h-7 px-3 text-green-700 border-green-300 bg-green-50"
                                disabled
                              >
                                <UserCheck className="w-3 h-3 mr-1" />
                                Connected
                              </Button>
                            );
                          }

                          if (isPending) {
                            return (
                              <Button
                                size="sm"
                                variant="outline"
                                className="rounded-full text-xs h-7 px-3 text-gray-600 border-gray-300 hover:bg-gray-50"
                                disabled={connectionLoading === user.id}
                                onClick={async () => {
                                  const connectionId = getConnectionId(user.id);
                                  if (connectionId) {
                                    setConnectionLoading(user.id);
                                    try {
                                      await cancelConnectionRequest(connectionId);
                                      setPendingRequestUserIds(prev => {
                                        const next = new Set(prev);
                                        next.delete(user.id);
                                        return next;
                                      });
                                    } finally {
                                      setConnectionLoading(null);
                                    }
                                  }
                                }}
                              >
                                {connectionLoading === user.id ? (
                                  <div className="w-3 h-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                                ) : (
                                  <>
                                    <Clock className="w-3 h-3 mr-1" />
                                    Requested
                                  </>
                                )}
                              </Button>
                            );
                          }

                          return (
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-full text-xs h-7 px-3"
                              onClick={async () => {
                                setSelectedUserForConnection(user);
                                setShowConnectionDialog(true);
                              }}
                              disabled={connectionLoading === user.id}
                            >
                              {connectionLoading === user.id ? (
                                <div className="w-3 h-3 border-2 border-gray-300 border-t-brand-primary rounded-full animate-spin" />
                              ) : (
                                <>
                                  <UserPlus className="w-3 h-3 mr-1" />
                                  Connect
                                </>
                              )}
                            </Button>
                          );
                        })()}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Card 4: Upcoming Events */}
              <Card className="bg-white rounded-xl shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-brand-accent" />
                      Upcoming Events
                    </CardTitle>
                    <Link href="/dashboard" className="text-xs text-brand-primary hover:underline">
                      View all
                    </Link>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {eventsLoading ? (
                    <div className="flex justify-center py-4">
                      <div className="w-5 h-5 border-2 border-gray-200 border-t-brand-primary rounded-full animate-spin" />
                    </div>
                  ) : upcomingEvents.length > 0 ? (
                    <div className="space-y-3">
                      {upcomingEvents.map((event) => (
                        <div key={event.id} className="p-3 bg-gray-50 rounded-lg">
                          <h4 className="text-sm font-medium text-gray-900 mb-1 line-clamp-1">
                            {event.title}
                          </h4>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <Clock className="w-3 h-3" />
                            <span>
                              {event.start_time
                                ? new Date(event.start_time).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: 'numeric',
                                    minute: '2-digit',
                                  })
                                : 'Time TBD'}
                            </span>
                          </div>
                          {event.location && (
                            <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                              <MapPin className="w-3 h-3" />
                              <span className="truncate">{event.location}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm text-gray-500">No upcoming events</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        <DeletePostModal
          isOpen={deleteModalOpen}
          onClose={handleDeleteCancel}
          onConfirm={handleDeleteConfirm}
          post={userPosts.find(p => p.id === postToDelete) || null}
          isDeleting={isDeleting}
        />

        {/* All Connections Modal */}
        <Dialog open={isConnectionsModalOpen} onOpenChange={setIsConnectionsModalOpen}>
          <DialogContent className="max-w-lg w-full">
            <DialogHeader>
              <DialogTitle>All Connections</DialogTitle>
            </DialogHeader>
            <div className="mt-4 max-h-[70vh] overflow-y-auto space-y-3 pr-1">
              {sortedConnections.length > 0 ? (
                sortedConnections.map((connection) => renderConnectionRow(connection))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <UserCheck className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                  <p>No connections yet</p>
                  <p className="text-sm mt-1">Start connecting with other members!</p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Connection Request Dialog */}
        <ConnectionRequestDialog
          isOpen={showConnectionDialog}
          onClose={() => {
            setShowConnectionDialog(false);
            setSelectedUserForConnection(null);
          }}
          onSend={handleSendConnectionRequest}
          recipientName={selectedUserForConnection?.full_name}
          isLoading={!!connectionLoading}
        />
      </div>
    </>
  );
} 