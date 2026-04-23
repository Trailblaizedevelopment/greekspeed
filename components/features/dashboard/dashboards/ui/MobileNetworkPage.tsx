'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, UserPlus, X, CheckCircle, ChevronRight, Search, MessageCircle, Loader2 } from 'lucide-react';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { useChapterMembers } from '@/lib/hooks/useChapterMembers';
import { useScopedChapterId } from '@/lib/hooks/useScopedChapterId';
import { useConnections } from '@/lib/contexts/ConnectionsContext';
import { ConnectionManagement } from '@/components/ui/ConnectionManagement';
import { ChapterMemberData } from '@/types/chapter';
import { weightedRandomShuffle } from '@/lib/utils/weightedShuffle';
import { calculateNetworkingPriority } from '@/lib/utils/networkingSpotlight';
import { useAuth } from '@/lib/supabase/auth-context';
import { ChapterMember } from '@/types/chapter';
import { cn } from '@/lib/utils';
import { LinkedInStyleChapterCard } from '@/components/mychapter/LinkedInStyleChapterCard';
import { ClickableAvatar } from '@/components/features/user-profile/ClickableAvatar';
import { ClickableUserName } from '@/components/features/user-profile/ClickableUserName';
import { ConnectionRequestDialog } from '@/components/features/connections/ConnectionRequestDialog';

// Seeded random number generator (deterministic - same seed = same sequence)
function seededRandom(seed: number) {
  let value = seed;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

// Fisher-Yates shuffle with seeded random
function seededShuffle<T>(array: T[], seed: number): T[] {
  const shuffled = [...array];
  const random = seededRandom(seed);
  
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  return shuffled;
}

export function MobileNetworkPage() {
  const router = useRouter();
  const { profile } = useProfile();
  const { user } = useAuth();
  const chapterId = useScopedChapterId();
  const { members: chapterMembers, loading: membersLoading } = useChapterMembers(chapterId || undefined);
  const { 
    connections, 
    sendConnectionRequest,
    updateConnectionStatus,
    refreshConnections,
    loading: connectionsLoading
  } = useConnections();
  const [connectionLoading, setConnectionLoading] = useState<string | null>(null);
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [connectedUserName, setConnectedUserName] = useState<string>('');
  const [localConnectionsSnapshot, setLocalConnectionsSnapshot] = useState<any[]>([]);
  const [snapshotTaken, setSnapshotTaken] = useState(false);
  const [sessionSeed, setSessionSeed] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'grow' | 'catchup'>('grow');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [recentlyConnectedLimit, setRecentlyConnectedLimit] = useState(6);
  const [reconnectLimit, setReconnectLimit] = useState(6);
  const [suggestionsDisplayCount, setSuggestionsDisplayCount] = useState(6);
  const [isLoadingMoreSuggestions, setIsLoadingMoreSuggestions] = useState(false);
  const suggestionsObserverTarget = useRef<HTMLDivElement>(null);
  const [showConnectionDialog, setShowConnectionDialog] = useState(false);
  const [selectedMemberForConnection, setSelectedMemberForConnection] = useState<ChapterMemberData | null>(null);

  // Constants for pagination
  const INITIAL_LIMIT = 6;
  const LOAD_MORE_INCREMENT = 6;
  const MAX_DISPLAY = 25;
  
  // Constants for suggestions lazy loading
  const INITIAL_SUGGESTIONS_COUNT = 6;
  const LOAD_MORE_SUGGESTIONS_INCREMENT = 6;
  const MAX_SUGGESTIONS_COUNT = 24;

  // Reset limits when switching tabs
  useEffect(() => {
    setRecentlyConnectedLimit(INITIAL_LIMIT);
    setReconnectLimit(INITIAL_LIMIT);
  }, [activeTab]);

  // Reset suggestions display count when connections change (e.g., after connecting)
  useEffect(() => {
    setSuggestionsDisplayCount(INITIAL_SUGGESTIONS_COUNT);
  }, [connections.length]);

  // Get or generate session seed for randomization
  useEffect(() => {
    const storageKey = 'mobile-network-suggestions-seed';
    const storedSeed = sessionStorage.getItem(storageKey);
    
    if (storedSeed) {
      setSessionSeed(parseInt(storedSeed, 10));
    } else {
      const newSeed = Math.floor(Math.random() * 1000000);
      sessionStorage.setItem(storageKey, newSeed.toString());
      setSessionSeed(newSeed);
    }
  }, []);

  // Take snapshot of connections when they're loaded
  useEffect(() => {
    if (profile?.id && connections.length >= 0 && !connectionsLoading && !snapshotTaken) {
      setLocalConnectionsSnapshot([...connections]);
      setSnapshotTaken(true);
    }
  }, [profile?.id, connections, connectionsLoading, snapshotTaken]);

  // Filter connections
  const incomingRequests = useMemo(() => {
    if (!user || !connections) return [];
    return connections.filter(conn => 
      conn.status === 'pending' && conn.recipient_id === user.id
    );
  }, [connections, user]);

  const sentRequests = useMemo(() => {
    if (!user || !connections) return [];
    return connections.filter(conn => 
      conn.status === 'pending' && conn.requester_id === user.id
    );
  }, [connections, user]);

  // Recently Connected - connections from last 30 days
  const recentlyConnected = useMemo(() => {
    if (!user || !connections) return [];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    return connections
      .filter(conn => 
        conn.status === 'accepted' &&
        (conn.requester_id === user.id || conn.recipient_id === user.id)
      )
      .filter(conn => {
        const connectedDate = new Date(conn.updated_at || conn.created_at);
        return connectedDate >= thirtyDaysAgo;
      })
      .sort((a, b) => {
        const dateA = new Date(a.updated_at || a.created_at);
        const dateB = new Date(b.updated_at || b.created_at);
        return dateB.getTime() - dateA.getTime(); // Most recent first
      });
  }, [connections, user]);

  // Reconnect - connections inactive for 90+ days (exclude recently connected)
  const reconnectConnections = useMemo(() => {
    if (!user || !connections) return [];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    
    // Get IDs of recently connected to exclude them
    const recentlyConnectedIds = new Set(
      connections
        .filter(conn => 
          conn.status === 'accepted' &&
          (conn.requester_id === user.id || conn.recipient_id === user.id)
        )
        .filter(conn => {
          const connectedDate = new Date(conn.updated_at || conn.created_at);
          return connectedDate >= thirtyDaysAgo;
        })
        .map(conn => conn.id)
    );
    
    return connections
      .filter(conn => 
        conn.status === 'accepted' &&
        (conn.requester_id === user.id || conn.recipient_id === user.id) &&
        !recentlyConnectedIds.has(conn.id) // Exclude recently connected
      )
      .filter(conn => {
        const partner = conn.requester_id === user.id ? conn.recipient : conn.requester;
        const lastInteraction = (partner as any).updated_at || conn.updated_at;
        if (!lastInteraction) return true;
        
        const lastInteractionDate = new Date(lastInteraction);
        return lastInteractionDate < ninetyDaysAgo;
      })
      .sort((a, b) => {
        const partnerA = a.requester_id === user.id ? a.recipient : a.requester;
        const partnerB = b.requester_id === user.id ? b.recipient : b.requester;
        const lastInteractionA = (partnerA as any).updated_at || a.updated_at;
        const lastInteractionB = (partnerB as any).updated_at || b.updated_at;
        
        if (!lastInteractionA) return 1;
        if (!lastInteractionB) return -1;
        
        return new Date(lastInteractionA).getTime() - new Date(lastInteractionB).getTime();
      });
  }, [connections, user]);

  const getConnectionPartner = (connection: any) => {
    if (!user) return { name: 'Unknown', initials: 'U', avatar: null, lastActive: null, id: null, firstName: null, lastName: null };
    const partner = connection.requester_id === user.id ? connection.recipient : connection.requester;
    return {
      name: partner.full_name || 'Unknown User',
      initials: partner.full_name?.charAt(0) || 'U',
      avatar: partner.avatar_url,
      lastActive: partner.updated_at,
      id: partner.id || null,
      firstName: partner.first_name || null,
      lastName: partner.last_name || null
    };
  };

  const getDaysAgo = (dateString: string | null) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const formatDaysAgo = (days: number | null) => {
    if (days === null) return 'No activity';
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 30) return `${days} days ago`;
    if (days < 365) {
      const months = Math.floor(days / 30);
      return `${months} ${months === 1 ? 'month' : 'months'} ago`;
    }
    const years = Math.floor(days / 365);
    return `${years} ${years === 1 ? 'year' : 'years'} ago`;
  };

  const handleMessage = (connectionId: string) => {
    router.push(`/dashboard/messages?connection=${connectionId}`);
  };

  const handleConnectionAction = async (connectionId: string, action: 'accept' | 'decline') => {
    setProcessingId(connectionId);
    try {
      const status = action === 'accept' ? 'accepted' : 'declined';
      await updateConnectionStatus(connectionId, status);
      await refreshConnections();
    } catch (error) {
      console.error('Failed to update connection:', error);
    } finally {
      setProcessingId(null);
    }
  };

  // Memoize the unconnected members using relevance-based algorithm
  const unconnectedMembers = useMemo(() => {
    if (!chapterMembers || !profile || !snapshotTaken || sessionSeed === null) return [];
    
    const connectedUserIds = new Set(
      localConnectionsSnapshot.map(conn => 
        conn.requester_id === profile.id ? conn.recipient_id : conn.requester_id
      )
    );
    
    // First, get members with avatars (prioritized)
    const membersWithAvatars = chapterMembers.filter(member => 
      member.id !== profile.id && 
      !connectedUserIds.has(member.id) &&
      member.avatar_url && 
      member.avatar_url.trim() !== ''
    );
    
    // If we have fewer than MAX_SUGGESTIONS_COUNT members with avatars, also include members without avatars
    // This ensures we always have suggestions if available
    let availableMembers = membersWithAvatars;
    if (membersWithAvatars.length < MAX_SUGGESTIONS_COUNT) {
      const membersWithoutAvatars = chapterMembers.filter(member => 
        member.id !== profile.id && 
        !connectedUserIds.has(member.id) &&
        (!member.avatar_url || member.avatar_url.trim() === '')
      );
      // Combine: members with avatars first, then members without avatars
      // The priority calculation will still favor those with avatars due to avatar bonus
      availableMembers = [...membersWithAvatars, ...membersWithoutAvatars];
    }
    
    // Group by role: alumni, active_member, admin (and others)
    const alumniMembers = availableMembers.filter(member => member.role === 'alumni');
    const activeMembers = availableMembers.filter(member => member.role === 'active_member');
    const adminMembers = availableMembers.filter(member => member.role === 'admin');
    const otherMembers = availableMembers.filter(member => 
      member.role !== 'alumni' && 
      member.role !== 'active_member' && 
      member.role !== 'admin'
    );
    
    // Apply weighted random shuffle to each group
    // Higher randomness factor = more random, lower = more predictable
    const shuffledAlumni = weightedRandomShuffle(
      alumniMembers,
      calculateNetworkingPriority,
      0.4 // 40% randomness factor
    );
    
    const shuffledActive = weightedRandomShuffle(
      activeMembers,
      calculateNetworkingPriority,
      0.4
    );
    
    const shuffledAdmin = weightedRandomShuffle(
      adminMembers,
      calculateNetworkingPriority,
      0.4
    );
    
    const shuffledOther = weightedRandomShuffle(
      otherMembers,
      calculateNetworkingPriority,
      0.4
    );
    
    // Combine with priority order: alumni first, then active members, then admin, then others
    const prioritizedMembers = [
      ...shuffledAlumni,
      ...shuffledActive,
      ...shuffledAdmin,
      ...shuffledOther
    ];
    
    // Get top 30 for variety, then shuffle and return up to 24
    const topPool = prioritizedMembers.slice(0, Math.min(30, prioritizedMembers.length));
    
    if (topPool.length <= MAX_SUGGESTIONS_COUNT) {
      const shuffledPool = seededShuffle(topPool, sessionSeed);
      return shuffledPool;
    }
    
    const shuffledPool = seededShuffle(topPool, sessionSeed);
    return shuffledPool.slice(0, MAX_SUGGESTIONS_COUNT);
  }, [chapterMembers, profile, snapshotTaken, localConnectionsSnapshot, sessionSeed]);

  // Transform ChapterMemberData to ChapterMember for LinkedInStyleChapterCard
  const transformToChapterMember = useCallback((member: ChapterMemberData): ChapterMember => {
    const mutualConnections = (member as any).mutualConnections || [];
    const mutualCount = (member as any).mutualConnectionsCount || 0;
    
    return {
      id: member.id,
      name: member.full_name || `${member.first_name || ''} ${member.last_name || ''}`.trim() || 'Chapter Member',
      year: member.grad_year ? `Class of ${member.grad_year}` : undefined,
      major: member.major || undefined,
      position: member.chapter_role || undefined,
      interests: member.bio ? [member.bio] : [],
      avatar: member.avatar_url || undefined,
      verified: false,
      mutualConnections: mutualConnections.map((mc: any) => ({
        id: mc.id || mc.user_id || '',
        name: mc.name || mc.full_name || 'Unknown',
        avatar: mc.avatar || mc.avatar_url || undefined,
      })),
      mutualConnectionsCount: mutualCount,
      description: member.bio || '',
    };
  }, []);

  // Get displayed suggestions (lazy loaded subset)
  const displayedSuggestions = useMemo(() => {
    return unconnectedMembers.slice(0, suggestionsDisplayCount).map(transformToChapterMember);
  }, [unconnectedMembers, suggestionsDisplayCount, transformToChapterMember]);

  const hasMoreSuggestions = unconnectedMembers.length > suggestionsDisplayCount;

  // Load more suggestions
  const loadMoreSuggestions = useCallback(() => {
    if (isLoadingMoreSuggestions || !hasMoreSuggestions) return;
    
    setIsLoadingMoreSuggestions(true);
    setTimeout(() => {
      setSuggestionsDisplayCount(prev => 
        Math.min(prev + LOAD_MORE_SUGGESTIONS_INCREMENT, unconnectedMembers.length, MAX_SUGGESTIONS_COUNT)
      );
      setIsLoadingMoreSuggestions(false);
    }, 150);
  }, [isLoadingMoreSuggestions, hasMoreSuggestions, unconnectedMembers.length]);

  // Intersection Observer for suggestions infinite scroll
  useEffect(() => {
    if (!hasMoreSuggestions) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreSuggestions && !isLoadingMoreSuggestions) {
          loadMoreSuggestions();
        }
      },
      {
        root: null,
        rootMargin: '200px', // Start loading 200px before reaching the bottom
        threshold: 0.1,
      }
    );

    const currentTarget = suggestionsObserverTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasMoreSuggestions, isLoadingMoreSuggestions, loadMoreSuggestions]);

  const handleConnect = async (member: ChapterMemberData) => {
    if (!profile) return;
    setSelectedMemberForConnection(member);
    setShowConnectionDialog(true);
  };

  const handleSendConnectionRequest = async (message?: string) => {
    if (!profile || !selectedMemberForConnection) return;
    
    setConnectionLoading(selectedMemberForConnection.id);
    try {
      await sendConnectionRequest(selectedMemberForConnection.id, message);
      
      const newConnection = {
        id: `temp-${Date.now()}`,
        requester_id: profile.id,
        recipient_id: selectedMemberForConnection.id,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      setLocalConnectionsSnapshot(prev => [...prev, newConnection]);
      setConnectedUserName(selectedMemberForConnection.full_name || `${selectedMemberForConnection.first_name || ''} ${selectedMemberForConnection.last_name || ''}`.trim() || 'Chapter Member');
      setSuccessModalOpen(true);
      setShowConnectionDialog(false);
      setSelectedMemberForConnection(null);
    } catch (error) {
      console.error('Failed to send connection request:', error);
    } finally {
      setConnectionLoading(null);
    }
  };

  // Show loading while connections are being loaded
  if (membersLoading || connectionsLoading || !snapshotTaken) {
    return (
      <div className="min-h-screen bg-gray-50 pt-4 pb-20 px-4">
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-primary" />
            <span className="ml-2 text-gray-600">Loading network...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Search Bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 py-3">
        <div className="flex items-center space-x-3 bg-gray-100 rounded-lg px-4 py-2 mx-4">
          <Search className="h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="I'm looking for..."
            className="flex-1 bg-transparent border-none outline-none text-sm text-gray-700 placeholder-gray-400"
          />
        </div>
      </div>

      {/* Tabs - Full width, no padding */}
      <div className="bg-white border-b border-gray-200">
        <div className="flex">
          <button
            onClick={() => setActiveTab('grow')}
            className={cn(
              "flex-1 py-3 text-sm font-medium border-b-2 transition-colors",
              activeTab === 'grow'
                ? "border-brand-accent text-brand-accent"
                : "border-transparent text-gray-600 hover:text-gray-900"
            )}
          >
            Grow
          </button>
          <button
            onClick={() => setActiveTab('catchup')}
            className={cn(
              "flex-1 py-3 text-sm font-medium border-b-2 transition-colors",
              activeTab === 'catchup'
                ? "border-brand-accent text-brand-accent"
                : "border-transparent text-gray-600 hover:text-gray-900"
            )}
          >
            Catch up
          </button>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Grow Tab - Incoming Requests */}
        {activeTab === 'grow' && (
          <>
            {incomingRequests.length > 0 && (
              <div>
                <h2 className="text-base font-semibold text-gray-900 mb-3">
                  Invitations ({incomingRequests.length})
                </h2>
                <div className="space-y-3">
                  {incomingRequests.map((connection) => {
                    const partner = getConnectionPartner(connection);
                    return (
                      <div
                        key={connection.id}
                        className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between"
                      >
                        <div className="flex items-center space-x-3 flex-1 min-w-0">
                          {partner.id ? (
                            <ClickableAvatar
                              userId={partner.id}
                              avatarUrl={partner.avatar}
                              fullName={partner.name}
                              firstName={partner.firstName}
                              lastName={partner.lastName}
                              size="md"
                              className="w-12 h-12 flex-shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center text-brand-primary text-sm font-semibold flex-shrink-0">
                              {partner.avatar ? (
                                <img 
                                  src={partner.avatar} 
                                  alt={partner.name}
                                  className="w-full h-full rounded-full object-cover"
                                />
                              ) : (
                                partner.initials
                              )}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            {partner.id ? (
                              <ClickableUserName
                                userId={partner.id}
                                fullName={partner.name}
                                className="text-sm font-medium text-gray-900 truncate"
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {partner.name}
                              </p>
                            )}
                            {connection.message && (
                              <p className="text-xs text-gray-500 mt-0.5 truncate">
                                {connection.message}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2 flex-shrink-0 ml-2">
                          <button
                            onClick={() => handleConnectionAction(connection.id, 'decline')}
                            disabled={processingId === connection.id}
                            className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50 transition-colors disabled:opacity-50"
                          >
                            {processingId === connection.id ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400" />
                            ) : (
                              <X className="h-4 w-4 text-gray-600" />
                            )}
                          </button>
                          <button
                            onClick={() => handleConnectionAction(connection.id, 'accept')}
                            disabled={processingId === connection.id}
                            className="w-8 h-8 rounded-full bg-brand-accent flex items-center justify-center hover:bg-accent-700 transition-colors disabled:opacity-50"
                          >
                            {processingId === connection.id ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                            ) : (
                              <CheckCircle className="h-4 w-4 text-white" />
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {incomingRequests.length === 0 && (
              <div className="text-center py-12">
                <UserPlus className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600 text-base font-medium mb-1">No invitations</p>
                <p className="text-gray-500 text-sm">When someone sends you a connection request, it will appear here</p>
              </div>
            )}
          </>
        )}

        {/* Catch up Tab - Recently Connected + Reconnect */}
        {activeTab === 'catchup' && (
          <>
            {/* Recently Connected Section */}
            {recentlyConnected.length > 0 && (() => {
              const displayedRecentlyConnected = recentlyConnected.slice(0, recentlyConnectedLimit);
              const hasMoreRecentlyConnected = recentlyConnected.length > recentlyConnectedLimit;
              const remainingRecentlyConnected = recentlyConnected.length - recentlyConnectedLimit;
              const isAtMax = recentlyConnectedLimit >= MAX_DISPLAY;
              
              return (
                <div className="mb-6">
                  <h2 className="text-base font-semibold text-gray-900 mb-3">
                    Recently Connected ({recentlyConnected.length})
                  </h2>
                  <div className="space-y-3">
                    {displayedRecentlyConnected.map((connection) => {
                      const partner = getConnectionPartner(connection);
                      const daysSinceConnection = getDaysAgo(connection.updated_at || connection.created_at);
                      
                      return (
                        <div
                          key={connection.id}
                          className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between"
                        >
                          <div className="flex items-center space-x-3 flex-1 min-w-0">
                            {partner.id ? (
                              <ClickableAvatar
                                userId={partner.id}
                                avatarUrl={partner.avatar}
                                fullName={partner.name}
                                firstName={partner.firstName}
                                lastName={partner.lastName}
                                size="md"
                                className="w-12 h-12 flex-shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center text-brand-primary text-sm font-semibold flex-shrink-0">
                                {partner.avatar ? (
                                  <img 
                                    src={partner.avatar} 
                                    alt={partner.name}
                                    className="w-full h-full rounded-full object-cover"
                                  />
                                ) : (
                                  partner.initials
                                )}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              {partner.id ? (
                                <ClickableUserName
                                  userId={partner.id}
                                  fullName={partner.name}
                                  className="text-sm font-medium text-gray-900 truncate"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              ) : (
                                <p className="text-sm font-medium text-gray-900 truncate">
                                  {partner.name}
                                </p>
                              )}
                              <p className="text-xs text-gray-500 mt-0.5">
                                Connected {daysSinceConnection !== null && daysSinceConnection === 0 
                                  ? 'today' 
                                  : daysSinceConnection === 1 
                                  ? 'yesterday'
                                  : `${daysSinceConnection} days ago`
                                }
                              </p>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleMessage(connection.id)}
                            className="rounded-full bg-brand-primary hover:bg-brand-primary-hover text-white text-sm px-3 h-8 shadow-md hover:shadow-lg transition-all duration-200 border border-brand-primary-hover/20"
                            >
                            <MessageCircle className="h-3 w-3 mr-1" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Smart Toggle: Load More / Show Less */}
                  {recentlyConnected.length > INITIAL_LIMIT && (
                    <div className="mt-4">
                      {isAtMax ? (
                        <div className="space-y-2">
                          <Button
                            variant="outline"
                            onClick={() => setRecentlyConnectedLimit(INITIAL_LIMIT)}
                            className="w-full text-gray-600 border-gray-300 hover:bg-gray-50"
                          >
                            Show Less
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => router.push('/dashboard/network/manage?filter=recently_connected')}
                            className="w-full text-brand-accent border-brand-accent hover:bg-accent-50"
                          >
                            View All in Manage Network
                          </Button>
                        </div>
                      ) : (
                        <div className="flex space-x-2">
                          {hasMoreRecentlyConnected && (
                            <Button
                              variant="outline"
                              onClick={() => setRecentlyConnectedLimit(prev => 
                                Math.min(prev + LOAD_MORE_INCREMENT, recentlyConnected.length)
                              )}
                              className="rounded-full flex-1 text-brand-accent border-brand-accent hover:bg-accent-50"
                            >
                              Load More ({remainingRecentlyConnected} remaining)
                            </Button>
                          )}
                          {recentlyConnectedLimit > INITIAL_LIMIT && (
                            <Button
                              variant="ghost"
                              onClick={() => setRecentlyConnectedLimit(INITIAL_LIMIT)}
                              className="text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                            >
                              Show Less
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Reconnect Section */}
            {reconnectConnections.length > 0 && (() => {
              const displayedReconnect = reconnectConnections.slice(0, reconnectLimit);
              const hasMoreReconnect = reconnectConnections.length > reconnectLimit;
              const remainingReconnect = reconnectConnections.length - reconnectLimit;
              const isAtMax = reconnectLimit >= MAX_DISPLAY;
              
              return (
                <div className={recentlyConnected.length > 0 ? 'mb-6' : ''}>
                  <h2 className="text-base font-semibold text-gray-900 mb-3">
                    Reconnect ({reconnectConnections.length})
                  </h2>
                  <div className="space-y-3">
                    {displayedReconnect.map((connection) => {
                      const partner = getConnectionPartner(connection);
                      const daysSinceActive = getDaysAgo(partner.lastActive);
                      
                      return (
                        <div
                          key={connection.id}
                          className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between"
                        >
                          <div className="flex items-center space-x-3 flex-1 min-w-0">
                            {partner.id ? (
                              <ClickableAvatar
                                userId={partner.id}
                                avatarUrl={partner.avatar}
                                fullName={partner.name}
                                firstName={partner.firstName}
                                lastName={partner.lastName}
                                size="md"
                                className="w-12 h-12 flex-shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center text-brand-primary text-sm font-semibold flex-shrink-0">
                                {partner.avatar ? (
                                  <img 
                                    src={partner.avatar} 
                                    alt={partner.name}
                                    className="w-full h-full rounded-full object-cover"
                                  />
                                ) : (
                                  partner.initials
                                )}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              {partner.id ? (
                                <ClickableUserName
                                  userId={partner.id}
                                  fullName={partner.name}
                                  className="text-sm font-medium text-gray-900 truncate"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              ) : (
                                <p className="text-sm font-medium text-gray-900 truncate">
                                  {partner.name}
                                </p>
                              )}
                              <p className="text-xs text-gray-500 mt-0.5">
                                Last active: {formatDaysAgo(daysSinceActive)}
                              </p>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleMessage(connection.id)}
                            className="rounded-full text-brand-accent border-brand-accent hover:bg-accent-50 text-xs px-3 h-8 shadow-lg hover:shadow-xl transition-all duration-200 border-2 border-brand-primary/30"
                          >
                            <MessageCircle className="h-3 w-3 mr-1" />
                            Say hi
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Smart Toggle: Load More / Show Less */}
                  {reconnectConnections.length > INITIAL_LIMIT && (
                    <div className="mt-4">
                      {isAtMax ? (
                        <div className="space-y-2">
                          <Button
                            variant="outline"
                            onClick={() => setReconnectLimit(INITIAL_LIMIT)}
                            className="w-full text-gray-600 border-gray-300 hover:bg-gray-50"
                          >
                            Show Less
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => router.push('/dashboard/network/manage?filter=reconnect')}
                            className="w-full text-brand-accent border-brand-accent hover:bg-accent-50"
                          >
                            View All in Manage Network
                          </Button>
                        </div>
                      ) : (
                        <div className="flex space-x-2">
                          {hasMoreReconnect && (
                            <Button
                              variant="outline"
                              onClick={() => setReconnectLimit(prev => 
                                Math.min(prev + LOAD_MORE_INCREMENT, reconnectConnections.length)
                              )}
                              className="flex-1 text-brand-accent border-brand-accent hover:bg-accent-50"
                            >
                              Load More ({remainingReconnect} remaining)
                            </Button>
                          )}
                          {reconnectLimit > INITIAL_LIMIT && (
                            <Button
                              variant="ghost"
                              onClick={() => setReconnectLimit(INITIAL_LIMIT)}
                              className="text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                            >
                              Show Less
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Empty State */}
            {recentlyConnected.length === 0 && reconnectConnections.length === 0 && (
              <div className="text-center py-12">
                <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600 text-base font-medium mb-1">No connections to catch up with</p>
                <p className="text-gray-500 text-sm">Your recent and inactive connections will appear here</p>
              </div>
            )}
          </>
        )}

        {/* Manage my network */}
        <div
          onClick={() => router.push('/dashboard/network/manage')}
          className="bg-white rounded-full border border-gray-200 p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center space-x-3">
            <Users className="h-5 w-5 text-gray-600" />
            <span className="text-sm font-medium text-gray-900">Manage my network</span>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-400" />
        </div>

        {/* People You May Know */}
        {unconnectedMembers.length > 0 && (
          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-3">
              People you may know
              {profile?.chapter && (
                <span className="text-gray-600 font-normal"> from {profile.chapter}</span>
              )}
            </h2>
            
            {/* 2x2 Grid Layout */}
            <div className="grid grid-cols-2 gap-3">
              {displayedSuggestions.map((member) => (
                <LinkedInStyleChapterCard
                  key={member.id}
                  member={member}
                  onClick={() => {
                    // Optional: Navigate to profile or handle card click
                  }}
                />
              ))}
            </div>

            {/* Loading indicator and observer target */}
            {hasMoreSuggestions && (
              <div ref={suggestionsObserverTarget} className="flex items-center justify-center py-6">
                {isLoadingMoreSuggestions ? (
                  <div className="flex items-center space-x-2 text-gray-500">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-sm">Loading more suggestions...</span>
                  </div>
                ) : (
                  <div className="h-20" /> // Spacer for intersection observer
                )}
              </div>
            )}

            {/* Show count and button when all suggestions are loaded */}
            {!hasMoreSuggestions && unconnectedMembers.length > 0 && (
              <div className="text-center py-4 space-y-3">
                {unconnectedMembers.length > INITIAL_SUGGESTIONS_COUNT && (
                  <p className="text-sm text-gray-500">
                    Showing all {unconnectedMembers.length} suggestion{unconnectedMembers.length !== 1 ? 's' : ''}
                  </p>
                )}
                <Button
                  onClick={() => router.push('/dashboard/alumni/pipeline')}
                  className="rounded-full bg-brand-primary hover:bg-brand-primary-hover text-white text-sm px-6 py-2 shadow-md hover:shadow-lg transition-all duration-200 border border-brand-primary-hover/20"
                >
                  View More Connections
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Success Modal */}
      {successModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full mx-4 p-6 text-center">
            <div className="flex justify-end mb-2">
              <button
                onClick={() => setSuccessModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="mb-6">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Connection Request Sent!
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Your connection request has been sent to{' '}
                <span className="font-medium text-gray-900">{connectedUserName}</span>
              </p>
            </div>
            
            <Button 
              onClick={() => setSuccessModalOpen(false)}
              className="w-full bg-brand-primary hover:bg-brand-primary-hover h-12 text-base font-medium"
            >
              Got it!
            </Button>
          </div>
        </div>
      )}

      {/* Connection Request Dialog */}
      <ConnectionRequestDialog
        isOpen={showConnectionDialog}
        onClose={() => {
          setShowConnectionDialog(false);
          setSelectedMemberForConnection(null);
        }}
        onSend={handleSendConnectionRequest}
        recipientName={selectedMemberForConnection?.full_name || (selectedMemberForConnection ? `${selectedMemberForConnection.first_name || ''} ${selectedMemberForConnection.last_name || ''}`.trim() : undefined)}
        isLoading={!!connectionLoading}
      />
    </div>
  );
}
