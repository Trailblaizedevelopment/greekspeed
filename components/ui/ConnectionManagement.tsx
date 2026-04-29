'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useConnections } from '@/lib/contexts/ConnectionsContext';
import { useAuth } from '@/lib/supabase/auth-context';
import { Check, X, UserPlus, Users, Clock, UserX } from 'lucide-react';
import { ClickableAvatar } from '@/components/features/user-profile/ClickableAvatar';
import { ClickableUserName } from '@/components/features/user-profile/ClickableUserName';
import { ConnectionPagination } from '@/components/ui/ConnectionPagination';
import { cn } from '@/lib/utils';

interface ConnectionManagementProps {
  variant?: 'desktop' | 'mobile';
  className?: string;
  hideCard?: boolean;
}

export function ConnectionManagement({ variant = 'desktop', className = '', hideCard = false }: ConnectionManagementProps) {
  const { user } = useAuth();
  const { 
    connections, 
    loading, 
    updateConnectionStatus, 
    refreshConnections 
  } = useConnections();
  
  const [processingId, setProcessingId] = useState<string | null>(null);
  
  // Pagination state for each tab
  const [pendingPage, setPendingPage] = useState(1);
  const [sentPage, setSentPage] = useState(1);
  const [declinedPage, setDeclinedPage] = useState(1);
  const [activeTab, setActiveTab] = useState('pending');
  const itemsPerPage = 5;

  // Reset pagination when switching tabs
  useEffect(() => {
    setPendingPage(1);
    setSentPage(1);
    setDeclinedPage(1);
  }, [activeTab]);

  // Filter connections by status
  const pendingRequests = connections.filter(conn => 
    conn.status === 'pending' && conn.recipient_id === user?.id
  ).sort((a, b) => {
    // Sort by created_at descending (newest first)
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  
  const sentRequests = connections.filter(conn => 
    conn.status === 'pending' && conn.requester_id === user?.id
  ).sort((a, b) => {
    // Sort by created_at descending (newest first)
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  
  const declinedConnections = connections.filter(conn =>
    conn.status === 'declined' && 
    (conn.requester_id === user?.id || conn.recipient_id === user?.id)
  ).sort((a, b) => {
    // Sort by updated_at descending (newest first)
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

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

  const getConnectionPartner = (connection: any) => {
    if (!user) return { name: 'Unknown', initials: 'U', avatar: null, id: null, firstName: null, lastName: null };
    const partner = connection.requester_id === user.id ? connection.recipient : connection.requester;
    return {
      name: partner.full_name || 'Unknown User',
      initials: partner.full_name?.charAt(0) || 'U',
      avatar: partner.avatar_url,
      id: partner.id || null,
      firstName: partner.first_name || null,
      lastName: partner.last_name || null
    };
  };

  // Mobile-specific styling
  const isMobile = variant === 'mobile';
  const cardPadding = hideCard ? 'px-4 py-3' : (isMobile ? 'p-3' : 'p-4');
  const avatarSize = isMobile ? 'w-10 h-10' : 'w-12 h-12';
  const buttonSize = isMobile ? 'h-7 px-2' : 'h-8 px-3';
  const textSize = isMobile ? 'text-sm' : 'text-base';
  const iconSize = isMobile ? 'h-3 w-3' : 'h-4 w-4';
  const tabTextSize = isMobile ? 'text-xs' : 'text-sm';

  if (loading) {
    const LoadingContent = (
      <div className="p-6">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-primary" />
          <span className="ml-2 text-gray-600">Loading connections...</span>
        </div>
      </div>
    );

    if (hideCard) {
      return <div className={className}>{LoadingContent}</div>;
    }
    return (
      <Card className={className}>
        <CardContent>{LoadingContent}</CardContent>
      </Card>
    );
  }


  // Main content structure
  const content = (
    <>
      {!hideCard && (
        <CardHeader className={isMobile ? 'pb-3' : 'pb-4'}>
          <CardTitle className={`${textSize} flex items-center space-x-2`}>
            <Users className={`${iconSize} text-brand-primary`} />
            <span>Connection Management</span>
          </CardTitle>
        </CardHeader>
      )}
      <CardContent className={isMobile ? (hideCard ? 'p-0' : 'pt-0') : 'pt-2'}>
        <Tabs defaultValue="pending" className="w-full" onValueChange={setActiveTab}>
          {isMobile ? (
            // Mobile: Full width tabs when hideCard, otherwise scrollable
            hideCard ? (
              <TabsList className="grid w-full grid-cols-3 mb-4">
                <TabsTrigger value="pending" className={`flex items-center space-x-1 ${tabTextSize}`}>
                  <Clock className={iconSize} />
                  <span>Pending ({pendingRequests.length})</span>
                </TabsTrigger>
                <TabsTrigger value="sent" className={`flex items-center space-x-1 ${tabTextSize}`}>
                  <UserPlus className={iconSize} />
                  <span>Sent ({sentRequests.length})</span>
                </TabsTrigger>
                <TabsTrigger value="declined" className={`flex items-center space-x-1 ${tabTextSize}`}>
                  <UserX className={iconSize} />
                  <span>Declined ({declinedConnections.length})</span>
                </TabsTrigger>
              </TabsList>
            ) : (
              // Original scrollable mobile tabs
              <div className="mb-4 overflow-x-auto">
                <TabsList className="flex w-max min-w-full">
                  <TabsTrigger value="pending" className={`flex items-center space-x-1 ${tabTextSize} flex-shrink-0`}>
                    <Clock className={iconSize} />
                    <span>Pending ({pendingRequests.length})</span>
                  </TabsTrigger>
                  <TabsTrigger value="sent" className={`flex items-center space-x-1 ${tabTextSize} flex-shrink-0`}>
                    <UserPlus className={iconSize} />
                    <span>Sent ({sentRequests.length})</span>
                  </TabsTrigger>
                  <TabsTrigger value="declined" className={`flex items-center space-x-1 ${tabTextSize} flex-shrink-0`}>
                    <UserX className={iconSize} />
                    <span>Declined ({declinedConnections.length})</span>
                  </TabsTrigger>
                </TabsList>
              </div>
            )
          ) : (
            // Desktop: Original grid layout
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="pending" className={`flex items-center space-x-1 ${tabTextSize}`}>
                <Clock className={iconSize} />
                <span>Pending ({pendingRequests.length})</span>
              </TabsTrigger>
              <TabsTrigger value="sent" className={`flex items-center space-x-1 ${tabTextSize}`}>
                <UserPlus className={iconSize} />
                <span>Sent ({sentRequests.length})</span>
              </TabsTrigger>
              <TabsTrigger value="declined" className={`flex items-center space-x-1 ${tabTextSize}`}>
                <UserX className={iconSize} />
                <span>Declined ({declinedConnections.length})</span>
              </TabsTrigger>
            </TabsList>
          )}

          {/* Pending Requests Tab */}
          <TabsContent value="pending" className={isMobile ? 'mt-4' : 'mt-6'}>
            {pendingRequests.length === 0 ? (
              <div className={`text-center ${isMobile ? 'py-6' : 'py-8'} text-gray-500`}>
                <UserPlus className={`${isMobile ? 'h-8 w-8' : 'h-12 w-12'} mx-auto mb-2 text-gray-300`} />
                <p className={textSize}>No pending requests</p>
                {!isMobile && (
                  <p className="text-sm mt-1">When someone sends you a connection request, it will appear here</p>
                )}
              </div>
            ) : (
              <>
                <div className={isMobile ? 'space-y-3' : 'space-y-4'}>
                  {pendingRequests
                    .slice((pendingPage - 1) * itemsPerPage, pendingPage * itemsPerPage)
                    .map((connection) => {
                  const partner = getConnectionPartner(connection);
                  return (
                    <div
                      key={connection.id}
                      className={cn(
                        'flex flex-col gap-3',
                        cardPadding,
                        hideCard ? 'border-0 border-b border-gray-200 last:border-b-0' : 'border border-gray-200 rounded-lg',
                        'hover:bg-gray-50 transition-colors'
                      )}
                    >
                      <h3 className={cn('font-medium text-gray-900 leading-snug', textSize)}>
                        Connection Request from{' '}
                        {partner.id ? (
                          <ClickableUserName
                            userId={partner.id}
                            fullName={partner.name}
                            className="font-semibold text-brand-primary hover:text-brand-primary-hover"
                          />
                        ) : (
                          <span className="font-semibold">{partner.name}</span>
                        )}
                      </h3>

                      <div className="flex flex-col gap-2">
                        <div className="shrink-0">
                          {partner.id ? (
                            <ClickableAvatar
                              userId={partner.id}
                              avatarUrl={partner.avatar}
                              fullName={partner.name}
                              firstName={partner.firstName}
                              lastName={partner.lastName}
                              size={isMobile ? 'sm' : 'md'}
                              className={avatarSize}
                            />
                          ) : (
                            <div className={`${avatarSize} bg-primary-100 rounded-full flex items-center justify-center text-brand-primary ${textSize} font-semibold`}>
                              {partner.avatar ? (
                                <img
                                  src={partner.avatar}
                                  alt={partner.name}
                                  className="w-full h-full object-cover rounded-full"
                                />
                              ) : (
                                partner.initials
                              )}
                            </div>
                          )}
                        </div>
                        {connection.message ? (
                          <p className={cn('text-gray-600', isMobile ? 'text-xs' : 'text-sm')}>
                            {connection.message}
                          </p>
                        ) : null}
                        <p className="text-xs text-gray-500">
                          {new Date(connection.created_at).toLocaleDateString()}
                        </p>
                      </div>

                      <div className={cn('flex w-full min-w-0 items-stretch', isMobile ? 'gap-1.5' : 'gap-2')}>
                        <Button
                          size="sm"
                          onClick={() => handleConnectionAction(connection.id, 'accept')}
                          disabled={processingId === connection.id}
                          className={cn(
                            'flex-1 min-w-0 bg-brand-primary hover:bg-brand-primary-hover text-white rounded-full font-medium shadow-sm flex items-center justify-center gap-1',
                            buttonSize
                          )}
                        >
                          {processingId === connection.id ? (
                            <div className={cn('animate-spin rounded-full border-b border-white shrink-0', iconSize)} />
                          ) : (
                            <>
                              <Check className={cn(iconSize, 'shrink-0')} />
                              <span className="truncate">Accept</span>
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleConnectionAction(connection.id, 'decline')}
                          disabled={processingId === connection.id}
                          className={cn(
                            'flex-1 min-w-0 text-red-600 border-red-300 hover:bg-red-50 rounded-full font-medium shadow-sm flex items-center justify-center gap-1',
                            buttonSize
                          )}
                        >
                          {processingId === connection.id ? (
                            <div className={cn('animate-spin rounded-full border-b border-red-600 shrink-0', iconSize)} />
                          ) : (
                            <>
                              <X className={cn(iconSize, 'shrink-0')} />
                              <span className="truncate">Decline</span>
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                  })}
                </div>
                <ConnectionPagination
                  currentPage={pendingPage}
                  totalPages={Math.ceil(pendingRequests.length / itemsPerPage)}
                  totalItems={pendingRequests.length}
                  itemsPerPage={itemsPerPage}
                  onPageChange={setPendingPage}
                  itemLabel="requests"
                />
              </>
            )}
          </TabsContent>

          {/* Sent Requests Tab */}
          <TabsContent value="sent" className={isMobile ? 'mt-4' : 'mt-6'}>
            {sentRequests.length === 0 ? (
              <div className={`text-center ${isMobile ? 'py-6' : 'py-8'} text-gray-500`}>
                <UserPlus className={`${isMobile ? 'h-8 w-8' : 'h-12 w-12'} mx-auto mb-2 text-gray-300`} />
                <p className={textSize}>No sent requests</p>
                {!isMobile && (
                  <p className="text-sm mt-1">Your outgoing connection requests will appear here</p>
                )}
              </div>
            ) : (
              <>
                <div className={isMobile ? 'space-y-3' : 'space-y-4'}>
                  {sentRequests
                    .slice((sentPage - 1) * itemsPerPage, sentPage * itemsPerPage)
                    .map((connection) => {
                  const partner = getConnectionPartner(connection);
                  return (
                    <div key={connection.id} className={`flex items-center justify-between ${cardPadding} ${hideCard ? 'border-0 border-b border-gray-200 last:border-b-0' : 'border border-gray-200 rounded-lg'} hover:bg-gray-50 transition-colors`}>
                      <div className="flex items-center space-x-3">
                        {partner.id ? (
                          <ClickableAvatar
                            userId={partner.id}
                            avatarUrl={partner.avatar}
                            fullName={partner.name}
                            firstName={partner.firstName}
                            lastName={partner.lastName}
                            size={isMobile ? 'sm' : 'md'}
                            className={avatarSize}
                          />
                        ) : (
                          <div className={`${avatarSize} bg-primary-100 rounded-full flex items-center justify-center text-brand-primary ${textSize} font-semibold`}>
                            {partner.avatar ? (
                              <img 
                                src={partner.avatar} 
                                alt={partner.name}
                                className="w-full h-full object-cover rounded-full"
                              />
                            ) : (
                              partner.initials
                            )}
                          </div>
                        )}
                        <div>
                          {partner.id ? (
                            <ClickableUserName
                              userId={partner.id}
                              fullName={isMobile ? `Request sent to ${partner.name}` : `Request sent to ${partner.name}`}
                              className={`font-medium text-gray-900 ${textSize}`}
                            />
                          ) : (
                            <p className={`font-medium text-gray-900 ${textSize}`}>
                              {isMobile ? `Request sent to ${partner.name}` : `Request sent to ${partner.name}`}
                            </p>
                          )}
                          <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-gray-500 mt-1`}>
                            {new Date(connection.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className={tabTextSize}>
                        Pending
                      </Badge>
                    </div>
                  );
                  })}
                </div>
                <ConnectionPagination
                  currentPage={sentPage}
                  totalPages={Math.ceil(sentRequests.length / itemsPerPage)}
                  totalItems={sentRequests.length}
                  itemsPerPage={itemsPerPage}
                  onPageChange={setSentPage}
                  itemLabel="requests"
                />
              </>
            )}
          </TabsContent>

          {/* Declined Tab */}
          <TabsContent value="declined" className={isMobile ? 'mt-4' : 'mt-6'}>
            {declinedConnections.length === 0 ? (
              <div className={`text-center ${isMobile ? 'py-6' : 'py-8'} text-gray-500`}>
                <UserX className={`${isMobile ? 'h-8 w-8' : 'h-12 w-12'} mx-auto mb-2 text-gray-300`} />
                <p className={textSize}>No declined requests</p>
                {!isMobile && (
                  <p className="text-sm mt-1">Declined connection requests will appear here</p>
                )}
              </div>
            ) : (
              <>
                <div className={isMobile ? 'space-y-3' : 'space-y-4'}>
                  {declinedConnections
                    .slice((declinedPage - 1) * itemsPerPage, declinedPage * itemsPerPage)
                    .map((connection) => {
                  const partner = getConnectionPartner(connection);
                  return (
                    <div key={connection.id} className={`flex items-center justify-between ${cardPadding} ${hideCard ? 'border-0 border-b border-gray-200 last:border-b-0' : 'border border-gray-200 rounded-lg'} hover:bg-gray-50 transition-colors`}>
                      <div className="flex items-center space-x-3">
                        {partner.id ? (
                          <ClickableAvatar
                            userId={partner.id}
                            avatarUrl={partner.avatar}
                            fullName={partner.name}
                            firstName={partner.firstName}
                            lastName={partner.lastName}
                            size={isMobile ? 'sm' : 'md'}
                            className={avatarSize}
                          />
                        ) : (
                          <div className={`${avatarSize} bg-primary-100 rounded-full flex items-center justify-center text-brand-primary ${textSize} font-semibold`}>
                            {partner.avatar ? (
                              <img 
                                src={partner.avatar} 
                                alt={partner.name}
                                className="w-full h-full object-cover rounded-full"
                              />
                            ) : (
                              partner.initials
                            )}
                          </div>
                        )}
                        <div>
                          {partner.id ? (
                            <ClickableUserName
                              userId={partner.id}
                              fullName={partner.name}
                              className={`font-medium text-gray-900 ${textSize}`}
                            />
                          ) : (
                            <p className={`font-medium text-gray-900 ${textSize}`}>
                              {partner.name}
                            </p>
                          )}
                          <p className={`${isMobile ? 'text-xs' : 'text-sm'} text-gray-500 mt-1`}>
                            Declined {new Date(connection.updated_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className={`text-red-600 border-red-300 ${tabTextSize}`}>
                        Declined
                      </Badge>
                    </div>
                  );
                  })}
                </div>
                <ConnectionPagination
                  currentPage={declinedPage}
                  totalPages={Math.ceil(declinedConnections.length / itemsPerPage)}
                  totalItems={declinedConnections.length}
                  itemsPerPage={itemsPerPage}
                  onPageChange={setDeclinedPage}
                  itemLabel="requests"
                />
              </>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </>
  );

  if (hideCard) {
    return <div className={className}>{content}</div>;
  }

  return (
    <Card className={className}>
      {content}
    </Card>
  );
}
