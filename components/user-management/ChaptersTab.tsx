'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Building2,
  Plus,
  Eye,
  Edit,
  Trash2,
  MapPin,
  Users,
  Calendar,
  Palette,
  UserPlus,
} from 'lucide-react';
import { ViewChapterModal } from './ViewChapterModal';
import { DeleteChapterModal } from './DeleteChapterModal';
import { EditChapterModal } from './EditChapterModal';
import { CreateChapterForm } from './CreateChapterForm';
import { ChapterSpaceManageSheet, type ChapterRow } from './ChapterSpaceManageSheet';
import { useAuth } from '@/lib/supabase/auth-context';

export interface Chapter {
  id: string;
  name: string;
  description: string;
  location: string;
  member_count: number;
  founded_year: number;
  university: string;
  slug: string;
  national_fraternity: string;
  chapter_name: string;
  school: string;
  school_location: string;
  chapter_status: string;
  created_at: string;
  updated_at: string;
  space_type?: string | null;
}

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function ChaptersTab() {
  const router = useRouter();
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewChapter, setViewChapter] = useState<Chapter | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  
  // Add delete state variables
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [chapterToDelete, setChapterToDelete] = useState<Chapter | null>(null);
  const [deletingChapterId, setDeletingChapterId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editChapter, setEditChapter] = useState<Chapter | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const [manageSheetOpen, setManageSheetOpen] = useState(false);
  const [manageChapter, setManageChapter] = useState<ChapterRow | null>(null);

  // Add pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalChapters, setTotalChapters] = useState(0);
  const [pageSize] = useState(100); // Show 100 chapters per page

  const debouncedSearch = useDebouncedValue(searchTerm.trim(), 400);
  /** When search changes we reset to page 1; skip one fetch while `currentPage` is still stale. */
  const pendingSearchPageResetRef = useRef(false);

  useEffect(() => {
    pendingSearchPageResetRef.current = true;
    setCurrentPage(1);
  }, [debouncedSearch]);

  const fetchChapters = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: String(pageSize),
      });
      if (debouncedSearch.length > 0) {
        params.set('q', debouncedSearch);
      }
      const response = await fetch(`/api/developer/chapters?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setChapters(data.chapters || []);
        setTotalChapters(data.total || 0);
        setTotalPages(data.totalPages || 1);
      } else {
        console.error('Failed to fetch chapters');
      }
    } catch (error) {
      console.error('Error fetching chapters:', error);
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, debouncedSearch]);

  useEffect(() => {
    if (pendingSearchPageResetRef.current && currentPage !== 1) {
      return;
    }
    pendingSearchPageResetRef.current = false;
    void fetchChapters();
  }, [fetchChapters, currentPage]);

  const handleViewChapter = (chapter: Chapter) => {
    setViewChapter(chapter);
    setIsViewModalOpen(true);
  };

  // Add delete handler functions
  const openDeleteModal = (chapter: Chapter) => {
    setChapterToDelete(chapter);
    setDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    setDeleteModalOpen(false);
    setChapterToDelete(null);
  };

  const handleDeleteChapter = async () => {
    if (!chapterToDelete) return;

    try {
      setDeletingChapterId(chapterToDelete.id);
      
      const response = await fetch(`/api/developer/chapters?chapterId=${chapterToDelete.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete chapter');
      }

      const result = await response.json();
      // Chapter deleted successfully
      
      // Close modal and show success message
      closeDeleteModal();

      alert(`Chapter "${chapterToDelete.name}" has been deleted successfully.`);

      await fetchChapters();
    } catch (error) {
      console.error('Error deleting chapter:', error);
      alert(`Failed to delete chapter: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setDeletingChapterId(null);
    }
  };

  const handleEditChapter = (chapter: Chapter) => {
    setEditChapter(chapter);
    setIsEditModalOpen(true);
  };

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    setEditChapter(null);
  };

  const openManageSheet = (chapter: Chapter) => {
    setManageChapter({
      id: chapter.id,
      name: chapter.name,
      description: chapter.description,
      location: chapter.location,
      member_count: chapter.member_count,
      founded_year: chapter.founded_year,
      university: chapter.university,
      slug: chapter.slug,
      national_fraternity: chapter.national_fraternity,
      chapter_name: chapter.chapter_name,
      school: chapter.school,
      school_location: chapter.school_location,
      chapter_status: chapter.chapter_status,
      space_type: chapter.space_type ?? null,
    });
    setManageSheetOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading organization...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Organization Management</h2>
          <p className="text-gray-600">Create and manage your organization's at scale</p>
        </div>
        <Button 
          onClick={() => setShowCreateForm(true)} 
          className="flex items-center space-x-2"
        >
          <Plus className="h-4 w-4" />
          <span>Create Organization</span>
        </Button>
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <Input
            placeholder="Search across all chapters (name, university, fraternity, slug, school…) — results paginate on the server"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full"
          />
        </div>
      </div>

      {/* Chapters Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center space-x-2">
            <Building2 className="h-5 w-5" />
            <span>
              {debouncedSearch ? 'Matching chapters' : 'All chapters'} ({totalChapters.toLocaleString()})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="overflow-x-auto">
            {/* Scrollable container with fixed height */}
            <div className="max-h-[70vh] overflow-y-auto border border-gray-200 rounded-lg">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-gray-50 z-10">
                  <tr className="border-b">
                    <th className="text-left p-3 font-medium text-sm bg-gray-50">Chapter Info</th>
                    <th className="text-left p-3 font-medium text-sm bg-gray-50">Location & University</th>
                    <th className="text-left p-3 font-medium text-sm bg-gray-50">National Fraternity</th>
                    <th className="text-left p-3 font-medium text-sm bg-gray-50">Members & Founded</th>
                    <th className="text-left p-3 font-medium text-sm bg-gray-50">Status</th>
                    <th className="text-left p-3 font-medium text-sm bg-gray-50">Created</th>
                    <th className="text-left p-3 font-medium text-sm bg-gray-50">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {chapters.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-sm text-gray-500">
                        {debouncedSearch
                          ? `No chapters match “${debouncedSearch}”. Try a shorter or different search.`
                          : 'No chapters found.'}
                      </td>
                    </tr>
                  ) : null}
                  {chapters.map((chapter) => (
                    <tr key={chapter.id} className="border-b hover:bg-gray-50">
                      <td className="p-3">
                        <div>
                          <p className="font-medium">{chapter.name}</p>
                          <p className="text-sm text-gray-600">{chapter.chapter_name}</p>
                          <p className="text-xs text-gray-500">{chapter.slug}</p>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center space-x-2">
                          <MapPin className="h-4 w-4 text-gray-400" />
                          <div>
                            <p className="font-medium">{chapter.location}</p>
                            <p className="text-sm text-gray-600">{chapter.university}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <div>
                          <p className="font-medium">{chapter.national_fraternity}</p>
                          <p className="text-sm text-gray-600">{chapter.school}</p>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center space-x-2">
                          <Users className="h-4 w-4 text-gray-400" />
                          <span className="font-medium">{chapter.member_count}</span>
                          <span className="text-gray-400">|</span>
                          <Calendar className="h-4 w-4 text-gray-400" />
                          <span>{chapter.founded_year}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge 
                          variant={chapter.chapter_status === 'active' ? 'default' : 'secondary'}
                          className="capitalize"
                        >
                          {chapter.chapter_status}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <div className="text-sm text-gray-600">
                          {new Date(chapter.created_at).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center space-x-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleViewChapter(chapter)}
                            className="hover:bg-accent-50 hover:text-brand-accent"
                            title="View Chapter"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openManageSheet(chapter)}
                            className="hover:bg-accent-50 hover:text-brand-accent"
                            title="Members & assign"
                          >
                            <UserPlus className="h-4 w-4" />
                          </Button>

                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleEditChapter(chapter)}
                            className="hover:bg-accent-50 hover:text-brand-accent"
                            title="Edit Chapter"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => router.push(`/dashboard/user-management/chapters/${chapter.id}/branding`)}
                            className="hover:bg-purple-50 hover:text-purple-600"
                            title="Manage Branding"
                          >
                            <Palette className="h-4 w-4" />
                          </Button>
                          
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="text-red-600 hover:bg-red-50 hover:text-red-700"
                            onClick={() => openDeleteModal(chapter)}
                            disabled={deletingChapterId === chapter.id}
                            title="Delete Chapter"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Pagination Controls */}
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-gray-600">
                <p>
                  Showing {totalChapters === 0 ? 0 : (currentPage - 1) * pageSize + 1} to{' '}
                  {Math.min(currentPage * pageSize, totalChapters)} of {totalChapters.toLocaleString()}
                  {debouncedSearch ? ` matching “${debouncedSearch}”` : ''} chapters
                </p>
              </div>
              
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1 || loading}
                >
                  Previous
                </Button>
                
                <div className="flex items-center space-x-1">
                  <span className="text-sm text-gray-600">Page</span>
                  <span className="text-sm font-medium">{currentPage}</span>
                  <span className="text-sm text-gray-600">of</span>
                  <span className="text-sm font-medium">{totalPages}</span>
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages || loading}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* View Chapter Modal */}
      {isViewModalOpen && viewChapter && (
        <ViewChapterModal
          isOpen={isViewModalOpen}
          onClose={() => setIsViewModalOpen(false)}
          chapter={viewChapter}
        />
      )}

      {/* Create Chapter Form */}
      {showCreateForm && (
        <CreateChapterForm 
          onClose={() => setShowCreateForm(false)} 
          onSuccess={fetchChapters} 
        />
      )}

      {/* Delete Chapter Modal */}
      <DeleteChapterModal
        isOpen={deleteModalOpen}
        onClose={closeDeleteModal}
        onConfirm={handleDeleteChapter}
        chapter={chapterToDelete}
        isDeleting={deletingChapterId === chapterToDelete?.id}
      />

      {/* Edit Chapter Modal */}
      {isEditModalOpen && editChapter && (
        <EditChapterModal
          isOpen={isEditModalOpen}
          onClose={closeEditModal}
          chapter={editChapter}
          onSuccess={fetchChapters}
        />
      )}

      <ChapterSpaceManageSheet
        open={manageSheetOpen}
        onOpenChange={setManageSheetOpen}
        chapter={manageChapter}
        accessToken={accessToken}
        onRequestFullEdit={(c) => {
          const full = chapters.find((x) => x.id === c.id);
          if (full) {
            setManageSheetOpen(false);
            handleEditChapter(full);
          }
        }}
        onSpaceUpdated={() => void fetchChapters()}
      />
    </div>
  );
}
