'use client';

import { useState } from 'react';
import { Drawer } from 'vaul';
import { X, Users, Calendar, MessageSquare, Shield, CheckCircle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProfileService } from '@/lib/services/profileService';
import Image from 'next/image';

interface WelcomeModalProps {
  profile: any;
  onClose: () => void;
  onShareIntroduction?: () => void;
  onEditProfile?: () => void;
}

const features = [
  {
    icon: Users,
    title: 'Connect with Members',
    description: 'Browse and connect with fellow chapter members and alumni',
  },
  {
    icon: Calendar,
    title: 'Stay Updated',
    description: 'View upcoming events and chapter activities',
  },
  {
    icon: MessageSquare,
    title: 'Social Feed',
    description: 'Share updates and engage with the community',
  },
  {
    icon: Shield,
    title: 'Secure Platform',
    description: 'Your data is protected with enterprise-grade security',
  },
];

/**
 * Welcome modal shown after signup. Uses vaul Drawer so it is portaled and
 * appears above the dashboard header (z-[10002]/z-[10003]). Mobile: bottom
 * sheet via flex items-end; desktop: centered with flex (no left-50% / translate,
 * avoids jump when scrollbar disappears under modal lock).
 * Vaul bottom drawers add a ::after extension for sheet drag UX; we hide it here
 * so a centered desktop panel does not show a long white tail below the card.
 */
export function WelcomeModal({
  profile,
  onClose,
  onShareIntroduction,
  onEditProfile,
}: WelcomeModalProps) {
  const [isClosing, setIsClosing] = useState(false);

  const markSeenAndClose = () => {
    setIsClosing(true);
    (async () => {
      try {
        await ProfileService.updateProfile({ welcome_seen: true });
      } catch (error) {
        console.error('Error updating welcome_seen:', error);
      }
      onClose();
    })();
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) markSeenAndClose();
  };

  const handleShareIntroduction = async () => {
    setIsClosing(true);
    try {
      await ProfileService.updateProfile({ welcome_seen: true });
    } catch (error) {
      console.error('Error updating welcome_seen:', error);
    }
    onClose();
    if (onShareIntroduction) {
      setTimeout(() => onShareIntroduction(), 300);
    }
  };

  const handleEditProfile = async () => {
    setIsClosing(true);
    try {
      await ProfileService.updateProfile({ welcome_seen: true });
    } catch (error) {
      console.error('Error updating welcome_seen:', error);
    }
    onClose();
    if (onEditProfile) {
      setTimeout(() => onEditProfile(), 300);
    }
  };

  return (
    <Drawer.Root
      open={true}
      onOpenChange={handleOpenChange}
      direction="bottom"
      modal
      dismissible
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[10002] bg-black/40 transition-opacity" />
        <div className="fixed inset-0 z-[10003] flex items-end justify-center sm:items-center p-0 sm:p-4 pointer-events-none">
          <Drawer.Content
            className="
              pointer-events-auto
              relative flex flex-col
              w-full sm:max-w-2xl
              max-h-[95dvh] sm:max-h-[90vh] min-h-[40dvh] sm:min-h-0
              overflow-y-auto overflow-x-hidden
              rounded-t-[20px] sm:rounded-lg
              bg-white shadow-2xl border border-gray-200 border-b-0 sm:border
              outline-none p-0
              [&::after]:hidden
            "
          >
          {/* Drag handle - mobile */}
          <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-zinc-300 mt-3 mb-2 sm:hidden" aria-hidden />

          <Card className="border-0 shadow-none flex flex-col rounded-none sm:rounded-lg">
            <CardHeader className="relative pb-2 md:pb-3 flex-shrink-0">
              <div className="flex items-center justify-center mb-2 md:mb-3">
                <div
                  className="w-10 h-10 md:w-14 md:h-14 flex items-center justify-center rounded-full"
                  style={{
                    background: 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 35%, #fff 100%)',
                  }}
                >
                  <Image
                    src="/screenshots/Artboard 13.png"
                    alt="Trailblaize"
                    width={56}
                    height={56}
                    className="w-10 h-10 md:w-14 md:h-14 object-contain"
                  />
                </div>
              </div>
              <Drawer.Title className="sr-only">
                Welcome to {profile?.chapter || 'Your Chapter'}
              </Drawer.Title>
              <CardTitle className="text-center text-base md:text-xl font-bold text-gray-900">
                Welcome to {profile?.chapter || 'Your Chapter'}!
              </CardTitle>
              <p className="text-center text-xs md:text-sm text-gray-600 mt-1">
                We&apos;re excited to have you join our community. Here&apos;s what you can do:
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={markSeenAndClose}
                className="absolute top-2 md:top-3 right-2 md:right-3 p-1"
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>

            <CardContent className="flex flex-col pt-0 px-3 md:px-4 pb-3 md:pb-4">
              {/* Features Grid */}
              <div className="grid grid-cols-2 gap-2 md:gap-3 mb-3 md:mb-4">
                {features.map((feature) => (
                  <div
                    key={feature.title}
                    className="flex flex-col items-center text-center p-2 rounded-lg bg-gray-50"
                  >
                    <div className="w-6 h-6 md:w-8 md:h-8 bg-accent-100 rounded-full flex items-center justify-center mb-1 md:mb-2">
                      <feature.icon className="h-3 w-3 md:h-4 md:w-4 text-brand-accent" />
                    </div>
                    <div className="space-y-0.5">
                      <h4 className="font-medium text-xs text-gray-900 leading-tight">
                        {feature.title}
                      </h4>
                      <p className="text-xs text-gray-600 leading-tight">{feature.description}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Get Started Section */}
              <div className="bg-accent-50 border border-accent-200 rounded-lg p-2 md:p-3 mb-3 md:mb-4">
                <div className="flex items-start space-x-2">
                  <CheckCircle className="h-3 w-3 md:h-4 md:w-4 text-brand-accent mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-0.5">
                      <h4 className="font-medium text-xs md:text-sm text-accent-900">Get Started</h4>
                      <Button
                        onClick={handleEditProfile}
                        variant="ghost"
                        className="p-0 h-auto text-[10px] md:text-xs text-brand-accent hover:text-accent-700 hover:bg-transparent font-medium"
                      >
                        Complete profile <ArrowRight className="h-3 w-3 ml-0.5" />
                      </Button>
                    </div>
                    <p className="text-xs text-accent-800 leading-relaxed">
                      Complete your profile to unlock all features and connect with other members.
                      You can always update your information later.
                    </p>
                  </div>
                </div>
              </div>

              {/* Buttons */}
              <div className="flex flex-shrink-0 flex-col justify-center gap-2 sm:flex-row">
                <Button
                  onClick={markSeenAndClose}
                  variant="outline"
                  className="px-4 py-2 md:px-6 md:py-2 text-xs md:text-sm font-medium rounded-full"
                  size="sm"
                >
                  Skip for now
                </Button>
                <Button
                  onClick={handleShareIntroduction}
                  className="bg-brand-accent hover:bg-brand-accent-hover px-4 py-2 md:px-6 md:py-2 text-xs md:text-sm font-medium rounded-full"
                  size="sm"
                >
                  Share an Introduction!
                </Button>
              </div>
            </CardContent>
          </Card>
          </Drawer.Content>
        </div>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
