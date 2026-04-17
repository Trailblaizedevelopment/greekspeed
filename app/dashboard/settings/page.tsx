'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Settings, Shield, Bell, ArrowLeft, Mail, User, Phone, Calendar, Lock, User as UserIcon, HelpCircle, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { useOneSignalPush } from '@/lib/hooks/useOneSignalPush';
import { clearPushPromptCooldown } from '@/lib/utils/pushPromptStorage';
import { ChangePasswordForm } from '@/components/features/settings/ChangePasswordForm';

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState('security');
  const [activeSubSection, setActiveSubSection] = useState<string | null>(null);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [chapterAnnouncements, setChapterAnnouncements] = useState(true);
  const [connectionRequests, setConnectionRequests] = useState(true);
  const [messageNotifications, setMessageNotifications] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [emailPrefsLoading, setEmailPrefsLoading] = useState(false);
  const [emailPrefs, setEmailPrefs] = useState({
    announcement_notifications: true,
    event_notifications: true,
    event_reminder_notifications: true,
    message_notifications: true,
    connection_notifications: true,
    post_comment_notifications: true,
    comment_reply_notifications: true,
    post_like_notifications: true,
    comment_like_notifications: true,
    inactivity_reminder_notifications: true,
  });

  // Helper to PATCH only changed fields
  const updateEmailSettings = async (payload:Partial<typeof emailPrefs> & { email_enabled?: boolean }) => {
    if (!profile?.id) return;
    setEmailPrefsLoading(true);
    try {
      const res = await fetch('/api/notifications/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: profile.id, ...payload }),
      });
      if (!res.ok) throw new Error('Failed to update email settings');
    } finally {
      setEmailPrefsLoading(false);
    }
  };
  
  // Mobile-specific state
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  
  // SMS notification state - SIMPLIFIED to just one toggle
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);

  const router = useRouter();
  const { profile, loading: profileLoading } = useProfile();
  const {
    permission: pushPermission,
    playerId,
    isSubscribed: pushSubscribed,
    isPushSupported,
    isLoading: pushLoading,
    requestPermission,
  } = useOneSignalPush(profile?.id);

  // Fetch notification settings on mount
  useEffect(() => {
    if (profile?.id) {
      fetchNotificationSettings(profile.id);
    }
  }, [profile?.id]);

  const fetchNotificationSettings = async (userId: string) => {
    try {
      setLoadingSettings(true);
      const response = await fetch(`/api/notifications/settings?userId=${userId}`);
      if (response.ok) {
        const data = await response.json();
        // Explicitly check for boolean true (not just truthy)
        const smsEnabled = data.sms_enabled === true;
        console.log('📋 Settings loaded:', { 
          sms_enabled: data.sms_enabled, 
          parsed: smsEnabled,
          type: typeof data.sms_enabled 
        });
        setSmsEnabled(smsEnabled);

        setEmailEnabled(data.email_enabled === true);
        setEmailPrefs({
          announcement_notifications: data.announcement_notifications === true,
          event_notifications: data.event_notifications === true,
          event_reminder_notifications: data.event_reminder_notifications === true,
          message_notifications: data.message_notifications === true,
          connection_notifications: data.connection_notifications === true,
          post_comment_notifications: data.post_comment_notifications !== false,
          comment_reply_notifications: data.comment_reply_notifications !== false,
          post_like_notifications: data.post_like_notifications !== false,
          comment_like_notifications: data.comment_like_notifications !== false,
          inactivity_reminder_notifications: data.inactivity_reminder_notifications !== false,
        })
      } else {
        console.error('Failed to fetch settings:', response.status);
      }
    } catch (error) {
      console.error('Error fetching notification settings:', error);
    } finally {
      setLoadingSettings(false);
    }
  };

  const handleSMSEnabledToggle = async (value: boolean) => {
    if (!profile?.id) return;
    
    // Optimistically update UI
    setSmsEnabled(value);
    
    try {
      const response = await fetch('/api/notifications/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: profile.id,
          sms_enabled: value
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update setting');
      }

      const result = await response.json();
      console.log('✅ SMS preference updated:', result);
    } catch (error) {
      console.error('Error updating notification setting:', error);
      // Revert on error
      setSmsEnabled(!value);
      // You could add a toast notification here
    }
  };

  // Master Email Toggle
  const handleEmailEnabledToggle = async (value: boolean) => {
    setEmailEnabled(value);
    await updateEmailSettings({ email_enabled: value });
  };  

  // Individual Email Preferences
  const togglePref = async (key: keyof typeof emailPrefs, value?: boolean) => {
    if (!emailEnabled) return;
    const newValue = value !== undefined ? value : !emailPrefs[key];
    const next = { ...emailPrefs, [key]: newValue };
    setEmailPrefs(next);
    await updateEmailSettings({ [key]: next[key] });
  };

  const sidebarItems = [
    {
      id: 'security',
      label: 'Security',
      icon: Shield,
      description: 'Password and security settings',
      mobileDescription: 'Password & security',
      locked: false
    },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: Bell,
      description: 'Notification preferences',
      mobileDescription: 'Notification preferences',
      locked: false
    },
    {
      id: 'account',
      label: 'Account',
      icon: User,
      description: 'Account management & data',
      mobileDescription: 'Account management',
      locked: true
    },
    {
      id: 'support',
      label: 'Support',
      icon: HelpCircle,
      description: 'Help & support center',
      mobileDescription: 'Help & support',
      locked: false,
      /** Opens full support page (TRA-628) instead of an in-settings panel. */
      navigateTo: '/dashboard/support',
    }
  ];

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return 'Unknown';
    }
  };

  const handleBackToSecurity = () => {
    setActiveSubSection(null);
  };

  const handlePasswordChangeSuccess = () => {
    setActiveSubSection(null);
  };

  // Mobile-specific handlers
  const handleMobileSectionSelect = (item: (typeof sidebarItems)[number]) => {
    if (item.locked) return;
    if (item.navigateTo) {
      router.push(item.navigateTo);
      setShowMobileMenu(false);
      return;
    }
    setActiveSection(item.id);
    setShowMobileMenu(false);
  };

  const handleDesktopSidebarItemClick = (item: (typeof sidebarItems)[number]) => {
    if (item.locked) return;
    if (item.navigateTo) {
      router.push(item.navigateTo);
      return;
    }
    setActiveSection(item.id);
  };

  const handleMobileBack = () => {
    if (activeSubSection) {
      setActiveSubSection(null);
    } else {
      router.back();
    }
  };

  const renderSecurityContent = () => {
    // Show change password form if that's the active sub-section
    if (activeSubSection === 'change-password') {
      return (
        <ChangePasswordForm
          showBackButton={true}
          onBack={handleBackToSecurity}
          onSuccess={handlePasswordChangeSuccess}
        />
      );
    }

    // Default security content
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Security Settings</h2>
          <p className="text-gray-600">Manage your account security and privacy settings</p>
        </div>

        {/* Account Information - Mobile optimized */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Account Information</h3>
          
          <div className="space-y-3">
            {/* Email */}
            <div className="flex items-center space-x-4 p-4 border rounded-xl bg-gray-50">
              <Mail className="w-5 h-5 text-gray-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">Email Address</p>
                <p className="text-sm text-gray-600 truncate">{profile?.email || 'Not provided'}</p>
              </div>
            </div>

            {/* Full Name */}
            <div className="flex items-center space-x-4 p-4 border rounded-xl bg-gray-50">
              <User className="w-5 h-5 text-gray-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">Full Name</p>
                <p className="text-sm text-gray-600 truncate">{profile?.full_name || 'Not provided'}</p>
              </div>
            </div>

            {/* Phone */}
            <div className="flex items-center space-x-4 p-4 border rounded-xl bg-gray-50">
              <Phone className="w-5 h-5 text-gray-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">Phone Number</p>
                <p className="text-sm text-gray-600 truncate">{profile?.phone || 'Not provided'}</p>
              </div>
            </div>

            {/* Created At */}
            <div className="flex items-center space-x-4 p-4 border rounded-xl bg-gray-50">
              <Calendar className="w-5 h-5 text-gray-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">Member Since</p>
                <p className="text-sm text-gray-600 truncate">
                  {profile?.created_at ? formatDate(profile.created_at) : 'Unknown'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Security Actions - Mobile optimized */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Security Actions</h3>
          
          <div className="space-y-3">
            {/* Password Change - Mobile friendly */}
            <div className="p-4 border rounded-xl bg-white">
              <div className="flex flex-col space-y-3 lg:flex-row lg:items-center lg:justify-between lg:space-y-0">
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900">Password</h4>
                  <p className="text-sm text-gray-600 mt-1">Set a unique password for better protection</p>
                </div>
                <Button 
                  variant="outline"
                  onClick={() => setActiveSubSection('change-password')}
                  className="w-full lg:w-auto mt-3 lg:mt-0 rounded-full"
                >
                  Change Password
                </Button>
              </div>
            </div>

            
          </div>
        </div>
      </div>
    );
  };

  const renderNotificationsContent = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Notification Preferences</h2>
        <p className="text-gray-600">Control how and when you receive notifications</p>
      </div>

      {/* Email Notifications */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Email Notifications</h3>

        {/* Master Toggle */}
        <div className="p-4 border rounded-xl bg-white">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h4 className="font-medium text-gray-900">Enable Email Notifications</h4>
              <p className="text-sm text-gray-600">
                <span className="hidden lg:inline">Turn all email notifications on or off</span>
                <span className="lg:hidden">Turn all email notifications on or off</span>
              </p>
            </div>
            <div className="flex items-center space-x-3 ml-4">
              <Switch
                checked={emailEnabled}
                onCheckedChange={handleEmailEnabledToggle}
                disabled={emailPrefsLoading}
              />
            </div>
          </div>
        </div>

        {/* Sub-toggles, disabled if master off */}
        {emailEnabled && (
          <div className="space-y-3">
            <div className="p-4 border rounded-xl bg-white">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900">Announcements</h4>
                  <p className="text-sm text-gray-600">
                    <span className="hidden lg:inline">Receive chapter announcements</span>
                    <span className="lg:hidden">Chapter announcements</span>
                  </p>
                </div>
                <div className="flex items-center space-x-3 ml-4">
                  <Switch
                    checked={emailPrefs.announcement_notifications}
                    onCheckedChange={(checked) => togglePref('announcement_notifications', checked)}
                    disabled={emailPrefsLoading}
                  />
                </div>
              </div>
            </div>

            <div className="p-4 border rounded-xl bg-white">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900">Events</h4>
                  <p className="text-sm text-gray-600">
                    <span className="hidden lg:inline">Get notified about new events</span>
                    <span className="lg:hidden">New events</span>
                  </p>
                </div>
                <div className="flex items-center space-x-3 ml-4">
                  <Switch
                    checked={emailPrefs.event_notifications}
                    onCheckedChange={(checked) => togglePref('event_notifications', checked)}
                    disabled={emailPrefsLoading}
                  />
                </div>
              </div>
            </div>

            <div className="p-4 border rounded-xl bg-white">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900">Event Reminders</h4>
                  <p className="text-sm text-gray-600">
                    <span className="hidden lg:inline">Receive reminders for upcoming events</span>
                    <span className="lg:hidden">Upcoming event reminders</span>
                  </p>
                </div>
                <div className="flex items-center space-x-3 ml-4">
                  <Switch
                    checked={emailPrefs.event_reminder_notifications}
                    onCheckedChange={(checked) => togglePref('event_reminder_notifications', checked)}
                    disabled={emailPrefsLoading}
                  />
                </div>
              </div>
            </div>

            <div className="p-4 border rounded-xl bg-white">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900">Messages</h4>
                  <p className="text-sm text-gray-600">
                    <span className="hidden lg:inline">Get notified when you receive new messages</span>
                    <span className="lg:hidden">New messages</span>
                  </p>
                </div>
                <div className="flex items-center space-x-3 ml-4">
                  <Switch
                    checked={emailPrefs.message_notifications}
                    onCheckedChange={(checked) => togglePref('message_notifications', checked)}
                    disabled={emailPrefsLoading}
                  />
                </div>
              </div>
            </div>

            <div className="p-4 border rounded-xl bg-white">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900">Connections</h4>
                  <p className="text-sm text-gray-600">
                    <span className="hidden lg:inline">Notify me about requests and accepted connections</span>
                    <span className="lg:hidden">Connection requests</span>
                  </p>
                </div>
                <div className="flex items-center space-x-3 ml-4">
                  <Switch
                    checked={emailPrefs.connection_notifications}
                    onCheckedChange={(checked) => togglePref('connection_notifications', checked)}
                    disabled={emailPrefsLoading}
                  />
                </div>
              </div>
            </div>

            <div className="p-4 border rounded-xl bg-white">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900">Post comments</h4>
                  <p className="text-sm text-gray-600">
                    Email when someone comments on your post
                  </p>
                </div>
                <div className="flex items-center space-x-3 ml-4">
                  <Switch
                    checked={emailPrefs.post_comment_notifications}
                    onCheckedChange={(checked) => togglePref('post_comment_notifications', checked)}
                    disabled={emailPrefsLoading}
                  />
                </div>
              </div>
            </div>

            <div className="p-4 border rounded-xl bg-white">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900">Comment replies</h4>
                  <p className="text-sm text-gray-600">
                    Email when someone replies to your comment
                  </p>
                </div>
                <div className="flex items-center space-x-3 ml-4">
                  <Switch
                    checked={emailPrefs.comment_reply_notifications}
                    onCheckedChange={(checked) => togglePref('comment_reply_notifications', checked)}
                    disabled={emailPrefsLoading}
                  />
                </div>
              </div>
            </div>

            <div className="p-4 border rounded-xl bg-white">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900">Post likes</h4>
                  <p className="text-sm text-gray-600">
                    Email when someone likes your post
                  </p>
                </div>
                <div className="flex items-center space-x-3 ml-4">
                  <Switch
                    checked={emailPrefs.post_like_notifications}
                    onCheckedChange={(checked) => togglePref('post_like_notifications', checked)}
                    disabled={emailPrefsLoading}
                  />
                </div>
              </div>
            </div>

            <div className="p-4 border rounded-xl bg-white">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900">Comment likes</h4>
                  <p className="text-sm text-gray-600">
                    Email when someone likes your comment
                  </p>
                </div>
                <div className="flex items-center space-x-3 ml-4">
                  <Switch
                    checked={emailPrefs.comment_like_notifications}
                    onCheckedChange={(checked) => togglePref('comment_like_notifications', checked)}
                    disabled={emailPrefsLoading}
                  />
                </div>
              </div>
            </div>

            <div className="p-4 border rounded-xl bg-white">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900">Inactivity reminder</h4>
                  <p className="text-sm text-gray-600">
                    Email after 30 days of no activity
                  </p>
                </div>
                <div className="flex items-center space-x-3 ml-4">
                  <Switch
                    checked={emailPrefs.inactivity_reminder_notifications}
                    onCheckedChange={(checked) => togglePref('inactivity_reminder_notifications', checked)}
                    disabled={emailPrefsLoading}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SMS Notifications */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Phone className="w-5 h-5" />
          SMS Notifications
        </h3>
        
        {/* Single SMS Toggle */}
        <div className="p-4 border rounded-xl bg-white">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h4 className="font-medium text-gray-900">Enable SMS Notifications</h4>
              <p className="text-sm text-gray-600">
                <span className="hidden lg:inline">Receive SMS notifications for events, messages, and connections</span>
                <span className="lg:hidden">SMS for events & messages</span>
              </p>
            </div>
            <div className="flex items-center space-x-3 ml-4">
              <Switch
                checked={smsEnabled}
                onCheckedChange={handleSMSEnabledToggle}
                disabled={loadingSettings}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Browser Push Notifications */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Bell className="w-5 h-5" />
          Browser Push Notifications
        </h3>

        {!isPushSupported && (
          <div className="p-4 border rounded-xl bg-gray-50">
            <p className="text-sm text-gray-600">
              Push notifications are not supported in this browser.
            </p>
          </div>
        )}

        {isPushSupported && pushLoading && (
          <div className="p-4 border rounded-xl bg-white">
            <p className="text-sm text-gray-500">Loading push settings...</p>
          </div>
        )}

        {isPushSupported && !pushLoading && pushPermission === 'default' && (
          <div className="p-4 border rounded-xl bg-white">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex-1">
                <h4 className="font-medium text-gray-900">Enable push notifications</h4>
                <p className="text-sm text-gray-600">
                  {/* Desktop copy */}
                  <span className="hidden lg:inline">
                    Get real-time alerts in this browser for events, messages, and more.
                  </span>
                  {/* Mobile copy (shorter) */}
                  <span className="lg:hidden">
                    Get alerts for events, messages, and more.
                  </span>
                </p>
              </div>
              <div className="w-full lg:w-auto">
                <Button
                  onClick={() => requestPermission()}
                  className="w-full lg:w-auto rounded-full"
                >
                  Enable push notifications
                </Button>
              </div>
            </div>
          </div>
        )}

        {isPushSupported && !pushLoading && pushPermission === 'granted' && pushSubscribed && (
          <div className="p-4 border rounded-xl bg-white">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h4 className="font-medium text-gray-900">Push notifications enabled</h4>
                <p className="text-sm text-gray-600">
                  You will receive push alerts in this browser.
                </p>
              </div>
            </div>
          </div>
        )}

        {isPushSupported && !pushLoading && pushPermission === 'denied' && (
          <div className="p-4 border rounded-xl bg-white space-y-3">
            <div>
              <h4 className="font-medium text-gray-900">Push notifications disabled</h4>
              <p className="text-sm text-gray-600 mt-1">
                To enable push alerts, allow notifications for this site in your browser or device settings (e.g. address bar lock icon, or Settings &gt; Site settings &gt; Notifications).
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                if (profile?.id) clearPushPromptCooldown(profile.id);
                requestPermission();
              }}
              className="rounded-full"
            >
              Try again / Enable notifications
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  // Loading state with responsive design
  if (profileLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-accent-50/20">
        {/* Desktop Loading */}
        <div className="hidden lg:block">
          <div className="flex gap-6 py-6">
              <div className="w-72 flex-shrink-0">
                <Card className="bg-white shadow-sm">
                  <CardContent className="p-6">
                    <div className="animate-pulse space-y-4">
                      <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                      <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                      <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                    </div>
                  </CardContent>
                </Card>
              </div>
              <div className="flex-1 pr-14">
                <div className="bg-white rounded-lg shadow-sm p-8">
                  <div className="animate-pulse space-y-6">
                    <div className="h-8 bg-gray-200 rounded w-1/3"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                    <div className="space-y-4">
                      <div className="h-20 bg-gray-200 rounded"></div>
                      <div className="h-20 bg-gray-200 rounded"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        {/* Mobile Loading */}
        <div className="lg:hidden">
          <div className="animate-pulse space-y-4 p-4">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="space-y-3">
              <div className="h-16 bg-gray-200 rounded"></div>
              <div className="h-16 bg-gray-200 rounded"></div>
              <div className="h-16 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-accent-50/20">
      {/* Desktop Layout - Unchanged */}
      <div className="hidden lg:block">
        <div className="flex gap-6 py-6">
          {/* Sidebar */}
          <div className="w-72 flex-shrink-0">
            <Card className="bg-white shadow-sm border-0 h-fit sticky top-6">
              <CardHeader className="pb-4 border-b border-gray-100">
                <Button
                  variant="ghost"
                  onClick={() => router.back()}
                  className="w-full justify-start mb-4 text-gray-600 hover:text-gray-900 rounded-full hover:bg-gray-50"
                  style={{ borderRadius: '100px' }}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <CardTitle className="text-lg text-gray-900 font-semibold">Settings</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <nav className="space-y-1">
                  {sidebarItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleDesktopSidebarItemClick(item)}
                        className={`w-full flex items-center justify-between p-3 rounded-lg text-left transition-all duration-200 ${
                          activeSection === item.id && !item.navigateTo
                            ? 'bg-accent-50 text-accent-700 border border-accent-200 shadow-sm'
                            : item.locked
                            ? 'text-gray-400 cursor-not-allowed opacity-50'
                            : 'text-gray-700 hover:bg-gray-50 hover:shadow-sm'
                        }`}
                        disabled={item.locked}
                      >
                        <div className="flex items-center space-x-3">
                          <Icon className={`w-5 h-5 flex-shrink-0 ${
                            activeSection === item.id ? 'text-brand-accent' : 'text-gray-500'
                          }`} />
                          <div>
                            <div className="font-medium text-sm">{item.label}</div>
                            <div className="text-xs text-gray-500 mt-0.5">{item.description}</div>
                          </div>
                        </div>
                        {item.locked && (
                          <Lock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </nav>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="flex-1 pr-14">
            <div className="bg-white rounded-lg shadow-sm p-8">
              {activeSection === 'security' && renderSecurityContent()}
              {activeSection === 'notifications' && renderNotificationsContent()}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Layout */}
      <div className="lg:hidden">
        {/* Mobile Header */}
        <div className="sticky top-0 z-40 bg-white border-b border-gray-200">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center space-x-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMobileBack}
                className="p-2"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <h1 className="text-lg font-semibold text-gray-900">
                {activeSubSection ? 'Security Settings' : 'Settings'}
              </h1>
            </div>
            
            {!activeSubSection && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                className="p-2"
              >
                {showMobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            )}
          </div>
        </div>

        {/* Mobile Menu - Using Sheet Component */}
        <Sheet open={showMobileMenu} onOpenChange={setShowMobileMenu}>
          <SheetContent 
            side="bottom" 
            className="!h-auto max-h-[85dvh] mt-[15dvh] rounded-t-3xl rounded-b-none p-0 flex flex-col border border-slate-200/80 bg-white/95 shadow-[0_-24px_80px_rgba(15,23,42,0.6)]"
          >
            <SheetHeader className="px-4 pt-6 pb-4 border-b border-gray-200">
              <SheetTitle className="text-left">Settings</SheetTitle>
            </SheetHeader>
            
            <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
              {sidebarItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleMobileSectionSelect(item)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-colors ${
                      activeSection === item.id && !item.navigateTo
                        ? 'bg-accent-50 text-accent-700 border border-accent-200'
                        : item.locked
                        ? 'text-gray-400 cursor-not-allowed opacity-50'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                    disabled={item.locked}
                  >
                    <div className="flex items-center space-x-3">
                      <Icon className="w-5 h-5 flex-shrink-0" />
                      <div className="text-left">
                        <div className="font-medium text-sm">{item.label}</div>
                        <div className="text-xs text-gray-500 leading-tight">{item.mobileDescription || item.description}</div>
                      </div>
                    </div>
                    {item.locked && (
                      <Lock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </nav>
          </SheetContent>
        </Sheet>

        {/* Mobile Content - Moderate padding from edges */}
        <div className="px-6 py-6 pb-8">
          {activeSection === 'security' && (
            <div>
              {renderSecurityContent()}
            </div>
          )}
          {activeSection === 'notifications' && (
            <div>
              {renderNotificationsContent()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
