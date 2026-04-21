'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { UnifiedUserProfile } from '@/types/user-profile';
import { Button } from '@/components/ui/button';
import { ArrowLeft, MapPin, Building, MessageCircle, UserPlus, Clock, Lock, X, Calendar, UserCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MobileBottomNavigation } from '@/components/features/dashboard/dashboards/ui/MobileBottomNavigation';
import { ProfileSummary } from '@/components/features/user-profile/mobile/ProfileSummary';
import { ContentNavigationTabs } from '@/components/features/profile/mobile/ContentNavigationTabs';
import { PostsTab } from '@/components/features/user-profile/mobile/PostsTab';
import { AboutTab } from '@/components/features/user-profile/mobile/AboutTab';
import { useUserPosts } from '@/lib/hooks/useUserPosts';
import { PostCard } from '@/components/features/social/PostCard';
import { DeletePostModal } from '@/components/features/social/DeletePostModal';
import { MarketingHeader } from '@/components/marketing/MarketingHeader';
import { DashboardHeader } from '@/components/features/dashboard/DashboardHeader';
import { CopyProfileLinkButton } from '@/components/profile/CopyProfileLinkButton';
import { useAuth } from '@/lib/supabase/auth-context';
import { useConnections } from '@/lib/contexts/ConnectionsContext';
import { useMutualConnections } from '@/lib/hooks/useMutualConnections';
import { useChapterMembers } from '@/lib/hooks/useChapterMembers';
import Link from 'next/link';
import ImageWithFallback from '@/components/figma/ImageWithFallback';
import { DEFAULT_BANNER_IMAGE } from '@/lib/constants';
import { ConnectionRequestDialog } from '@/components/features/connections/ConnectionRequestDialog';

interface PublicProfileClientProps {
  slug: string;
  initialProfile: UnifiedUserProfile;
}

export function PublicProfileClient({ slug, initialProfile }: PublicProfileClientProps) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { 
    connections, 
    loading: connectionsLoading,
    sendConnectionRequest,
    updateConnectionStatus,
    cancelConnectionRequest,
    getConnectionId,
    getConnectionStatus
  } = useConnections();
  const [profile, setProfile] = useState<UnifiedUserProfile>(initialProfile);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('posts');
  const [connectionStatus, setConnectionStatus] = useState<'none' | 'pending_sent' | 'pending_received' | 'accepted' | 'declined' | 'blocked'>('none');
  const [connectionLoading, setConnectionLoading] = useState(false);
  const [dismissedModal, setDismissedModal] = useState(false);
  const [showConnectionDialog, setShowConnectionDialog] = useState(false);
  const [upcomingEvents, setUpcomingEvents] = useState<
    Array<{ id: string; title: string; start_time: string | null; end_time?: string | null; location?: string }>
  >([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [postToDelete, setPostToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [suggestedUsers, setSuggestedUsers] = useState<Array<{ id: string; full_name?: string; first_name?: string | null; avatar_url?: string | null; chapter_role?: string | null; member_status?: string | null }>>([]);
  const suggestedUsersInitializedRef = useRef(false);
  const [pendingRequestUserIds, setPendingRequestUserIds] = useState<Set<string>>(new Set());
  const [selectedUserForConnection, setSelectedUserForConnection] = useState<{ id: string; full_name?: string } | null>(null);
  const [connectionLoadingUserId, setConnectionLoadingUserId] = useState<string | null>(null);
  const [bioExpanded, setBioExpanded] = useState(false);

  const { posts: userPosts, loading: postsLoading, deletePost, likePost, refetch: refetchPosts } = useUserPosts(profile?.id || '');
  const { members: chapterMembers } = useChapterMembers(profile?.chapter_id || undefined);

  // Fetch fresh profile data with viewer info
  useEffect(() => {
    async function fetchProfileData() {
      try {
        setLoading(true);
        const response = await fetch(`/api/profile/public/${slug}`);
        if (response.ok) {
          const data = await response.json();
          setProfile(data.profile);
          setConnectionStatus(data.viewer.connectionStatus);
        }
      } catch (error) {
        console.error('Error fetching profile data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchProfileData();
  }, [slug, user?.id]);

  // Get connection status from context if logged in
  useEffect(() => {
    if (user && !connectionsLoading && connections.length > 0) {
      const connection = connections.find(conn =>
        (conn.requester_id === user.id && conn.recipient_id === profile.id) ||
        (conn.requester_id === profile.id && conn.recipient_id === user.id)
      );

      if (connection) {
        if (connection.status === 'pending') {
          setConnectionStatus(connection.requester_id === user.id ? 'pending_sent' : 'pending_received');
        } else {
          setConnectionStatus(connection.status as 'accepted' | 'declined' | 'blocked');
        }
      }
    }
  }, [user, connections, profile.id, connectionsLoading]);

    const handleClose = () => {
        router.back();
    };

  // Suggested users for "People you may know" (same logic as dashboard profile)
  useEffect(() => {
    if (suggestedUsersInitializedRef.current || !chapterMembers?.length || !profile || !user) return;
    const connectedUserIds = new Set(
      connections
        .filter((c) => c.status === 'accepted' || c.status === 'pending')
        .map((conn) => (conn.requester_id === user.id ? conn.recipient_id : conn.requester_id))
    );
    const availableUsers = chapterMembers.filter(
      (member) => member.id !== profile.id && !connectedUserIds.has(member.id)
    );
    if (availableUsers.length > 0) {
      const shuffled = [...availableUsers].sort(() => Math.random() - 0.5).slice(0, 3);
      setSuggestedUsers(shuffled);
      suggestedUsersInitializedRef.current = true;
    }
  }, [chapterMembers, profile, user, connections]);

  // Fetch upcoming events for sidebar (when profile has chapter_id)
  useEffect(() => {
    if (!profile.chapter_id) {
      setEventsLoading(false);
      return;
    }
    const fetchEvents = async () => {
      try {
        const response = await fetch(`/api/events?chapter_id=${profile.chapter_id}&scope=upcoming`);
        if (response.ok) {
          const data = await response.json();
          setUpcomingEvents(data.slice(0, 2));
        }
      } catch (error) {
        console.error('Error fetching events:', error);
      } finally {
        setEventsLoading(false);
      }
    };
    fetchEvents();
  }, [profile.chapter_id]);

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

  const isOwnProfile = user?.id === profile.id;
  const isLoggedIn = !!user;
  const isConnected = connectionStatus === 'accepted';

  // Fetch mutual connections (only for logged-in users viewing someone else's profile)
  const { mutualConnections, count: mutualCount } = useMutualConnections(
    isLoggedIn && !isOwnProfile ? profile.id : undefined
  );

  // Bio truncation: for guests (sign-in gate) and for length (View more / View less)
  const MAX_BIO_LENGTH = 150; // for non-logged-in "Sign in to see more"
  const BIO_DISPLAY_LIMIT = 200; // for logged-in "View more" expand
  const shouldTruncateBio = !isLoggedIn && profile.bio && profile.bio.length > MAX_BIO_LENGTH;
  const displayBio = shouldTruncateBio && profile.bio
    ? `${profile.bio.substring(0, MAX_BIO_LENGTH)}...`
    : profile.bio || null;
  const bioOverLimit = isLoggedIn && profile.bio && profile.bio.length > BIO_DISPLAY_LIMIT;
  const bioTruncatedForExpand = bioOverLimit && !bioExpanded;
  const desktopBioText = isLoggedIn && profile.bio
    ? bioTruncatedForExpand
      ? `${profile.bio.slice(0, BIO_DISPLAY_LIMIT)}...`
      : profile.bio
    : displayBio;

  // Handle connection actions
  const handleConnectionAction = async (action: 'connect' | 'accept' | 'decline' | 'cancel' | 'message') => {
    if (!user || user.id === profile.id) return;
    
    if (action === 'connect') {
      setShowConnectionDialog(true);
      return;
    }
    
    setConnectionLoading(true);
    try {
      switch (action) {
        case 'accept':
          const connectionId = getConnectionId(profile.id);
          if (connectionId) {
            await updateConnectionStatus(connectionId, 'accepted');
            setConnectionStatus('accepted');
          }
          break;
        case 'decline':
          const declineConnectionId = getConnectionId(profile.id);
          if (declineConnectionId) {
            await updateConnectionStatus(declineConnectionId, 'declined');
            setConnectionStatus('declined');
          }
          break;
        case 'cancel':
          const cancelConnectionId = getConnectionId(profile.id);
          if (cancelConnectionId) {
            await cancelConnectionRequest(cancelConnectionId);
            setConnectionStatus('none');
          }
          break;
        case 'message':
          const msgConnectionId = getConnectionId(profile.id);
          if (msgConnectionId) {
            router.push(`/dashboard/messages?connection=${msgConnectionId}`);
          }
          break;
      }
    } catch (error) {
      console.error('Connection action failed:', error);
    } finally {
      setConnectionLoading(false);
    }
  };

  const handleSendConnectionRequest = async (message?: string, overrideUserId?: string) => {
    const targetId = overrideUserId ?? profile.id;
    setConnectionLoadingUserId(targetId);
    try {
      await sendConnectionRequest(targetId, message);
      if (targetId === profile.id) setConnectionStatus('pending_sent');
      else setPendingRequestUserIds((prev) => new Set(prev).add(targetId));
    } catch (e) {
      console.error('Failed to send connection request:', e);
    } finally {
      setConnectionLoadingUserId(null);
      setSelectedUserForConnection(null);
      setShowConnectionDialog(false);
    }
  };

  // Loading state
  if (loading && !initialProfile) {
    return (
      <>
        {/* Mobile Loading */}
        <div className="min-h-screen bg-white sm:hidden pb-20">
          {isLoggedIn ? <DashboardHeader /> : <MarketingHeader hideNavigation={true} />}
          
          <div className="flex items-center justify-center h-screen">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary mx-auto mb-4"></div>
              <p className="text-gray-600">Loading profile...</p>
            </div>
          </div>
          
          {/* Only show MobileBottomNavigation for authenticated users */}
          {isLoggedIn && <MobileBottomNavigation />}
        </div>
        {/* Desktop Loading */}
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-accent-50/20 hidden sm:flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-primary mx-auto mb-4"></div>
            <p className="text-gray-600 text-lg">Loading profile...</p>
          </div>
        </div>
      </>
    );
  }

  // Define tabs - show Posts tab with lock indicator for non-logged-in
  const tabs = [
    { 
      id: 'posts', 
      label: 'Posts',
      requiresAuth: true 
    },
    { 
      id: 'about', 
      label: 'About' 
    },
  ];

  // Render profile
  return (
    <>
      {/* Mobile Layout */}
      <div className="min-h-screen bg-white sm:hidden pb-20">
        {isLoggedIn ? <DashboardHeader /> : <MarketingHeader hideNavigation={true} />}
        
        {/* Header with Back and Share buttons */}
        <div className="relative">
          <div className={`relative ${!isLoggedIn ? 'h-40' : 'h-32'}`}>
            <img
              src={profile.banner_url || DEFAULT_BANNER_IMAGE}
              alt={`${profile.full_name}'s banner`}
              className="w-full h-full object-cover"
            />
          </div>
          
          {/* Back Button */}
          {isLoggedIn && (
            <button
              onClick={handleClose}
              className="absolute top-3 left-3 z-10 h-10 w-10 rounded-full flex items-center justify-center cursor-pointer group"
              style={{
                background: 'linear-gradient(135deg, #e5e7eb 0%, #fff 100%)',
                boxShadow: `
                  0 6px 12px rgba(0, 0, 0, 0.15),
                  0 2px 4px rgba(0, 0, 0, 0.1),
                  inset 0 1px 0 rgba(255, 255, 255, 0.9),
                  inset 0 -1px 0 rgba(0, 0, 0, 0.05)
                `,
                border: '1px solid rgba(0, 0, 0, 0.1)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
              }}
              title="Go back"
            >
              <ArrowLeft className="h-5 w-5 text-slate-600 relative z-10 drop-shadow-sm transition-transform duration-200 group-hover:scale-110" />
            </button>
          )}

          {/* Share Button */}
          {isLoggedIn && (
            <div className="absolute top-3 right-3 z-10">
              <CopyProfileLinkButton
                slug={slug}
                userId={profile.id}
                variant="icon"
                buttonVariant="outline"
                size="sm"
                className="h-10 w-10 bg-white/90 backdrop-blur-sm hover:bg-white shadow-md border-0"
              />
            </div>
          )}
        </div>

        {/* Profile Summary Section */}
        <ProfileSummary profile={profile} onClose={handleClose} />

        {/* Sign-up CTA for non-logged-in users */}
        {!isLoggedIn && (
          <div className="px-4 py-3 bg-accent-50 border-b border-accent-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Join Trailblaize to connect</p>
                <p className="text-xs text-gray-600 mt-0.5">View full profiles and message members</p>
              </div>
              <Link href="/sign-up">
                <Button size="sm" className="bg-brand-primary hover:bg-brand-primary-hover text-white rounded-full">
                  Sign Up
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* Sticky Tab Navigation */}
        <ContentNavigationTabs
          activeTab={activeTab}
          onTabChange={(tabId) => {
            const tab = tabs.find(t => t.id === tabId);
            if (tab?.requiresAuth && !isLoggedIn) {
              return; // Don't allow switching to locked tab
            }
            setActiveTab(tabId);
          }}
          tabs={tabs.map(tab => ({
            id: tab.id,
            label: tab.label,
            disabled: tab.requiresAuth && !isLoggedIn
          }))}
          stickyTop={isLoggedIn ? '56px' : '0'}
        />

      {/* Scrollable Content Area */}
      <div className="bg-white sm:bg-gray-50 min-h-[400px]">
        {activeTab === 'posts' && (
          <PostsTab 
            userId={profile.id} 
            isOwnProfile={isOwnProfile}
            requireAuth={true}
            isLoggedIn={isLoggedIn}
            profileName={profile.first_name || profile.full_name}
          />
        )}
        {activeTab === 'about' && (
          <AboutTab 
            profile={profile}
            isLoggedIn={isLoggedIn}
            canSeeFullProfile={isOwnProfile || isConnected}
          />
        )}
      </div>

        {/* Only show MobileBottomNavigation for authenticated users */}
        {isLoggedIn && <MobileBottomNavigation />}
      </div>

      {/* Desktop Layout - Dashboard profile style with sidebar */}
      <div className="min-h-screen bg-gray-50 hidden sm:block">
        {isLoggedIn ? <DashboardHeader /> : <MarketingHeader hideNavigation={true} />}

        {/* Top Slide-Down Sign-In Modal */}
        {!isLoggedIn && !dismissedModal && (
          <div className="fixed top-16 left-0 right-0 z-40 animate-[slide-down_0.3s_ease-out] shadow-lg">
            <div className="bg-white border-b border-gray-200">
              <div className="max-w-7xl mx-auto px-8 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-accent-100 flex items-center justify-center flex-shrink-0">
                      <Lock className="h-5 w-5 text-brand-accent" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">
                        View {profile.first_name || profile.full_name}&apos;s full profile
                      </h3>
                      <p className="text-sm text-gray-600">
                        See contact information, professional details, and more
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Link href="/sign-in">
                      <Button variant="outline" className="px-6 rounded-full">
                        Sign In
                      </Button>
                    </Link>
                    <Link href="/sign-up">
                      <Button className="bg-brand-primary hover:bg-brand-primary-hover text-white px-6 rounded-full">
                        Join Trailblaize
                      </Button>
                    </Link>
                    <button
                      onClick={() => setDismissedModal(true)}
                      className="text-gray-400 hover:text-gray-600 p-2 -mr-2"
                      aria-label="Dismiss"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className={`max-w-5xl mx-auto px-4 py-6 ${!isLoggedIn && !dismissedModal ? 'pt-24' : ''}`}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Content Column (2/3) - same card layout as dashboard profile */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {/* Banner + Back + Avatar */}
                <div className="relative">
                  <div className="relative w-full h-48 overflow-hidden">
                    {profile.banner_url ? (
                      <ImageWithFallback
                        src={profile.banner_url}
                        alt={`${profile.full_name}'s banner`}
                        fill
                        sizes="(max-width: 1024px) 100vw, 66vw"
                        quality={90}
                        priority
                        className="object-cover"
                      />
                    ) : (
                      <img
                        src={DEFAULT_BANNER_IMAGE}
                        alt="Default banner"
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  {isLoggedIn && (
                    <button
                      onClick={handleClose}
                      className="absolute top-3 left-4 z-10 h-10 w-10 rounded-full flex items-center justify-center cursor-pointer group"
                      style={{
                        background: 'linear-gradient(135deg, #e5e7eb 0%, #fff 100%)',
                        boxShadow: '0 6px 12px rgba(0, 0, 0, 0.15), 0 2px 4px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
                        border: '1px solid rgba(0, 0, 0, 0.1)',
                        backdropFilter: 'blur(10px)',
                      }}
                      title="Go back"
                    >
                      <ArrowLeft className="h-5 w-5 text-slate-600" />
                    </button>
                  )}
                  <div className="absolute -bottom-16 left-4">
                    <div className="w-32 h-32 rounded-full border-4 border-white bg-white overflow-hidden">
                      {profile.avatar_url ? (
                        <ImageWithFallback
                          src={profile.avatar_url}
                          alt={profile.full_name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-brand-primary to-brand-accent flex items-center justify-center">
                          <span className="text-white font-bold text-3xl">
                            {profile.first_name?.[0] || ''}{profile.last_name?.[0] || ''}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Profile Info Section - same mid-section as dashboard */}
                <div className="pt-4 px-4">
                  <div className="flex justify-end mb-8">
                    {isOwnProfile ? (
                      <Link href="/dashboard/profile">
                        <Button variant="outline" className="rounded-full px-4 py-2 font-semibold border-gray-300 hover:bg-gray-100">
                          Edit profile
                        </Button>
                      </Link>
                    ) : isLoggedIn && (
                      <div className="flex items-center gap-3">
                        {connectionStatus === 'none' && (
                          <Button
                            onClick={() => handleConnectionAction('connect')}
                            disabled={connectionLoading}
                            variant="outline"
                            className="rounded-full font-medium px-6 border-brand-primary text-brand-primary hover:bg-primary-50"
                          >
                            {connectionLoading ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b border-brand-primary mr-2" />
                            ) : (
                              <UserPlus className="h-4 w-4 mr-2" />
                            )}
                            Connect
                          </Button>
                        )}
                        {connectionStatus === 'pending_sent' && (
                          <Button variant="outline" disabled className="rounded-full font-medium px-6 border-gray-300 text-gray-600">
                            <Clock className="h-4 w-4 mr-2" />
                            Pending
                          </Button>
                        )}
                        {connectionStatus === 'pending_received' && (
                          <div className="flex gap-2">
                            <Button onClick={() => handleConnectionAction('accept')} disabled={connectionLoading} className="bg-green-600 hover:bg-green-700 text-white px-6 rounded-full font-medium">Accept</Button>
                            <Button onClick={() => handleConnectionAction('decline')} disabled={connectionLoading} variant="outline" className="border-red-300 text-red-600 px-6 rounded-full font-medium">Decline</Button>
                          </div>
                        )}
                        {connectionStatus === 'accepted' && (
                          <Button
                            onClick={() => handleConnectionAction('message')}
                            className="text-white rounded-full font-medium px-6 bg-brand-primary hover:bg-brand-primary-hover"
                          >
                            <MessageCircle className="h-4 w-4 mr-2" />
                            Message
                          </Button>
                        )}
                        <CopyProfileLinkButton slug={slug} userId={profile.id} variant="default" buttonVariant="outline" size="default" className="border-gray-300 text-gray-700 px-6 rounded-full" />
                      </div>
                    )}
                    {!isLoggedIn && (
                      <CopyProfileLinkButton slug={slug} userId={profile.id} variant="default" buttonVariant="outline" size="default" className="border-gray-300 text-gray-700 px-6 rounded-full" />
                    )}
                  </div>

                  <div className="mb-3">
                    <h1 className="text-xl font-bold text-gray-900">{profile.full_name}</h1>
                    <p className="text-gray-500">
                      @{profile.username || profile.profile_slug || slug}
                    </p>
                  </div>

                  {isLoggedIn && !isOwnProfile && mutualCount > 0 && (
                    <div className="flex items-center gap-2 px-3 py-1 bg-accent-50 rounded-full border border-accent-200 w-fit mb-3">
                      <div className="flex -space-x-1">
                        {mutualConnections.slice(0, 3).map((conn, i) => (
                          <div key={conn.id || `mutual-${i}`} className="w-6 h-6 rounded-full border-2 border-white overflow-hidden bg-gray-200 relative z-10" style={{ zIndex: 10 - i }} title={conn.name}>
                            {conn.avatar ? (
                              <ImageWithFallback src={conn.avatar} alt={conn.name || 'Mutual'} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-gray-500 flex items-center justify-center">
                                <span className="text-white text-xs font-medium">
                                  {conn.name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '?'}
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      <span className="text-sm text-gray-700 font-medium">
                        {mutualCount === 1 ? '1 mutual connection' : `${mutualCount} mutual connections`}
                      </span>
                    </div>
                  )}

                  {desktopBioText && (
                    <p className="text-gray-900 mb-3 whitespace-pre-wrap">{desktopBioText}</p>
                  )}
                  {shouldTruncateBio && (
                    <Link href="/sign-in" className="text-sm text-brand-primary hover:underline font-medium mt-2 inline-block">Sign in to see more</Link>
                  )}
                  {bioOverLimit && (
                    <button
                      type="button"
                      onClick={() => setBioExpanded((prev) => !prev)}
                      className="text-sm text-brand-primary hover:underline font-medium mt-1 inline-block"
                    >
                      {bioExpanded ? 'View less' : 'View more'}
                    </button>
                  )}

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-500 text-sm mb-4">
                    {profile.location && (
                      <div className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        <span>{profile.location}</span>
                      </div>
                    )}
                    {profile.chapter && (
                      <div className="flex items-center gap-1">
                        <Building className="w-4 h-4" />
                        <span>{profile.chapter}</span>
                      </div>
                    )}
                    {profile.created_at && (
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        <span>Joined {new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Tabs - same underline style as dashboard */}
                <div className="border-b border-gray-200">
                  <div className="flex">
                    {tabs.map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => tabs.find(t => t.id === tab.id)?.requiresAuth && !isLoggedIn ? undefined : setActiveTab(tab.id)}
                        disabled={tab.requiresAuth && !isLoggedIn}
                        className={`flex-1 py-4 text-center text-sm font-medium relative hover:bg-gray-50 transition-colors ${activeTab === tab.id ? 'text-gray-900' : 'text-gray-500'}`}
                      >
                        {tab.label}
                        {activeTab === tab.id && (
                          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-1 bg-brand-primary rounded-full" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tab Content — posts match dashboard profile (PostCard variant="feed" + row dividers) */}
                <div>
                  {activeTab === 'posts' && (
                    <>
                      {!isLoggedIn ? (
                        <div className="flex flex-col items-center justify-center px-4 py-12">
                          <div className="max-w-md text-center">
                            <div className="flex justify-center mb-4">
                              <div
                                className="w-16 h-16 rounded-full flex items-center justify-center"
                                style={{ background: 'linear-gradient(135deg, #e5e7eb 0%, #fff 100%)' }}
                              >
                                <Lock className="h-8 w-8 text-slate-600" />
                              </div>
                            </div>
                            <h3 className="text-xl font-semibold text-gray-900 mb-2">Sign in to engage</h3>
                            <p className="text-gray-600 mb-6">
                              Create an account or sign in to view {profile.first_name || profile.full_name}&apos;s posts and activity.
                            </p>
                            <div className="flex gap-3 justify-center">
                              <Link href="/sign-in">
                                <Button variant="outline" className="px-6 rounded-full" style={{ background: 'linear-gradient(135deg, #e5e7eb 0%, #fff 100%)' }}>
                                  Sign In
                                </Button>
                              </Link>
                              <Link href="/sign-up">
                                <Button className="text-white px-6 rounded-full bg-brand-primary hover:bg-brand-primary-hover">Join Trailblaize</Button>
                              </Link>
                            </div>
                          </div>
                        </div>
                      ) : postsLoading ? (
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
                            onDelete={isOwnProfile ? (postId) => handleDeleteClick(postId) : undefined}
                            onCommentAdded={async () => { await refetchPosts(); }}
                          />
                        ))
                      ) : (
                        <div className="py-12 text-center">
                          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                            <MessageCircle className="w-8 h-8 text-gray-400" />
                          </div>
                          <h3 className="text-xl font-bold text-gray-900 mb-1">No posts yet</h3>
                          <p className="text-gray-500">When you post, they&apos;ll show up here.</p>
                        </div>
                      )}
                    </>
                  )}
                  {activeTab === 'about' && (
                    <AboutTab profile={profile} isLoggedIn={isLoggedIn} canSeeFullProfile={isOwnProfile || isConnected} />
                  )}
                </div>
              </div>
            </div>

            {/* Right Sidebar (1/3) - People You May Know + Upcoming Events */}
            <div className="lg:col-span-1 space-y-4">
              {isLoggedIn && suggestedUsers.length > 0 && (
                <Card className="bg-white rounded-xl shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold text-gray-900">
                      People You May Know
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-3">
                    {suggestedUsers.map((suggestedUser) => {
                      const status = getConnectionStatus(suggestedUser.id);
                      const isPending = pendingRequestUserIds.has(suggestedUser.id) || status === 'pending_sent';
                      const isConnected = status === 'accepted';
                      return (
                        <div key={suggestedUser.id} className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-gray-200">
                            {suggestedUser.avatar_url ? (
                              <img
                                src={suggestedUser.avatar_url}
                                alt={suggestedUser.full_name ?? ''}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full bg-brand-primary flex items-center justify-center">
                                <span className="text-white text-sm font-medium">
                                  {suggestedUser.first_name?.[0] || suggestedUser.full_name?.[0] || '?'}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {suggestedUser.full_name}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                              {suggestedUser.chapter_role || suggestedUser.member_status || 'Member'}
                            </p>
                          </div>
                          {isConnected ? (
                            <Button size="sm" variant="outline" className="rounded-full text-xs h-7 px-3 text-green-700 border-green-300 bg-green-50" disabled>
                              <UserCheck className="w-3 h-3 mr-1" />
                              Connected
                            </Button>
                          ) : isPending ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-full text-xs h-7 px-3 text-gray-600 border-gray-300 hover:bg-gray-50"
                              disabled={connectionLoadingUserId === suggestedUser.id}
                              onClick={async () => {
                                const connectionId = getConnectionId(suggestedUser.id);
                                if (connectionId) {
                                  setConnectionLoadingUserId(suggestedUser.id);
                                  try {
                                    await cancelConnectionRequest(connectionId);
                                    setPendingRequestUserIds((prev) => {
                                      const next = new Set(prev);
                                      next.delete(suggestedUser.id);
                                      return next;
                                    });
                                  } finally {
                                    setConnectionLoadingUserId(null);
                                  }
                                }
                              }}
                            >
                              {connectionLoadingUserId === suggestedUser.id ? (
                                <div className="w-3 h-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                              ) : (
                                <>
                                  <Clock className="w-3 h-3 mr-1" />
                                  Requested
                                </>
                              )}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-full text-xs h-7 px-3"
                              onClick={() => {
                                setSelectedUserForConnection({ id: suggestedUser.id, full_name: suggestedUser.full_name });
                                setShowConnectionDialog(true);
                              }}
                              disabled={connectionLoadingUserId === suggestedUser.id}
                            >
                              {connectionLoadingUserId === suggestedUser.id ? (
                                <div className="w-3 h-3 border-2 border-gray-300 border-t-brand-primary rounded-full animate-spin" />
                              ) : (
                                <>
                                  <UserPlus className="w-3 h-3 mr-1" />
                                  Connect
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              )}

              <Card className="bg-white rounded-xl shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-brand-accent" />
                      Upcoming Events
                    </CardTitle>
                    <Link href="/dashboard" className="text-xs text-brand-primary hover:underline">View all</Link>
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
                          <h4 className="text-sm font-medium text-gray-900 mb-1 line-clamp-1">{event.title}</h4>
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

        {/* Sign-up CTA - below grid when not logged in */}
        {!isLoggedIn && (
          <div className="bg-gradient-to-r from-accent-50 to-primary-50 border-y border-accent-100">
            <div className="max-w-5xl mx-auto px-4 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-base font-medium text-gray-900">Join Trailblaize to connect with {profile.first_name || profile.full_name}</p>
                  <p className="text-sm text-gray-600 mt-0.5">View full profiles, message members, and grow your network</p>
                </div>
                <Link href="/sign-up">
                  <Button className="text-white px-6 rounded-full bg-brand-primary hover:bg-brand-primary-hover">Join</Button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Connection Request Dialog */}
      <ConnectionRequestDialog
        isOpen={showConnectionDialog}
        onClose={() => {
          setShowConnectionDialog(false);
          setSelectedUserForConnection(null);
        }}
        onSend={(message) => handleSendConnectionRequest(message, selectedUserForConnection?.id)}
        recipientName={selectedUserForConnection?.full_name ?? profile.full_name}
        isLoading={connectionLoadingUserId !== null}
      />

      {/* Delete Post Modal - same as dashboard profile */}
      <DeletePostModal
        isOpen={deleteModalOpen}
        onClose={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
        post={userPosts.find((p) => p.id === postToDelete) || null}
        isDeleting={isDeleting}
      />
    </>
  );
}

