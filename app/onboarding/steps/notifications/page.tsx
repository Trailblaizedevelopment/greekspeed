'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/supabase/auth-context';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { useOnboarding } from '@/lib/hooks/useOnboarding';
import { supabase } from '@/lib/supabase/client';
import { ONBOARDING_MAIN_CARD_CLASS } from '@/lib/constants/onboardingUi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Bell,
  Mail,
  MessageSquare,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Calendar,
  Megaphone,
  Users,
  Smartphone,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface NotificationSettings {
  email_enabled: boolean;
  sms_enabled: boolean;
  announcement_notifications: boolean;
  event_notifications: boolean;
  event_reminder_notifications: boolean;
  message_notifications: boolean;
  connection_notifications: boolean;
}

const DEFAULT_SETTINGS: NotificationSettings = {
  email_enabled: true,
  sms_enabled: false,
  announcement_notifications: true,
  event_notifications: true,
  event_reminder_notifications: true,
  message_notifications: true,
  connection_notifications: true,
};

// ============================================================================
// Component
// ============================================================================

export default function NotificationsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { profile, refreshProfile } = useProfile();
  const { completeStep, goToPreviousStep } = useOnboarding();

  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load existing settings
  useEffect(() => {
    const loadSettings = async () => {
      if (!user?.id) return;

      try {
        const { data, error } = await supabase
          .from('notification_settings')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (data) {
          setSettings({
            email_enabled: data.email_enabled ?? true,
            sms_enabled: data.sms_enabled ?? profile?.sms_consent ?? false,
            announcement_notifications: data.announcement_notifications ?? true,
            event_notifications: data.event_notifications ?? true,
            event_reminder_notifications: data.event_reminder_notifications ?? true,
            message_notifications: data.message_notifications ?? true,
            connection_notifications: data.connection_notifications ?? true,
          });
        } else if (profile) {
          // Use profile sms_consent as default
          setSettings(prev => ({
            ...prev,
            sms_enabled: profile.sms_consent ?? false,
          }));
        }
      } catch (error) {
        console.error('Error loading notification settings:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [user?.id, profile]);

  // Handle toggle change
  const handleToggle = (key: keyof NotificationSettings, value: boolean) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  // Handle save and continue
  const handleContinue = async () => {
    if (!user?.id) return;

    setSaving(true);
    try {
      // Save notification settings
      const response = await fetch('/api/notifications/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          ...settings,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save settings');
      }

      toast.success('Notification preferences saved!');
      
      // Complete this step and move to finish
      await completeStep('notifications');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save preferences. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Handle back
  const handleBack = () => {
    goToPreviousStep();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
        <p className="text-gray-600 mt-4">Loading preferences...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className={ONBOARDING_MAIN_CARD_CLASS}>
        <CardHeader className="text-center pb-2">
          <CardTitle className="flex items-center justify-center gap-2">
            <Bell className="h-5 w-5 text-brand-primary" />
            Notification Preferences
          </CardTitle>
          <CardDescription>
            Choose how you want to stay updated
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Master Toggles */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-900">Communication Channels</h3>
            
            {/* Email Toggle */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white rounded-lg shadow-sm">
                  <Mail className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <Label className="font-medium">Email Notifications</Label>
                  <p className="text-sm text-gray-500">Receive updates via email</p>
                </div>
              </div>
              <Switch
                checked={settings.email_enabled}
                onCheckedChange={(value) => handleToggle('email_enabled', value)}
              />
            </div>

            {/* SMS Toggle */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white rounded-lg shadow-sm">
                  <Smartphone className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <Label className="font-medium">SMS Notifications</Label>
                  <p className="text-sm text-gray-500">Receive text message updates</p>
                  {!profile?.phone && (
                    <p className="text-xs text-amber-600 mt-1">
                      Add a phone number in settings to enable SMS
                    </p>
                  )}
                </div>
              </div>
              <Switch
                checked={settings.sms_enabled}
                onCheckedChange={(value) => handleToggle('sms_enabled', value)}
                disabled={!profile?.phone}
              />
            </div>
          </div>

          {/* Notification Types */}
          {settings.email_enabled && (
            <>
              <div className="border-t pt-6">
                <h3 className="text-sm font-medium text-gray-900 mb-4">Email Notification Types</h3>
                <div className="space-y-3">
                  {/* Announcements */}
                  <div className="flex items-center justify-between py-3 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                      <Megaphone className="h-5 w-5 text-gray-400" />
                      <div>
                        <Label className="font-medium">Announcements</Label>
                        <p className="text-sm text-gray-500">Chapter news and updates</p>
                      </div>
                    </div>
                    <Switch
                      checked={settings.announcement_notifications}
                      onCheckedChange={(value) => handleToggle('announcement_notifications', value)}
                    />
                  </div>

                  {/* Events */}
                  <div className="flex items-center justify-between py-3 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                      <Calendar className="h-5 w-5 text-gray-400" />
                      <div>
                        <Label className="font-medium">Events</Label>
                        <p className="text-sm text-gray-500">New events and invitations</p>
                      </div>
                    </div>
                    <Switch
                      checked={settings.event_notifications}
                      onCheckedChange={(value) => handleToggle('event_notifications', value)}
                    />
                  </div>

                  {/* Event Reminders */}
                  <div className="flex items-center justify-between py-3 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                      <Bell className="h-5 w-5 text-gray-400" />
                      <div>
                        <Label className="font-medium">Event Reminders</Label>
                        <p className="text-sm text-gray-500">Reminders for upcoming events</p>
                      </div>
                    </div>
                    <Switch
                      checked={settings.event_reminder_notifications}
                      onCheckedChange={(value) => handleToggle('event_reminder_notifications', value)}
                    />
                  </div>

                  {/* Messages */}
                  <div className="flex items-center justify-between py-3 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                      <MessageSquare className="h-5 w-5 text-gray-400" />
                      <div>
                        <Label className="font-medium">Messages</Label>
                        <p className="text-sm text-gray-500">New direct messages</p>
                      </div>
                    </div>
                    <Switch
                      checked={settings.message_notifications}
                      onCheckedChange={(value) => handleToggle('message_notifications', value)}
                    />
                  </div>

                  {/* Connections */}
                  <div className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <Users className="h-5 w-5 text-gray-400" />
                      <div>
                        <Label className="font-medium">Connections</Label>
                        <p className="text-sm text-gray-500">Connection requests and updates</p>
                      </div>
                    </div>
                    <Switch
                      checked={settings.connection_notifications}
                      onCheckedChange={(value) => handleToggle('connection_notifications', value)}
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Info note */}
          <p className="text-sm text-blue-800">
            You can always change these preferences later in your account settings.
          </p>
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={handleBack} disabled={saving} className="rounded-full">
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        <Button
          onClick={handleContinue}
          disabled={saving}
          className="bg-brand-primary hover:bg-brand-primary-hover rounded-full"
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              Complete Setup
              <ChevronRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
