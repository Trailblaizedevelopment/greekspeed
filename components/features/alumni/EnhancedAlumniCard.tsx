import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alumni } from "@/lib/alumniConstants";
import { MessageCircle, UserPlus, Shield, Building2, MapPin, GraduationCap, Clock } from "lucide-react";
import ImageWithFallback from "@/components/figma/ImageWithFallback";
import { useConnections } from "@/lib/contexts/ConnectionsContext";
import { useAuth } from "@/lib/supabase/auth-context";
import { useState, memo, useRef } from "react";
import { useRouter } from "next/navigation";
import { ClickableField } from '@/components/shared/ClickableField';
import { ActivityIndicator } from '@/components/shared/ActivityIndicator';
import { ConnectionRequestDialog } from '@/components/features/connections/ConnectionRequestDialog';
import { formatLocationLineForApp } from '@/types/canonicalPlace';

// Add this function at the top of the file, outside the component
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

interface EnhancedAlumniCardProps {
  alumni: Alumni;
  onClick?: (alumni: Alumni) => void;
}

// Memoized component for performance optimization - prevents re-renders when props haven't changed
function EnhancedAlumniCardComponent({ alumni, onClick }: EnhancedAlumniCardProps) {
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
  const suppressCardClickUntilRef = useRef(0);

  // Use mutual connections from alumni prop (already calculated by API)
  const mutualConnections = alumni.mutualConnections || [];
  const mutualConnectionsCount = alumni.mutualConnectionsCount || 0;
  const mutualLoading = false; // No longer loading since it comes from API

  const handleConnectionAction = async (action: 'connect' | 'accept' | 'decline' | 'cancel', e: React.MouseEvent) => {
    // Stop event propagation to prevent card click from triggering
    e.stopPropagation();

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

  const handleMessageClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const connectionId = getConnectionId(alumni.id);
    if (connectionId) {
      router.push(`/dashboard/messages?connection=${connectionId}`);
    }
  };

  const handleSendConnectionRequest = async (message?: string) => {
    await sendConnectionRequest(alumni.id, message);
  };

  const handleCloseConnectionDialog = () => {
    suppressCardClickUntilRef.current = Date.now() + 350;
    setShowConnectionDialog(false);
  };

  const renderConnectionButton = () => {
    if (!user || user.id === alumni.id) return null;

    if (!alumni.hasProfile) {
      return (
        <Button
          className="w-full text-gray-400 border-gray-200 rounded-full font-medium h-8 sm:h-10"
          variant="outline"
          disabled
          onClick={(e) => e.stopPropagation()} // Prevent card click even for disabled button
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

      case 'pending_received':
        return (
          <Button
            onClick={(e) => {
              e.stopPropagation();
              // Open profile modal to see full request
              if (onClick) onClick(alumni);
            }}
            className="w-full border border-green-500 text-green-600 bg-green-50 hover:bg-green-100 transition-colors duration-200 rounded-full font-medium h-8 sm:h-10 flex items-center justify-center text-xs sm:text-sm"
            variant="outline"
          >
            <UserPlus className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
            <span className="text-[12px] sm:text-sm leading-tight sm:leading-normal whitespace-nowrap truncate">
              View
            </span>
          </Button>
        );

      default:
        return null;
    }
  };

  const handleCardClick = () => {
    if (showConnectionDialog) return;
    if (Date.now() < suppressCardClickUntilRef.current) return;
    if (onClick) {
      onClick(alumni);
    }
  };

  const isValidField = (value: any): boolean => {
    if (!value) return false;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed !== "" &&
        trimmed !== "Not specified" &&
        trimmed !== "N/A" &&
        trimmed !== "Unknown";
    }
    return true;
  };

  return (
    <Card className="bg-white border border-gray-200 rounded-lg hover:shadow-lg transition-all duration-200 overflow-hidden group h-[228px] sm:h-[400px] flex flex-col cursor-pointer" onClick={handleCardClick}>
      <CardContent className="!p-0 flex flex-col h-full">
        <div className="px-2 pt-2 pb-2 sm:px-4 sm:pt-6 sm:pb-4 relative flex-1 flex flex-col">
          {/* Avatar */}
          <div className="flex justify-center mb-1.5 sm:mb-3">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full border-2 border-white sm:border-4 bg-white shadow-sm overflow-hidden relative">
              {alumni.avatar ? (
                <ImageWithFallback
                  src={alumni.avatar}
                  alt={alumni.fullName}
                  width={56}
                  height={56}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-brand-primary to-brand-primary flex items-center justify-center">
                  <span className="text-white font-medium text-base sm:text-lg">
                    {alumni.firstName?.[0] || ''}{alumni.lastName?.[0] || ''}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* BLACK BOX: Name and Activity Status - Fixed height */}
          <div className="text-center mb-0.5 sm:mb-4 h-7 sm:h-8 flex flex-col justify-center">
            <div className="flex items-center justify-center space-x-2">
              <h3 className="font-semibold text-gray-900 text-xs sm:text-lg leading-tight truncate">
                {alumni.fullName}
              </h3>
              <ActivityIndicator
                lastActiveAt={alumni.lastActiveAt}
                size="sm"
              />
            </div>
            {/* Remove hiring badge from here - move to professional info section */}
          </div>

          {/* BLUE BOX: Professional Information - Fixed height */}
          <div className="text-center mb-0.5 sm:mb-4 h-12 flex flex-col justify-center">
            {/* Hiring badge moved here to maintain consistent name positioning */}
            {alumni.isActivelyHiring && (
              <div className="flex justify-center mb-0.5 sm:mb-1">
                <Badge className="bg-gradient-to-r from-gray-600 to-gray-700 text-white text-[10px] sm:text-xs px-1 sm:px-2 py-0.5 sm:py-1 rounded-full leading-none">
                  Hiring
                </Badge>
              </div>
            )}
            {isValidField(alumni.jobTitle) && (
              <p className="hidden sm:block text-xs sm:text-sm font-medium text-brand-primary mb-0.5 sm:mb-1 leading-tight truncate">{alumni.jobTitle}</p>
            )}
            {isValidField(alumni.company) && (
              <div className="flex items-center justify-center space-x-1 sm:space-x-2 text-gray-500 text-[11px] sm:text-sm">
                <Building2 className="h-3 w-3 shrink-0" />
                <ClickableField
                  value={alumni.company}
                  entityType="company"
                  className="text-gray-500 hover:text-brand-accent text-center truncate max-w-[200px]"
                />
              </div>
            )}
            {/* Add location information */}
            {isValidField(alumni.location) && (
              <div className="flex items-center justify-center space-x-1 sm:space-x-2 text-gray-500 text-[11px] sm:text-sm mt-0.5">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="text-gray-500 truncate">{formatLocationLineForApp(alumni.location)}</span>
              </div>
            )}
            {/* Show placeholder when no data to maintain consistent spacing */}
            {!isValidField(alumni.jobTitle) && !isValidField(alumni.company) && !alumni.isActivelyHiring && !isValidField(alumni.location) && (
              <div className="text-[11px] sm:text-sm text-gray-400 leading-tight">
                Professional info not available
              </div>
            )}
          </div>

          {/* Tags (Industry and Graduation Year) - Fixed height */}
          <div className="hidden sm:flex flex-wrap justify-center gap-2 mb-4 h-8 items-center">
            {/* Industry - Show on desktop only */}
            {isValidField(alumni.industry) && (
              <Badge
                variant="secondary"
                className="text-xs bg-gray-100 text-gray-700 hover:bg-gray-200 px-2 py-1"
              >
                {alumni.industry}
              </Badge>
            )}
            {/* Show placeholder when no tags to maintain consistent spacing - desktop only */}
            {!isValidField(alumni.industry) && !isValidField(alumni.graduationYear) && (
              <div className="text-xs text-gray-400">
                No tags available
              </div>
            )}
          </div>

          {/* PINK BOX: Mutual Connections - Fixed height */}
          <div className="flex flex-col sm:flex-row items-center justify-center space-y-0.5 sm:space-y-0 sm:space-x-2 mb-0.5 sm:mb-4 h-7 sm:h-8">
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
                <span className="text-[11px] text-gray-600 leading-tight sm:hidden">
                  {mutualConnectionsCount > 1
                    ? `+${mutualConnectionsCount - 1} other`
                    : '1 connection'
                  }
                </span>
                {/* Desktop: Show full text next to avatars */}
                <span className="text-xs sm:text-sm text-gray-600 leading-tight hidden sm:block">
                  {mutualConnectionsCount > 1
                    ? `+${mutualConnectionsCount - 1} other connections`
                    : '1 connection'
                  }
                </span>
              </>
            ) : (
              /* Mobile: Show nothing, Desktop: Show nothing when no mutual connections */
              null
            )}
          </div>

          {/* RED BOX: Action Button - Fixed height at bottom */}
          <div className="mt-auto h-9 sm:h-10 flex items-center">
            {renderConnectionButton()}
          </div>
        </div>
      </CardContent>
      <ConnectionRequestDialog
        isOpen={showConnectionDialog}
        onClose={handleCloseConnectionDialog}
        onSend={handleSendConnectionRequest}
        recipientName={alumni.fullName}
        isLoading={connectionLoading}
      />
    </Card>
  );
}

// Export memoized version for performance optimization
// Using default shallow comparison - React.memo will prevent re-renders when props haven't changed
export const EnhancedAlumniCard = memo(EnhancedAlumniCardComponent); 