'use client';

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Mail, 
  MessageSquare, 
  Building2, 
  Users,
  X,
  Star,
  Handshake,
  Calendar,
  MapPin,
  Share2
} from "lucide-react";
import { UnifiedUserProfile } from "@/types/user-profile";
import ImageWithFallback from "@/components/figma/ImageWithFallback";
import { useConnections } from "@/lib/contexts/ConnectionsContext";
import { useAuth } from "@/lib/supabase/auth-context";
import { useState } from "react";
import { useRouter } from 'next/navigation';
import { ShareProfileDrawer } from "@/components/features/messaging/ShareProfileDrawer";
import { MobileMessagesDrawer } from "@/components/features/messaging/MobileMessagesDrawer";
import { ConnectionRequestDialog } from "@/components/features/connections/ConnectionRequestDialog";

interface ProfileSummaryProps {
  profile: UnifiedUserProfile;
  onClose: () => void;
}

const getChapterName = (chapterId: string | null | undefined): string => {
  if (!chapterId) return '';
  
  const chapterMap: Record<string, string> = {
    "404e65ab-1123-44a0-81c7-e8e75118e741": "Sigma Chi Eta (Ole Miss)",
    "8ede10e8-b848-427d-8f4a-aacf74cea2c2": "Phi Gamma Delta Omega Chi (Chapman)",
    "b25a4acf-59f0-46d4-bb5c-d41fda5b3252": "Phi Delta Theta Mississippi Alpha (Ole Miss)",
    "ff740e3f-c45c-4728-a5d5-22088c19d847": "Kappa Sigma Delta-Xi (Ole Miss)"
  };
  
  return chapterMap[chapterId] || chapterId;
};

export function ProfileSummary({ profile, onClose }: ProfileSummaryProps) {
  const { user } = useAuth();
  const router = useRouter();
  const { 
    sendConnectionRequest, 
    updateConnectionStatus, 
    cancelConnectionRequest, 
    getConnectionStatus,
    getConnectionId,
    connections
  } = useConnections();
  const [connectionLoading, setConnectionLoading] = useState(false);
  const [shareDrawerOpen, setShareDrawerOpen] = useState(false);
  const [messagesDrawerOpen, setMessagesDrawerOpen] = useState(false);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [showConnectionDialog, setShowConnectionDialog] = useState(false);

  const alumni = profile.alumni || {};
  const userData = profile.user || {};
  const userId = profile.id;
  const isAlumni = profile.type === 'alumni';

  const handleConnectionAction = async (action: 'connect' | 'accept' | 'decline' | 'cancel') => {
    if (!user || user.id === userId) return;
    
    if (action === 'connect') {
      setShowConnectionDialog(true);
      return;
    }
    
    setConnectionLoading(true);
    try {
      switch (action) {
        case 'accept':
          const connectionId = getConnectionId(userId);
          if (connectionId) {
            await updateConnectionStatus(connectionId, 'accepted');
          }
          break;
        case 'decline':
          const declineConnectionId = getConnectionId(userId);
          if (declineConnectionId) {
            await updateConnectionStatus(declineConnectionId, 'declined');
          }
          break;
        case 'cancel':
          const cancelConnectionId = getConnectionId(userId);
          if (cancelConnectionId) {
            await cancelConnectionRequest(cancelConnectionId);
          }
          break;
      }
    } catch (error) {
      console.error('Connection action failed:', error);
    } finally {
      setConnectionLoading(false);
    }
  };

  const handleMessageClick = () => {
    const connectionId = getConnectionId(userId);
    if (connectionId) {
      // Check if mobile
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
      
      if (isMobile) {
        // Open mobile messages drawer
        setSelectedConnectionId(connectionId);
        setMessagesDrawerOpen(true);
      } else {
        // Desktop: navigate to messages page
        router.push(`/dashboard/messages?connection=${connectionId}`);
        onClose();
      }
    }
  };

  const handleSendConnectionRequest = async (message?: string) => {
    await sendConnectionRequest(userId, message);
  };

  const handleShareProfile = () => {
    if (!user) return;
    setShareDrawerOpen(true);
  };

  const canShareProfile = () => {
    if (!user || user.id === userId) return false;
    // Check if user has at least one accepted connection
    const acceptedConnections = connections.filter(conn => conn.status === 'accepted');
    return acceptedConnections.length > 0;
  };

  const renderConnectionButton = () => {
    if (!user || user.id === userId) return null;
    
    if (isAlumni && !alumni.hasProfile) {
      return (
        <Button
          className="w-full text-gray-400 border-gray-200 rounded-full font-medium"
          variant="outline"
          disabled
        >
          No Profile
        </Button>
      );
    }
    
    const status = getConnectionStatus(userId);
    const isLoading = connectionLoading;

    switch (status) {
      case 'none':
        return (
          <Button
            onClick={() => handleConnectionAction('connect')}
            disabled={isLoading}
            className="w-full border border-brand-primary text-brand-primary bg-white hover:bg-primary-50 transition-colors duration-200 rounded-full font-medium"
            variant="outline"
          >
            {isLoading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b border-brand-primary mr-2" />
            ) : (
              <Users className="h-4 w-4 mr-2" />
            )}
            + Connect
          </Button>
        );
      
      case 'pending_sent':
        return (
          <Button
            onClick={() => handleConnectionAction('cancel')}
            disabled={isLoading}
            className="w-full border border-gray-300 text-gray-600 bg-white hover:bg-gray-50 transition-colors duration-200 rounded-full font-medium"
            variant="outline"
          >
            {isLoading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b border-gray-600 mr-2" />
            ) : (
              <Calendar className="h-4 w-4 mr-2" />
            )}
            Requested
          </Button>
        );
      
      case 'pending_received':
        return (
          <div className="flex space-x-2">
            <Button
              onClick={() => handleConnectionAction('accept')}
              disabled={isLoading}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-full font-medium"
            >
              {isLoading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b border-white mr-2" />
              ) : (
                <Star className="h-4 w-4 mr-2" />
              )}
              Accept
            </Button>
            <Button
              onClick={() => handleConnectionAction('decline')}
              disabled={isLoading}
              className="flex-1 border border-red-300 text-red-600 bg-white hover:bg-red-50 rounded-full font-medium"
              variant="outline"
            >
              {isLoading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b border-red-600 mr-2" />
              ) : (
                <X className="h-4 w-4 mr-2" />
              )}
              Decline
            </Button>
          </div>
        );
      
      case 'accepted':
        return (
          <Button
            onClick={handleMessageClick}
            className="w-full bg-green-50 text-green-700 border-green-300 rounded-full font-medium hover:bg-green-100 transition-colors"
            variant="outline"
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            Connected
          </Button>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="relative">
      {/* Share Profile Button - Icon only, overlapping banner, similar to desktop */}
      {canShareProfile() && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleShareProfile}
          className="absolute top-10 left-3 h-10 w-10 p-0 bg-white/90 hover:bg-white border-brand-primary text-brand-primary rounded-full shadow-sm flex items-center justify-center z-20"
          title="Share this profile with someone"
        >
          <Share2 className="h-4 w-4" />
        </Button>
      )}

      {/* Profile Content Overlapping Banner */}
      {/* Note: Banner is rendered in PublicProfileClient.tsx with back button and copy button */}
      <div className="px-4 -mt-16 relative">
        {/* Avatar - Larger for mobile */}
        <div className="flex justify-center mb-3">
          <div className="w-20 h-20 rounded-full border-4 border-white bg-white shadow-lg overflow-hidden relative">
            {profile.avatar_url ? (
              <ImageWithFallback 
                src={profile.avatar_url} 
                alt={profile.full_name} 
                width={80} 
                height={80} 
                className="w-full h-full object-cover" 
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-brand-primary to-brand-primary flex items-center justify-center">
                <span className="text-white font-medium text-2xl">
                  {profile.first_name?.[0] || ''}{profile.last_name?.[0] || ''}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Profile Info */}
        <div className="text-center mb-4">
          <div className="flex items-center justify-center gap-2 mb-1 flex-wrap">
            <h2 className="text-2xl font-bold text-gray-900">{profile.full_name}</h2>
            {isAlumni && alumni.verified && (
              <Badge className="bg-accent-500 text-white text-xs">✓</Badge>
            )}
            {isAlumni && alumni.isActivelyHiring && (
              <Badge className="bg-gradient-to-r from-gray-600 to-gray-700 text-white text-xs">
                Hiring
              </Badge>
            )}
          </div>
          
          {/* Job Title / Role */}
          {isAlumni && alumni.jobTitle && (
            <p className="text-lg text-gray-700 mb-1 font-medium">{alumni.jobTitle}</p>
          )}
          {!isAlumni && userData.chapter_role && (
            <p className="text-base text-gray-600 mb-1">{userData.chapter_role}</p>
          )}
          
          {/* Company (Alumni only) */}
          {isAlumni && alumni.company && (
            <div className="flex items-center justify-center space-x-2 text-gray-600 text-sm mb-2">
              <Building2 className="h-4 w-4" />
              <span>{alumni.company}</span>
            </div>
          )}
          
          {/* Bio / Description - Primary display */}
          {(isAlumni ? (alumni.description || profile.bio) : profile.bio) && (
            <p className="text-gray-700 text-center mb-2 text-sm leading-relaxed px-2">
              {isAlumni ? (alumni.description || profile.bio) : profile.bio}
            </p>
          )}
          
          {/* Location - Primary display */}
          {profile.location && profile.location !== "Not Specified" && (
            <div className="flex items-center justify-center space-x-1 text-gray-600 text-sm">
              <MapPin className="h-3 w-3" />
              <span>{profile.location}</span>
            </div>
          )}
        </div>

        {/* Connection Button (when connected, opens messaging) */}
        <div className="mb-4">
          {renderConnectionButton()}
        </div>
      </div>

      {/* Share Profile Drawer */}
      <ShareProfileDrawer
        isOpen={shareDrawerOpen}
        onClose={() => setShareDrawerOpen(false)}
        profileToShare={{
          id: userId,
          type: profile.type === 'alumni' ? 'alumni' : 'member',
          name: profile.full_name,
          avatarUrl: profile.avatar_url || undefined
        }}
      />

      {/* Mobile Messages Drawer */}
      <MobileMessagesDrawer
        isOpen={messagesDrawerOpen}
        onClose={() => {
          setMessagesDrawerOpen(false);
          setSelectedConnectionId(null);
        }}
        connectionId={selectedConnectionId}
      />

      {/* Connection Request Dialog */}
      <ConnectionRequestDialog
        isOpen={showConnectionDialog}
        onClose={() => setShowConnectionDialog(false)}
        onSend={handleSendConnectionRequest}
        recipientName={profile.full_name}
        isLoading={connectionLoading}
      />
    </div>
  );
}

