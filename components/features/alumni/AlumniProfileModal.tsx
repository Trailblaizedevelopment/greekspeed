import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  X, 
  Mail, 
  Phone, 
  MessageSquare, 
  Building2, 
  Star,
  Share2,
  Handshake,
  Calendar,
  Users,
  ArrowRight
} from "lucide-react";
import Link from 'next/link';
import { Alumni } from "@/lib/alumniConstants";
import ImageWithFallback from "@/components/figma/ImageWithFallback";
import { useConnections } from "@/lib/contexts/ConnectionsContext";
import { useAuth } from "@/lib/supabase/auth-context";
import { useState, useEffect } from "react";
import { useRouter } from 'next/navigation';
import { trackActivity, ActivityTypes } from "@/lib/utils/activityUtils";
import { createPortal } from 'react-dom';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { DEFAULT_BANNER_IMAGE } from '@/lib/constants';
import { ShareProfileDrawer } from "@/components/features/messaging/ShareProfileDrawer";
import { supabase } from "@/lib/supabase/client";
import { ConnectionRequestDialog } from "@/components/features/connections/ConnectionRequestDialog";
import { formatLocationLineForApp } from "@/types/canonicalPlace";

interface AlumniProfileModalProps {
  alumni: Alumni | null;
  isOpen: boolean;
  onClose: () => void;
}

const getChapterName = (chapterId: string, isMobile: boolean = false): string => {
  // This maps the UUIDs from your database to readable chapter names
  const chapterMap: Record<string, string> = {
    "404e65ab-1123-44a0-81c7-e8e75118e741": "Sigma Chi Eta (Ole Miss)",
    "8ede10e8-b848-427d-8f4a-aacf74cea2c2": "Phi Gamma Delta Omega Chi (Chapman)",
    "b25a4acf-59f0-46d4-bb5c-d41fda5b3252": "Phi Delta Theta Mississippi Alpha (Ole Miss)",
    "ff740e3f-c45c-4728-a5d5-22088c19d847": "Kappa Sigma Delta-Xi (Ole Miss)"
  };
  
  const fullName = chapterMap[chapterId] || chapterId;
  
  // For mobile, remove parenthetical information to save space
  if (isMobile) {
    return fullName.replace(/\s*\([^)]*\)/g, '');
  }
  
  return fullName;
};

export function AlumniProfileModal({ alumni, isOpen, onClose }: AlumniProfileModalProps) {
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);
  const isMobile = useIsMobile();
  const router = useRouter();
  const [showConnectionDialog, setShowConnectionDialog] = useState(false);
  
  // On mobile, route to profile page instead of showing modal
  useEffect(() => {
    if (isOpen && isMobile && alumni?.id) {
      router.push(`/dashboard/profile/${alumni.id}`);
      onClose(); // Close modal state
      return;
    }
  }, [isOpen, isMobile, alumni, router, onClose]);
  
  // Track profile view when modal opens (desktop only)
  useEffect(() => {
    if (isOpen && !isMobile && alumni && user && user.id !== alumni.id) {
      trackActivity(user.id, ActivityTypes.PROFILE_VIEW, {
        viewedProfileId: alumni.id,
        viewedProfileName: alumni.fullName,
        timestamp: new Date().toISOString()
      }).catch(error => {
        console.error('Failed to track profile view:', error);
      });
    }
  }, [isOpen, isMobile, alumni, user]);
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
  const [profileSlug, setProfileSlug] = useState<string | null>(null);
  const [bioExpanded, setBioExpanded] = useState(false);

  const BIO_DISPLAY_LIMIT = 200;
  const bioText = alumni?.description || '';
  const bioOverLimit = bioText.length > BIO_DISPLAY_LIMIT;
  const displayBioText = bioOverLimit && !bioExpanded
    ? `${bioText.slice(0, BIO_DISPLAY_LIMIT)}...`
    : bioText;

  // Ensure component is mounted (for SSR)
  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch profile slug for View Full Profile link
  useEffect(() => {
    if (alumni?.id && isOpen && !isMobile) {
      const alumniId = alumni.id; 
      async function fetchProfileSlug() {
        try {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('profile_slug, username')
            .eq('id', alumniId)
            .single();
          
          if (profileData) {
            setProfileSlug(profileData.profile_slug || profileData.username || null);
          }
        } catch (error) {
          console.error('Failed to fetch profile slug:', error);
          setProfileSlug(null);
        }
      }
      fetchProfileSlug();
    }
  }, [alumni?.id, isOpen, isMobile]);

  // Reset connection loading when modal opens or alumni changes so Connect isn't stuck disabled
  useEffect(() => {
    if (isOpen && alumni) {
      setConnectionLoading(false);
    }
  }, [isOpen, alumni?.id]);

  // Don't render modal on mobile
  if (!alumni || !isOpen || !mounted || isMobile) return null;

  const handleConnectionAction = async (action: 'connect' | 'accept' | 'decline' | 'cancel') => {
    if (!user || user.id === alumni.id) return;
    
    if (action === 'connect') {
      setShowConnectionDialog(true);
      return;
    }
    
    setConnectionLoading(true);
    try {
      switch (action) {
        case 'accept':
          const connectionId = getConnectionId(alumni.id);
          if (connectionId) {
            await updateConnectionStatus(connectionId, 'accepted');
          }
          break;
        case 'decline':
          const declineConnectionId = getConnectionId(alumni.id);
          if (declineConnectionId) {
            await updateConnectionStatus(declineConnectionId, 'declined');
          }
          break;
        case 'cancel':
          const cancelConnectionId = getConnectionId(alumni.id);
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

  const handleSendConnectionRequest = async (message?: string) => {
    await sendConnectionRequest(alumni.id, message);
  };

  const handleMessageClick = () => {
    const connectionId = getConnectionId(alumni.id);
    if (connectionId) {
      // Navigate to messages page with the connection pre-selected
      router.push(`/dashboard/messages?connection=${connectionId}`);
      // Close the modal after navigation
      onClose();
    }
  };

  const handleShareProfile = () => {
    if (!user) return;
    setShareDrawerOpen(true);
  };

  const canShareProfile = () => {
    if (!user || user.id === alumni.id) return false;
    // Can share if user has at least one accepted connection
    const acceptedConnections = connections.filter(conn => conn.status === 'accepted');
    return acceptedConnections.length > 0;
  };

  const getProfileSlug = () => {
    // Use fetched slug if available, otherwise fallback to ID
    return profileSlug || alumni.id;
  };

  const handleViewFullProfile = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const slug = getProfileSlug();
    router.push(`/profile/${slug}`);
    onClose(); // Close modal when navigating
  };

  const renderConnectionButton = () => {
    if (!user || user.id === alumni.id) return null;
    
    if (!alumni.hasProfile) {
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
    
    const status = getConnectionStatus(alumni.id);
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
      
      case 'declined':
        return (
          <Button
            className="w-full text-gray-400 border-gray-200 rounded-full font-medium"
            variant="outline"
            disabled
          >
            Declined
          </Button>
        );
      
      default:
        return null;
    }
  };

  // Use createPortal to render modal at document body level
  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm z-[10000]"
        onClick={onClose}
      />
      
      {/* Modal Card - Compact Design */}
      <div 
        className="relative bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 z-[10001]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Profile Header with Integrated Close Button */}
        <div className="relative">
          {/* Background Banner */}
          <div className="h-20 rounded-t-xl overflow-hidden">
            <img src={DEFAULT_BANNER_IMAGE} alt="Default banner" className="w-full h-full object-cover" />
          </div>
          
          {/* Close Button - Positioned in top-right corner */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="absolute top-3 right-3 h-8 w-8 p-0 bg-white/80 hover:bg-white rounded-full shadow-sm"
          >
            <X className="h-4 w-4" />
          </Button>

          {/* Share Profile Button - Icon only, circular, top left below banner */}
          {canShareProfile() && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleShareProfile}
              className="absolute top-16 left-3 h-10 w-10 p-0 bg-white/90 hover:bg-white border-brand-primary text-brand-primary rounded-full shadow-sm flex items-center justify-center z-20"
              title="Share this profile with someone"
            >
              <Share2 className="h-4 w-4" />
            </Button>
          )}

          {/* View Full Profile Link - Text link, positioned to the right of Share button, below banner */}
          {alumni.hasProfile && (
            <Link
              href={`/profile/${getProfileSlug()}`}
              onClick={handleViewFullProfile}
              className="absolute top-20 left-14 px-3 py-1.5 text-sm font-medium text-slate-900 hover:text-slate-700 transition-colors z-20 flex items-center gap-1.5 bg-white/90 hover:bg-white rounded-md border-0"
              title="View full profile page"
            >
              <span className="font-light">View Full Profile</span>
              <ArrowRight className="h-3.5 w-3.5 font-light" />
            </Link>
          )}
          
          {/* Profile Content Overlapping Banner */}
          <div className="px-6 -mt-10 relative">
            {/* Avatar */}
            <div className="flex justify-center mb-3">
              <div className="w-16 h-16 rounded-full border-4 border-white bg-white shadow-sm overflow-hidden relative">
                {alumni.avatar ? (
                  <ImageWithFallback 
                    src={alumni.avatar} 
                    alt={alumni.fullName} 
                    width={64} 
                    height={64} 
                    className="w-full h-full object-cover" 
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-brand-primary to-brand-primary flex items-center justify-center">
                    <span className="text-white font-medium text-lg">
                      {alumni.firstName?.[0] || ''}{alumni.lastName?.[0] || ''}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Profile Info - Compact */}
            <div className="text-center mb-4">
              <div className="flex items-center justify-center gap-2 mb-1">
                <h2 className="text-xl font-semibold text-gray-900">{alumni.fullName}</h2>
                {alumni.verified && (
                  <Badge className="bg-accent-500 text-white text-xs">✓</Badge>
                )}
                {alumni.isActivelyHiring && (
                  <Badge className="bg-gradient-to-r from-gray-600 to-gray-700 text-white text-xs">
                    Hiring
                  </Badge>
                )}
              </div>
              <p className="text-base text-gray-600 mb-1">{alumni.jobTitle}</p>
              <div className="flex items-center justify-center space-x-2 text-gray-500 text-sm">
                <Building2 className="h-3 w-3" />
                <span>{alumni.company}</span>
              </div>
            </div>

            {/* Compact Description - with View more/less when long */}
            {bioText ? (
              <div className="mb-4">
                <p className="text-gray-600 text-center text-sm leading-relaxed whitespace-pre-wrap">
                  {displayBioText}
                </p>
                {bioOverLimit && (
                  <button
                    type="button"
                    onClick={() => setBioExpanded((prev) => !prev)}
                    className="text-sm text-brand-primary hover:underline font-medium mt-1 block mx-auto"
                  >
                    {bioExpanded ? 'View less' : 'View more'}
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </div>

        {/* Compact Information Grid */}
        <div className="px-6 pb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            {/* Contact Information - Compact */}
            <div className="space-y-2">
              <h3 className="font-medium text-gray-900 text-sm flex items-center">
                <Mail className="h-3 w-3 mr-2 text-gray-400" />
                Contact
              </h3>
              <div className="space-y-1 text-xs">
                {/* Email and Phone in same row on mobile */}
                <div className="flex flex-row items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-gray-500">Email</span>
                    <span className="text-gray-900 truncate">
                      {alumni.email || ((alumni.isEmailPublic === false || alumni.is_email_public === false) ? 'Hidden by user' : 'Not available')}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-gray-500">Phone</span>
                    <span className="text-gray-900">
                      {alumni.phone || ((alumni.isPhonePublic === false || alumni.is_phone_public === false) ? 'Hidden by user' : 'Not available')}
                    </span>
                  </div>
                </div>
                {/* Location in column */}
                {alumni.location && alumni.location !== "Not Specified" && (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-gray-500">Location</span>
                    <span className="text-gray-900">{formatLocationLineForApp(alumni.location)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Professional Information - Compact */}
            <div className="space-y-2">
              <h3 className="font-medium text-gray-900 text-sm flex items-center">
                <Building2 className="h-3 w-3 mr-2 text-gray-400" />
                Professional
              </h3>
              <div className="space-y-1 text-xs">
                {alumni.industry && alumni.industry !== "Not Specified" && (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-gray-500">Industry</span>
                    <Badge variant="outline" className="text-xs">{alumni.industry}</Badge>
                  </div>
                )}
                {alumni.graduationYear && (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-gray-500">Grad Year</span>
                    <span className="text-gray-900">{alumni.graduationYear}</span>
                  </div>
                )}
                {alumni.chapter && (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-gray-500">Chapter</span>
                    <span className="text-gray-900">{getChapterName(alumni.chapter)}</span>
                  </div>
                )}
                {alumni.lastContact && (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-gray-500">Last Contact</span>
                    <span className="text-gray-900 text-xs">
                      {alumni.lastContact ? new Date(alumni.lastContact).toLocaleDateString() : 'Never'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Connection Button - Compact (when connected, opens messaging) */}
          <div className="mb-4">
            {renderConnectionButton()}
          </div>
        </div>
      </div>

      {/* Share Profile Drawer */}
      <ShareProfileDrawer
        isOpen={shareDrawerOpen}
        onClose={() => setShareDrawerOpen(false)}
        profileToShare={{
          id: alumni.id,
          type: 'alumni',
          name: alumni.fullName,
          avatarUrl: alumni.avatar || undefined
        }}
      />

      {/* Connection Request Dialog - elevated so it appears above this modal */}
      <ConnectionRequestDialog
        isOpen={showConnectionDialog}
        onClose={() => setShowConnectionDialog(false)}
        onSend={handleSendConnectionRequest}
        recipientName={alumni.fullName}
        isLoading={connectionLoading}
        elevatedForNestedModal
      />
    </div>,
    document.body
  );
} 