'use client';

import { useState, useEffect } from 'react';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { useAuth } from '@/lib/supabase/auth-context';
import { useRouter } from 'next/navigation';
import { DeveloperPortal } from '@/components/features/dashboard/dashboards/DeveloperPortal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { 
  Flag, 
  Search, 
  Loader2,
  AlertCircle
} from 'lucide-react';
import type { Chapter } from '@/types/chapter';
import { DEFAULT_FEATURE_FLAGS, type ChapterFeatureFlags } from '@/types/featureFlags';

interface ChapterWithFlags extends Chapter {
  feature_flags?: ChapterFeatureFlags;
}

export default function FeatureFlagsPage() {
  // ✅ ALL HOOKS MUST BE CALLED FIRST - BEFORE ANY CONDITIONAL RETURNS
  const router = useRouter();
  const { profile, isDeveloper } = useProfile();
  const { getAuthHeaders } = useAuth();
  const [chapters, setChapters] = useState<ChapterWithFlags[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState<string | null>(null);

  // ✅ MOVE useEffect BEFORE conditional return
  useEffect(() => {
    // Only load chapters if user is developer
    if (isDeveloper) {
      loadChapters();
    } else {
      setLoading(false);
    }
  }, [isDeveloper]); // Add isDeveloper as dependency

  const loadChapters = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch chapters from developer API
      const response = await fetch('/api/developer/chapters');
      if (!response.ok) {
        throw new Error('Failed to fetch chapters');
      }

      const data = await response.json();
      const chaptersList = data.chapters || [];

      // Fetch feature flags for each chapter using Bearer token
      const chaptersWithFlags = await Promise.all(
        chaptersList.map(async (chapter: Chapter) => {
          try {
            const headers = getAuthHeaders();
            const flagsResponse = await fetch(`/api/chapters/${chapter.id}/features`, {
              method: 'GET',
              headers,
            });
            
            if (flagsResponse.ok) {
              const flagsData = await flagsResponse.json();
              return {
                ...chapter,
                feature_flags: {
                  ...DEFAULT_FEATURE_FLAGS,
                  ...(flagsData.feature_flags || {}),
                },
              };
            }
            // Default if fetch fails
            return {
              ...chapter,
              feature_flags: { ...DEFAULT_FEATURE_FLAGS },
            };
          } catch (err) {
            console.error(`Error fetching flags for chapter ${chapter.id}:`, err);
            return {
              ...chapter,
              feature_flags: { ...DEFAULT_FEATURE_FLAGS },
            };
          }
        })
      );

      setChapters(chaptersWithFlags);
    } catch (err) {
      console.error('Error loading chapters:', err);
      setError(err instanceof Error ? err.message : 'Failed to load chapters');
    } finally {
      setLoading(false);
    }
  };

  const toggleFlag = async (chapterId: string, flagName: keyof ChapterFeatureFlags, currentValue: boolean) => {
    try {
      setSaving(chapterId);
      
      // Get the chapter's current flags
      const chapter = chapters.find(c => c.id === chapterId);
      if (!chapter) return;

      const currentFlags = chapter.feature_flags || {};
      
      // Toggle the flag
      const updatedFlags = {
        ...currentFlags,
        [flagName]: !currentValue
      };

      // Make PATCH request with Bearer token
      const headers = {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      };

      const response = await fetch(`/api/chapters/${chapterId}/features`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          feature_flags: updatedFlags
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update feature flags');
      }

      // Update local state
      setChapters(prev => prev.map(ch => 
        ch.id === chapterId 
          ? { ...ch, feature_flags: updatedFlags }
          : ch
      ));
    } catch (err) {
      console.error('Error toggling flag:', err);
      alert(err instanceof Error ? err.message : 'Failed to update feature flag');
    } finally {
      setSaving(null);
    }
  };

  const filteredChapters = chapters.filter(chapter =>
    chapter.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    chapter.chapter_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    chapter.university?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ✅ NOW we can do conditional rendering AFTER all hooks are called
  if (!isDeveloper) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-600">You don't have access to feature flags management.</p>
        </div>
      </div>
    );
  }

  return (
    <DeveloperPortal>
      <div className="min-h-full bg-gray-50">
      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search chapters by name, chapter name, or university..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Error State */}
        {error && (
          <Card className="mb-6 border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-center space-x-2 text-red-700">
                <AlertCircle className="h-5 w-5" />
                <span>{error}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            <span className="ml-3 text-gray-600">Loading chapters...</span>
          </div>
        ) : (
          /* Chapters List */
          <div className="space-y-4">
            {filteredChapters.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center text-gray-500">
                  No chapters found matching your search.
                </CardContent>
              </Card>
            ) : (
              filteredChapters.map((chapter) => {
                const flags = chapter.feature_flags || { ...DEFAULT_FEATURE_FLAGS };
                const isSaving = saving === chapter.id;

                return (
                  <Card key={chapter.id} className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{chapter.chapter_name || chapter.name}</CardTitle>
                          <p className="text-sm text-gray-600 mt-1">
                            {chapter.university || chapter.school} • {chapter.location}
                          </p>
                        </div>
                        {isSaving && (
                          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                        {/* Financial Tools Toggle */}
                        <div className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center space-x-2">
                            <Flag className="h-4 w-4 text-gray-400" />
                            <span className="text-sm font-medium">Financial Tools</span>
                          </div>
                          <button
                            onClick={() => toggleFlag(chapter.id, 'financial_tools_enabled', flags.financial_tools_enabled ?? true)}
                            disabled={isSaving}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                              flags.financial_tools_enabled ? 'bg-green-500' : 'bg-gray-300'
                            } ${isSaving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                flags.financial_tools_enabled ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>

                        {/* Recruitment CRM Toggle */}
                        <div className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center space-x-2">
                            <Flag className="h-4 w-4 text-gray-400" />
                            <span className="text-sm font-medium">Recruitment CRM</span>
                          </div>
                          <button
                            onClick={() => toggleFlag(chapter.id, 'recruitment_crm_enabled', flags.recruitment_crm_enabled ?? true)}
                            disabled={isSaving}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                              flags.recruitment_crm_enabled ? 'bg-green-500' : 'bg-gray-300'
                            } ${isSaving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                flags.recruitment_crm_enabled ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>

                        {/* Events Management Toggle */}
                        <div className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center space-x-2">
                            <Flag className="h-4 w-4 text-gray-400" />
                            <span className="text-sm font-medium">Events Management</span>
                          </div>
                          <button
                            onClick={() => toggleFlag(chapter.id, 'events_management_enabled', flags.events_management_enabled ?? true)}
                            disabled={isSaving}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                              flags.events_management_enabled ? 'bg-green-500' : 'bg-gray-300'
                            } ${isSaving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                flags.events_management_enabled ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>

                        {/* Crowded integration (opt-in) */}
                        <div className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center space-x-2">
                            <Flag className="h-4 w-4 text-gray-400" />
                            <span className="text-sm font-medium">Crowded integration</span>
                          </div>
                          <button
                            onClick={() =>
                              toggleFlag(
                                chapter.id,
                                'crowded_integration_enabled',
                                flags.crowded_integration_enabled ?? false
                              )
                            }
                            disabled={isSaving}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                              flags.crowded_integration_enabled ? 'bg-green-500' : 'bg-gray-300'
                            } ${isSaving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                flags.crowded_integration_enabled ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>

                        {/* Crowded: auto-create chapter contacts from member profiles (opt-in) */}
                        <div className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center space-x-2 min-w-0">
                            <Flag className="h-4 w-4 text-gray-400 shrink-0" />
                            <span className="text-sm font-medium leading-tight">
                              Crowded contact sync
                            </span>
                          </div>
                          <button
                            onClick={() =>
                              toggleFlag(
                                chapter.id,
                                'crowded_contact_sync_enabled',
                                flags.crowded_contact_sync_enabled ?? false
                              )
                            }
                            disabled={isSaving}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
                              flags.crowded_contact_sync_enabled ? 'bg-green-500' : 'bg-gray-300'
                            } ${isSaving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                flags.crowded_contact_sync_enabled ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        )}
      </div>
      </div>
    </DeveloperPortal>
  );
}