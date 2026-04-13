'use client';

import { useState, ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EventForm } from '@/components/ui/EventForm';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { toast } from 'react-toastify';
import { createPortal } from 'react-dom';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState as useStateMobile } from 'react';
import { useEffect } from 'react';
import { useFeatureFlag } from '@/lib/hooks/useFeatureFlag';
import { useScopedChapterId } from '@/lib/hooks/useScopedChapterId';
// Action configuration interface
export interface QuickAction {
  id: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  variant?: 'default' | 'outline' | 'ghost';
  className?: string;
  disabled?: boolean;
  showLock?: boolean;
  title?: string;
}

// Component props
export interface QuickActionsProps {
  actions: QuickAction[];
  title?: string;
  headerClassName?: string;
  contentClassName?: string;
  showEventModal?: boolean; // If true, handles event modal internally
  eventModalConfig?: {
    onSubmit?: (eventData: any) => Promise<void>;
    onCancel?: () => void;
    modalTitle?: string;
  };
}

export function QuickActions({ 
  actions, 
  title = "Quick Actions",
  headerClassName = "pb-0",
  contentClassName = "space-y-3",
  showEventModal = false,
  eventModalConfig
}: QuickActionsProps) {
  const [showEventModalState, setShowEventModalState] = useState(false);
  const { profile } = useProfile();
  const chapterId = useScopedChapterId();
  const { enabled: eventsManagementEnabled } = useFeatureFlag('events_management_enabled');

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Handle event creation if event modal is enabled
  const handleCreateEvent = async (eventData: any) => {
    if (!eventModalConfig?.onSubmit) {
      try {
        const response = await fetch('/api/events', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...eventData,
            chapter_id: chapterId,
            created_by: profile?.id || 'system',
            updated_by: profile?.id || 'system',
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to create event');
        }

        toast.success('Meeting scheduled successfully!');
        setShowEventModalState(false);
      } catch (error) {
        toast.error('Failed to schedule meeting');
        console.error('Error creating event:', error);
      }
    } else {
      await eventModalConfig.onSubmit(eventData);
      setShowEventModalState(false);
    }
  };

  return (
    <>
      <Card className="bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20">
        <CardHeader className={cn("border-b border-primary-100/30 pb-3", headerClassName)}>
          <CardTitle className="text-primary-900 leading-tight mb-4">{title}</CardTitle>
        </CardHeader>
        <CardContent className={contentClassName}>
          {actions.map((action) => (
            <Button
              key={action.id}
              variant={action.variant || 'outline'}
              className={action.className || 'w-full justify-start text-sm whitespace-nowrap'}
              onClick={action.onClick}
              disabled={action.disabled}
              title={action.title}
            >
              <action.icon className="h-4 w-4 mr-2 flex-shrink-0" />
              <span className="truncate">{action.label}</span>
              {action.showLock && (
                <Lock className="h-3 w-3 ml-2 text-gray-400 flex-shrink-0" />
              )}
            </Button>
          ))}
        </CardContent>
      </Card>

      {/* Event Creation Modal - Mobile: Bottom drawer, Desktop: Centered - Only show if events management is enabled */}
      {showEventModal && showEventModalState && eventsManagementEnabled && typeof window !== 'undefined' && createPortal(
        <div className={cn(
          "fixed inset-0 z-[9999]",
          isMobile 
            ? "flex items-end justify-center p-0"
            : "flex items-center justify-center p-4"
        )}>
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" 
            onClick={() => {
              setShowEventModalState(false);
              eventModalConfig?.onCancel?.();
            }}
          />
          <div className={cn(
            "relative min-h-screen w-full",
            isMobile ? "" : "flex items-center justify-center"
          )}>
            <div onClick={(e) => e.stopPropagation()}>
              <EventForm
                event={null}
                onSubmit={handleCreateEvent}
                onCancel={() => {
                  setShowEventModalState(false);
                  eventModalConfig?.onCancel?.();
                }}
                loading={false}
                isOpen={true}
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// Helper to open event modal from action
export const createEventModalHandler = (
  setShowModal: (show: boolean) => void
) => () => {
  setShowModal(true);
}; 