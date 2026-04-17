import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChapterMember } from "@/types/chapter";
import { MessageCircle, UserPlus, Clock, Users } from "lucide-react";
import { useConnections } from "@/lib/contexts/ConnectionsContext";
import { useAuth } from "@/lib/supabase/auth-context";
import { useState } from "react";
import { useRouter } from "next/navigation";
import ImageWithFallback from "@/components/figma/ImageWithFallback";
import { ClickableAvatar } from "@/components/features/user-profile/ClickableAvatar";
import { ClickableUserName } from "@/components/features/user-profile/ClickableUserName";
import { ConnectionRequestDialog } from "@/components/features/connections/ConnectionRequestDialog";

interface LinkedInStyleChapterCardProps {
  member: ChapterMember;
  onClick?: () => void;
}

export function LinkedInStyleChapterCard({ member, onClick }: LinkedInStyleChapterCardProps) {
  const { user } = useAuth();
  const router = useRouter();
  const { 
    sendConnectionRequest, 
    updateConnectionStatus, 
    cancelConnectionRequest, 
    getConnectionStatus,
    getConnectionId
  } = useConnections();
  const [connectionLoading, setConnectionLoading] = useState(false);
  const [showConnectionDialog, setShowConnectionDialog] = useState(false);

  const {
    id,
    name,
    year,
    major,
    position,
    avatar,
    interests = []
  } = member;
  
  // Use mutual connections from member prop (already calculated by API)
  const mutualConnections = member.mutualConnections || [];
  const connectionsCount = member.mutualConnectionsCount || 0;
  const mutualLoading = false;

  const handleConnectionAction = async (action: 'connect' | 'accept' | 'decline' | 'cancel', e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!user || user.id === id) return;
    
    if (action === 'connect') {
      setShowConnectionDialog(true);
      return;
    }
    
    setConnectionLoading(true);
    try {
      switch (action) {
        case 'accept':
          const connectionId = getConnectionId(id);
          if (connectionId) {
            await updateConnectionStatus(connectionId, 'accepted');
          }
          break;
        case 'decline':
          const declineConnectionId = getConnectionId(id);
          if (declineConnectionId) {
            await updateConnectionStatus(declineConnectionId, 'declined');
          }
          break;
        case 'cancel':
          const cancelConnectionId = getConnectionId(id);
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

  const handleMessageClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const connectionId = getConnectionId(id);
    if (connectionId) {
      router.push(`/dashboard/messages?connection=${connectionId}`);
    }
  };

  const handleSendConnectionRequest = async (message?: string) => {
    await sendConnectionRequest(id, message);
  };

  const isValidField = (value: any): boolean => {
    if (!value) return false;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed !== "" && 
             trimmed !== "Not specified" && 
             trimmed !== "N/A" && 
             trimmed !== "Unknown" &&
             trimmed !== "null";
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    return true;
  };

  const renderConnectionButton = () => {
    if (!user || user.id === id) return null;
    
    const status = getConnectionStatus(id);
    const isLoading = connectionLoading;

    switch (status) {
      case 'none':
        return (
          <Button
            onClick={(e) => handleConnectionAction('connect', e)}
            disabled={isLoading}
            className="w-full border border-brand-primary text-brand-primary bg-white hover:bg-primary-50 transition-colors duration-200 rounded-full font-medium h-8 sm:h-10 text-xs sm:text-sm"
            variant="outline"
          >
            {isLoading ? (
              <div className="animate-spin rounded-full h-3 w-3 sm:h-4 sm:w-4 border-b border-brand-primary mr-1 sm:mr-2" />
            ) : (
              <UserPlus className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
            )}
            Connect
          </Button>
        );
      
      case 'pending_sent':
        return (
          <Button
            onClick={(e) => handleConnectionAction('cancel', e)}
            disabled={isLoading}
            className="w-full border border-gray-300 text-gray-600 bg-white hover:bg-gray-50 transition-colors duration-200 rounded-full font-medium h-8 sm:h-10 flex items-center justify-center text-xs sm:text-sm"
            variant="outline"
          >
            {isLoading ? (
              <div className="animate-spin rounded-full h-3 w-3 sm:h-4 sm:w-4 border-b border-gray-600 mr-1 sm:mr-2" />
            ) : (
              <Clock className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
            )}
            Requested
          </Button>
        );
      
      case 'pending_received':
        return (
          <div className="flex space-x-2">
            <Button
              onClick={(e) => handleConnectionAction('accept', e)}
              disabled={isLoading}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-full font-medium h-8 sm:h-10 text-xs sm:text-sm"
            >
              Accept
            </Button>
            <Button
              onClick={(e) => handleConnectionAction('decline', e)}
              disabled={isLoading}
              className="flex-1 border border-gray-300 text-gray-600 bg-white hover:bg-gray-50 rounded-full font-medium h-8 sm:h-10 text-xs sm:text-sm"
              variant="outline"
            >
              Decline
            </Button>
          </div>
        );
      
      case 'accepted':
        return (
          <Button
            onClick={(e) => handleMessageClick(e)}
            className="w-full text-white rounded-full font-medium h-8 sm:h-10 text-xs sm:text-sm flex items-center justify-center"
            style={{
              background: 'linear-gradient(340deg, rgba(228, 236, 255, 1) 0%, rgba(130, 130, 255, 0.95) 34%, rgba(35, 70, 224, 0.93) 85%)'
            }}
          >
            <MessageCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2 flex-shrink-0" />
            Connected
          </Button>
        );
      
      default:
        return (
          <Button
            onClick={(e) => handleConnectionAction('connect', e)}
            className="w-full border border-brand-primary text-brand-primary bg-white hover:bg-primary-50 transition-colors duration-200 rounded-full font-medium h-8 sm:h-10 text-xs sm:text-sm"
            variant="outline"
          >
            <UserPlus className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
            Connect
          </Button>
        );
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't trigger if clicking on a button or interactive element
    const target = e.target as HTMLElement;
    if (target.closest('button')) {
      return;
    }
    
    if (onClick) {
      onClick();
    }
  };

  // Check if we have data to display
  const hasPosition = isValidField(position) && position !== 'Member';
  const hasYear = isValidField(year);
  const hasMajor = isValidField(major);
  const hasInterests = isValidField(interests);

  return (
    <Card 
      className="bg-white border border-gray-200 rounded-lg hover:shadow-lg transition-all duration-200 overflow-hidden group h-[228px] sm:h-[320px] flex flex-col"
    >
      <CardContent className="!p-0 flex flex-col h-full">
        <div 
          className={`px-2 pt-1.5 pb-2 sm:px-4 sm:pt-4 sm:pb-4 relative flex-1 flex flex-col ${onClick ? 'cursor-pointer' : ''}`}
          onClick={handleCardClick}
        >
          {/* Avatar - Now Clickable */}
          <div className="flex justify-center mb-1.5 sm:mb-2">
            {id ? (
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full border-2 border-white sm:border-4 bg-white shadow-sm overflow-hidden relative">
                <ClickableAvatar
                  userId={id}
                  avatarUrl={avatar}
                  fullName={name}
                  size="lg"
                  className="!h-full !w-full"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            ) : (
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full border-2 border-white sm:border-4 bg-white shadow-sm overflow-hidden relative">
                {avatar ? (
                  <ImageWithFallback 
                    src={avatar} 
                    alt={name} 
                    width={56} 
                    height={56} 
                    className="w-full h-full object-cover" 
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-brand-primary to-brand-primary flex items-center justify-center">
                    <span className="text-white font-medium text-base sm:text-lg">
                      {name
                        ?.split(" ")
                        ?.map((n) => n[0])
                        ?.join("") || "?"}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Name - Now Clickable */}
          <div className="text-center sm:mb-2 h-6 flex flex-col justify-center">
            {id && name ? (
              <ClickableUserName
                userId={id}
                fullName={name}
                className="font-semibold text-gray-900 text-xs sm:text-base leading-tight truncate"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <h3 className="font-semibold text-gray-900 text-xs sm:text-base leading-tight truncate">
                {name}
              </h3>
            )}
          </div>

          {/* Position and Year - Desktop: same row, Mobile: stacked or badges */}
          <div className="text-center mb-1.5 sm:mb-3 min-h-[18px] sm:min-h-[24px] flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2">
            {/* Mobile: Show year badge if available */}
            {hasYear && (
              <Badge 
                variant="secondary" 
                className="sm:hidden text-[10px] bg-gray-100 text-gray-700 hover:bg-gray-200 px-1.5 py-0.5"
              >
                {year}
              </Badge>
            )}
            
            {/* Desktop: Position and Year on same row */}
            <div className="hidden sm:flex items-center justify-center gap-2">
              {hasPosition && (
                <p className="text-xs font-medium text-brand-primary leading-tight truncate">{position}</p>
              )}
              {hasPosition && hasYear && (
                <span className="text-gray-300">•</span>
              )}
              {hasYear && (
                <Badge 
                  variant="secondary" 
                  className="text-xs bg-gray-100 text-gray-700 hover:bg-gray-200 px-2 py-0.5"
                >
                  {year}
                </Badge>
              )}
            </div>

            {/* Mobile: Show position if available, or "Chapter Member" placeholder */}
            <div className="sm:hidden">
              {hasPosition ? (
                <p className="text-xs font-medium text-brand-primary leading-tight truncate">{position}</p>
              ) : (
                <Badge 
                  variant="secondary" 
                  className="text-[10px] bg-gray-50 text-gray-500 px-1.5 py-0.5"
                >
                  Chapter Member
                </Badge>
              )}
            </div>

            {/* Desktop: Show "Chapter Member" if no position */}
            {!hasPosition && (
              <div className="hidden sm:block">
                <Badge 
                  variant="secondary" 
                  className="text-xs bg-gray-50 text-gray-500 px-2 py-0.5"
                >
                  Chapter Member
                </Badge>
              </div>
            )}
          </div>

          {/* Tags Section - Major and Interests (Desktop only, or mobile if no mutual connections) */}
          {(hasMajor || hasInterests) && (
            <div className="hidden sm:flex flex-wrap justify-center gap-1.5 mb-2 min-h-[20px]">
              {hasMajor && (
                <Badge 
                  variant="secondary" 
                  className="text-xs bg-accent-50 text-accent-700 hover:bg-accent-100 px-2 py-0.5"
                >
                  {major}
                </Badge>
              )}
              {hasInterests && interests.slice(0, 2).map((interest, idx) => (
                <Badge 
                  key={idx}
                  variant="secondary" 
                  className="text-xs bg-purple-50 text-purple-700 hover:bg-purple-100 px-2 py-0.5"
                >
                  {interest}
                </Badge>
              ))}
            </div>
          )}

          {/* Mutual Connections - With placeholder when empty */}
          <div className="flex flex-col sm:flex-row items-center justify-center space-y-0.5 sm:space-y-0 sm:space-x-2 mb-2 sm:mb-4 flex-1 min-h-[28px] sm:min-h-[32px]">
            {mutualLoading ? (
              <div className="text-xs text-gray-400">Loading...</div>
            ) : mutualConnections.length > 0 ? (
              <>
                <div className="flex -space-x-1">
                  {mutualConnections.slice(0, 3).map((c, i) => (
                    <div key={c.id || `mutual-${i}`} className="w-4 h-4 sm:w-6 sm:h-6 rounded-full border-2 border-white overflow-hidden bg-gray-200 relative z-10" style={{ zIndex: 10 - i }}>
                      {c.avatar ? (
                        <ImageWithFallback 
                          src={c.avatar} 
                          alt={c.name || 'Unknown'} 
                          width={24} 
                          height={24} 
                          className="w-full h-full object-cover" 
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center">
                          <span className="text-white text-xs">
                            {c.name
                              ?.split(" ")
                              ?.map((n) => n[0])
                              ?.join("") || "?"}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {/* Mobile: Show "+X other" below avatars */}
                <span className="text-xs text-gray-600 leading-tight sm:hidden">
                  {connectionsCount > 1 
                    ? `+${connectionsCount - 1} other`
                    : connectionsCount === 1
                    ? '1 connection'
                    : ''
                  }
                </span>
                {/* Desktop: Show full text next to avatars */}
                <span className="text-xs sm:text-sm text-gray-600 leading-tight hidden sm:block">
                  {connectionsCount > 1 
                    ? `+${connectionsCount - 1} other connections`
                    : connectionsCount === 1
                    ? '1 connection'
                    : ''
                  }
                </span>
              </>
            ) : (
              // Placeholder when no mutual connections
              <div className="flex flex-col items-center justify-center text-gray-400">
                <Users className="h-3.5 w-3.5 sm:h-5 sm:w-5 mb-0.5 sm:mb-1 opacity-50" />
                <span className="text-[10px] sm:text-xs leading-tight text-center px-0.5">No mutual connections</span>
              </div>
            )}
          </div>

          {/* Action Button - Fixed height at bottom */}
          <div className="mt-auto h-8 sm:h-10 flex items-center">
            {renderConnectionButton()}
          </div>
        </div>
      </CardContent>
      <ConnectionRequestDialog
        isOpen={showConnectionDialog}
        onClose={() => setShowConnectionDialog(false)}
        onSend={handleSendConnectionRequest}
        recipientName={name}
        isLoading={connectionLoading}
      />
    </Card>
  );
}