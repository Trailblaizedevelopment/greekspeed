'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Eye, Download, Edit, Trash2, Lock, X, User, Calendar, Shield } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase/client';
import { toast } from 'react-toastify';
import { AllDocumentsModal } from './AllDocumentsModal';
import { DocumentDetailDrawer } from './DocumentDetailDrawer';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { useActiveChapter } from '@/lib/contexts/ActiveChapterContext';
import { useScopedChapterId } from '@/lib/hooks/useScopedChapterId';
import { resolveEffectiveRoleForActiveContext } from '@/lib/utils/effectiveDashboardRole';

// Use the same interface as ChapterDocumentManager
interface ChapterDocument {
  id: string;
  title: string;
  description: string | null;
  file_url: string | null;
  file_type: string | null;
  file_size: number | null;
  owner_id: string | null;
  chapter_id: string | null;
  visibility: string[];
  document_type: 'chapter_document' | 'general';
  created_at: string;
  updated_at: string;
  owner_name?: string;
  tags?: string[];
  storage_path?: string;
}

export function DocsCompliancePanel() {
  const [documents, setDocuments] = useState<ChapterDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAllDocumentsModal, setShowAllDocumentsModal] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<ChapterDocument | null>(null);
  const [showDetailDrawer, setShowDetailDrawer] = useState(false);
  const { profile, isDeveloper } = useProfile();
  const chapterId = useScopedChapterId();
  const { activeChapterId, memberSpaces } = useActiveChapter();
  const effectiveRole = resolveEffectiveRoleForActiveContext(profile, activeChapterId, memberSpaces);

  // Load documents on component mount (limit to 3)
  useEffect(() => {
    if (chapterId) {
      loadDocuments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId, profile?.role, isDeveloper, effectiveRole, activeChapterId, memberSpaces]);

  const loadDocuments = async () => {
    try {
      setLoading(true);

      if (!chapterId) {
        console.error('No chapterId available for document fetch');
        setDocuments([]);
        return;
      }

      // Build visibility filter based on user role
      let visibilityFilter = [];

      if (isDeveloper || effectiveRole === 'admin') {
        // Developers / home-chapter exec admins can see all documents in the selected chapter
        visibilityFilter = ['chapter_all', 'active_members', 'alumni', 'admins'];
      } else if (effectiveRole === 'active_member') {
        // Active members can see documents visible to chapter_all or active_members
        visibilityFilter = ['chapter_all', 'active_members'];
      } else if (effectiveRole === 'alumni') {
        // Alumni can see documents visible to chapter_all or alumni
        visibilityFilter = ['chapter_all', 'alumni'];
      } else {
        // Default fallback - only chapter_all documents
        visibilityFilter = ['chapter_all'];
      }

      // User role-based access
      console.log('User access details:', {
        userId: profile?.id,
        userRole: effectiveRole,
        chapterId,
        visibilityFilter: visibilityFilter
      });

      // Fetch documents with role-based visibility filtering
      const { data: documents, error } = await supabase
        .from('documents')
        .select(`
          *,
          profiles!documents_owner_id_fkey(full_name)
        `)
        .eq('chapter_id', chapterId)
        .eq('is_active', true)
        .overlaps('visibility', visibilityFilter) // This checks if any value in visibility array matches our filter
        .order('created_at', { ascending: false })
        .limit(3);

      if (error) {
        console.error('Error loading documents:', error);
        setDocuments([]);
      } else {
        // Documents loaded with role-based access
        console.log('Documents loaded:', {
          totalDocuments: documents?.length || 0,
          userRole: effectiveRole,
          visibilityFilter: visibilityFilter
        });

        // Transform the data to match ChapterDocument interface
        const transformedDocuments: ChapterDocument[] = (documents || []).map(doc => ({
          id: doc.id,
          title: doc.title,
          description: doc.description,
          file_url: doc.file_url,
          file_type: doc.mime_type,
          file_size: doc.file_size,
          owner_id: doc.owner_id,
          chapter_id: doc.chapter_id,
          visibility: doc.visibility,
          document_type: doc.document_type === 'chapter_document' ? 'chapter_document' : 'general',
          created_at: doc.created_at,
          updated_at: doc.updated_at,
          owner_name: doc.profiles?.full_name,
          tags: doc.tags || [],
          storage_path: doc.storage_path
        }));

        setDocuments(transformedDocuments);
      }
    } catch (error) {
      console.error('Error loading documents:', error);
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  // Reuse the same helper functions from ChapterDocumentManager
  const getFileIcon = (fileType: string | null) => {
    if (!fileType) return <FileText className="h-4 w-4" />;

    if (fileType.includes('pdf')) return <FileText className="h-4 w-4 text-red-600" />;
    if (fileType.includes('spreadsheet') || fileType.includes('excel')) return <FileText className="h-4 w-4 text-green-600" />;
    if (fileType.includes('word')) return <FileText className="h-4 w-4 text-brand-accent" />;

    return <FileText className="h-4 w-4" />;
  };

  const getFileSize = (bytes: number | null) => {
    if (!bytes) return 'Unknown size';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;

    return date.toLocaleDateString();
  };

  const getVisibilityBadges = (visibility: string[]) => {
    return visibility.map(v => (
      <Badge
        key={v}
        variant="secondary"
        className="text-xs"
      >
        {v}
      </Badge>
    ));
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      legal: 'bg-purple-100 text-purple-800',
      finance: 'bg-green-100 text-green-800',
      safety: 'bg-red-100 text-red-800',
      policy: 'bg-accent-100 text-accent-800',
      general: 'bg-gray-100 text-gray-800'
    };
    return colors[category] || colors.general;
  };

  // Reuse the same action handlers (locked functionality)
  const handleViewDocument = (doc: ChapterDocument) => {
    toast.info('Document viewing is currently locked. This feature will be available soon!');
  };

  const handleEditDocument = (doc: ChapterDocument) => {
    toast.info('Document editing is currently locked. This feature will be available soon!');
  };

  const handleDeleteDocument = (doc: ChapterDocument) => {
    toast.info('Document deletion is currently locked. This feature will be available soon!');
  };

  const handleDownload = async (doc: ChapterDocument) => {
    try {
      if (doc.file_url) {
        const link = document.createElement('a');
        link.href = doc.file_url;
        link.download = `${doc.title}.${doc.file_type || 'pdf'}`;
        link.target = '_blank';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        toast.success('Download started!');
      } else {
        toast.error('Document not accessible for download');
      }
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Download failed. Please try again.');
    }
  };

  if (loading) {
    return (
      <Card className="bg-white">
        <CardHeader className="pb-3 px-3 sm:px-6">
          <CardTitle className="text-base sm:text-lg flex items-center space-x-2">
            <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-brand-primary" />
            <span>Documents</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 px-3 sm:px-6">
          <div className="flex items-center justify-center py-6 sm:py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-primary"></div>
            <span className="ml-2 text-xs sm:text-sm text-gray-600">Loading documents...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="bg-white">
        <CardHeader className="pb-3 px-3 sm:px-6">
          <CardTitle className="text-base sm:text-lg flex items-center space-x-2">
            <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-brand-primary" />
            <span>Documents</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 px-3 sm:px-6">
          <div className="space-y-2 sm:space-y-3">
            {documents.length === 0 ? (
              <div className="text-center py-4 sm:py-6 text-gray-500">
                <FileText className="h-6 w-6 sm:h-8 sm:w-8 mx-auto mb-2 text-gray-300" />
                <p className="text-xs sm:text-sm">No documents found</p>
              </div>
            ) : (
              documents.map((doc) => (
                <div
                  key={doc.id}
                  className="p-2 sm:p-3 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors relative cursor-pointer"
                  onClick={() => {
                    setSelectedDocument(doc);
                    setShowDetailDrawer(true);
                  }}
                >
                  {/* Download Button - Absolutely positioned top right */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent drawer from opening
                      handleDownload(doc);
                    }}
                    title="Download Document"
                    className="absolute top-2 right-2 sm:top-3 sm:right-3 h-6 w-6 sm:h-7 sm:w-auto px-2 flex-shrink-0 z-10"
                  >
                    <Download className="h-3 w-3" />
                  </Button>

                  {/* Title Section - Has padding-right to avoid button overlap */}
                  <div className="flex items-start gap-1.5 sm:gap-2 pr-8 sm:pr-10 mb-1.5 sm:mb-2">
                    <div className="flex-shrink-0 pt-0.5">
                      {getFileIcon(doc.file_type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="font-medium text-gray-900 text-xs sm:text-sm break-words">{doc.title}</h4>
                    </div>
                  </div>

                  {/* Metadata - Responsive layout */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-xs text-gray-500 mb-1.5 sm:mb-2">
                    <div className="flex items-center gap-1 min-w-0 flex-1 sm:flex-initial">
                      <User className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">{doc.owner_name || 'Unknown'}</span>
                    </div>
                    <div className="flex items-center gap-1 min-w-0 flex-1 sm:flex-initial">
                      <Calendar className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">{formatDate(doc.updated_at)}</span>
                    </div>
                  </div>

                  {/* Tags and Visibility - Compact on mobile */}
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap mb-1 sm:mb-2">
                    {doc.tags?.slice(0, 1).map(tag => (
                      <Badge
                        key={tag}
                        className={`${getCategoryColor(tag)} text-xs px-1.5 py-0.5`}
                      >
                        {tag}
                      </Badge>
                    ))}
                    {doc.tags && doc.tags.length > 1 && (
                      <span className="text-xs text-gray-400">+{doc.tags.length - 1}</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <Button
            onClick={() => setShowAllDocumentsModal(true)}
            variant="outline"
            className="w-full h-9 sm:h-10 rounded-full text-brand-primary border-brand-primary bg-white hover:bg-primary-50 font-medium text-xs sm:text-sm shadow-sm hover:shadow-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-300 mt-3 sm:mt-4"
          >
            All Documents
          </Button>
        </CardContent>
      </Card>

      <AllDocumentsModal
        isOpen={showAllDocumentsModal}
        onClose={() => setShowAllDocumentsModal(false)}
        documents={documents}
        onDocumentDeleted={(deletedId) => {
          setDocuments(prev => prev.filter(d => d.id !== deletedId));
        }}
      />

      {/* Document Detail Drawer */}
      {selectedDocument && (
        <DocumentDetailDrawer
          doc={selectedDocument}
          isOpen={showDetailDrawer}
          onClose={() => {
            setShowDetailDrawer(false);
            setSelectedDocument(null);
          }}
          onDelete={(deletedId) => {
            setDocuments(prev => prev.filter(d => d.id !== deletedId));
          }}
        />
      )}
    </>
  );
} 