'use client';


import { useState, useEffect, useMemo } from 'react';
import { CheckSquare, Clock, AlertCircle, Users, Calendar, FileText, Plus, Loader2, Trash2, Upload, Download, ChevronLeft, ChevronRight, Check, UserMinus, ChevronDown, ChevronUp, UserPlus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { useScopedChapterId } from '@/lib/hooks/useScopedChapterId';
import { useSearchParams } from 'next/navigation';
import { Task, TaskStatus, TaskPriority, CreateTaskRequest } from '@/types/operations';
import { getTasksByChapter, updateTask, getChapterMembersForTasks } from '@/lib/services/taskService';
import { TaskModal } from '@/components/ui/TaskModal';
import { supabase } from '@/lib/supabase/client';

import { toast } from 'react-toastify';
import { documentUploadService } from '@/lib/services/documentUploadService';
import { cn } from '@/lib/utils';
import { useFeatureFlag } from '@/lib/hooks/useFeatureFlag';
import { useAuth } from '@/lib/supabase/auth-context';
import type { Recruit, RecruitStage } from '@/types/recruitment';
import { RecruitCard } from './RecruitCard';
import { RecruitDetailSheet } from './RecruitDetailSheet';
import { DocumentDetailDrawer } from './DocumentDetailDrawer';

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

export function MobileAdminTasksPage() {

  const { profile } = useProfile();
  const { session } = useAuth();
  const searchParams = useSearchParams();
  const chapterId = useScopedChapterId();
  const [activeTab, setActiveTab] = useState<'tasks' | 'docs' | 'recruits'>('tasks');
  const { enabled: recruitmentCrmEnabled } = useFeatureFlag('recruitment_crm_enabled');

  // Handle tab query param
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'recruits' && recruitmentCrmEnabled) {
      setActiveTab('recruits');
    }
  }, [searchParams, recruitmentCrmEnabled]);
  
  // Tasks state
  const [tasks, setTasks] = useState<Task[]>([]);

  const [tasksLoading, setTasksLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'pending' | 'completed' | 'my_tasks'>('all');

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [chapterMembers, setChapterMembers] = useState<Array<{ id: string; full_name: string; role: string; chapter_role: string | null }>>([]);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  
  const [tasksPage, setTasksPage] = useState(1);
  const tasksPerPage = 6;

  // Docs state
  const [documents, setDocuments] = useState<ChapterDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadFormData, setUploadFormData] = useState({
    title: '',
    description: '',
    documentType: 'general' as 'chapter_document' | 'general',
    visibility: ['chapter_all'] as string[],
  });
  const [docsPage, setDocsPage] = useState(1);
  const docsPerPage = 6;
  const [selectedDocument, setSelectedDocument] = useState<ChapterDocument | null>(null);
  const [showDocDetailDrawer, setShowDocDetailDrawer] = useState(false);

  // Recruits state
  const [recruits, setRecruits] = useState<Recruit[]>([]);
  const [recruitsLoading, setRecruitsLoading] = useState(true);
  const [selectedStage, setSelectedStage] = useState<RecruitStage | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentRecruitIndex, setCurrentRecruitIndex] = useState(0);
  const [showRecruitDetail, setShowRecruitDetail] = useState(false);
  const [selectedRecruit, setSelectedRecruit] = useState<Recruit | null>(null);

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640); // sm breakpoint
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Load tasks and chapter members
  useEffect(() => {

    if (!chapterId || activeTab !== 'tasks') return;
    if (!profile?.id) {

      setTasksLoading(false);
      return;
    }

    loadAllData();
  }, [chapterId, profile?.id, activeTab]);

  // Load recruits
  useEffect(() => {
    if (!chapterId || activeTab !== 'recruits' || !recruitmentCrmEnabled) return;
    fetchRecruits();
  }, [chapterId, activeTab, recruitmentCrmEnabled, selectedStage, searchQuery]);

  // Load documents
  useEffect(() => {
    if (!chapterId || activeTab !== 'docs') return;
    loadDocuments();
  }, [chapterId, activeTab]);

  // Real-time subscription for task updates
  useEffect(() => {

    if (chapterId && activeTab === 'tasks') {
      const subscription = supabase
        .channel(`tasks-${chapterId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'tasks',
            filter: `chapter_id=eq.${chapterId}`
          },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              const newTask = payload.new as Task;
              // Only fetch assignee name if assignee_id exists
              if (newTask.assignee_id) {
                supabase
                  .from('profiles')
                  .select('full_name')
                  .eq('id', newTask.assignee_id)
                  .single()
                  .then(({ data }) => {
                    setTasks(prev => [{
                      ...newTask,
                      assignee_name: data?.full_name || 'Unassigned',
                      is_overdue: !!(newTask.due_date && newTask.status !== 'completed' && new Date(newTask.due_date) < new Date())
                    }, ...prev]);
                  });
              } else {
                // Task has no assignee
                setTasks(prev => [{
                  ...newTask,
                  assignee_name: 'Unassigned',
                  is_overdue: !!(newTask.due_date && newTask.status !== 'completed' && new Date(newTask.due_date) < new Date())
                }, ...prev]);
              }
            } else if (payload.eventType === 'UPDATE') {
              const updatedTask = payload.new as Task;
              // Only fetch assignee name if assignee_id exists
              if (updatedTask.assignee_id) {
                supabase
                  .from('profiles')
                  .select('full_name')
                  .eq('id', updatedTask.assignee_id)
                  .single()
                  .then(({ data }) => {
                    setTasks(prev => prev.map(task => 
                      task.id === updatedTask.id 
                        ? {
                            ...updatedTask,
                            assignee_name: data?.full_name || 'Unassigned',
                            is_overdue: !!(updatedTask.due_date && updatedTask.status !== 'completed' && new Date(updatedTask.due_date) < new Date())
                          }
                        : task
                    ));
                  });
              } else {
                // Task has no assignee
                setTasks(prev => prev.map(task => 
                  task.id === updatedTask.id 
                    ? {
                        ...updatedTask,
                        assignee_name: 'Unassigned',
                        is_overdue: !!(updatedTask.due_date && updatedTask.status !== 'completed' && new Date(updatedTask.due_date) < new Date())
                      }
                    : task
                ));
              }
            } else if (payload.eventType === 'DELETE') {
              const deletedTaskId = payload.old.id;
              setTasks(prev => prev.filter(task => task.id !== deletedTaskId));
            }
          }
        )
        .subscribe();

      return () => {
        subscription.unsubscribe();
      };
    }

  }, [chapterId, activeTab]);

  // Reset pages when switching tabs
  useEffect(() => {
    if (activeTab !== 'tasks') {
      setTasksPage(1);
    }
    if (activeTab !== 'docs') {
      setDocsPage(1);
    }
  }, [activeTab]);

  const loadAllData = async () => {
    try {
      
      setTasksLoading(true);
      
      const [allTasksData, membersData] = await Promise.all([
        supabase
          .from('tasks')
          .select(`
          *,
          assignee:profiles!tasks_assignee_id_fkey(full_name)
        `)
          .eq('chapter_id', chapterId!)
          .order('created_at', { ascending: false }), // Changed from due_date ascending

        getChapterMembersForTasks(chapterId!)
      ]);
      
      // Transform the data to include assignee_name and computed fields
      const transformedTasks = (allTasksData.data || []).map(task => {
        // Handle both array and object formats from Supabase join
        const assignee = Array.isArray(task.assignee) ? task.assignee[0] : task.assignee;
        
        return {
          ...task,
          assignee_name: assignee?.full_name || 'Unassigned',
          is_overdue: !!(task.due_date && task.status !== 'completed' && new Date(task.due_date) < new Date())
        };
      });
      
      setTasks(transformedTasks);
      setChapterMembers(membersData);
    } catch (error) {
      
      console.error('Error loading data:', error);
      setTasks([]);
      setChapterMembers([]);
    } finally {

      setTasksLoading(false);
    }
  };

  const fetchRecruits = async () => {
    if (!chapterId) return;
    
    try {
      setRecruitsLoading(true);
      
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      
      // Build query params
      const params = new URLSearchParams();
      params.append('chapter_id', chapterId);
      if (selectedStage !== 'all') {
        params.append('stage', selectedStage);
      }
      if (searchQuery) {
        params.append('search', searchQuery);
      }
      
      const response = await fetch(`/api/recruitment/recruits?${params.toString()}`, {
        headers,
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch recruits');
      }
      
      const data = await response.json();
      const recruitsList = Array.isArray(data) ? data : (data.data || []);
      
      // Exclude Accepted recruits from count
      const filteredRecruits = recruitsList.filter((r: Recruit) => r.stage !== 'Accepted');
      setRecruits(filteredRecruits);
      
      // Reset index if needed
      if (currentRecruitIndex >= filteredRecruits.length) {
        setCurrentRecruitIndex(Math.max(0, filteredRecruits.length - 1));
      }
    } catch (error) {
      console.error('Error fetching recruits:', error);
      toast.error('Failed to load recruits');
      setRecruits([]);
    } finally {
      setRecruitsLoading(false);
    }
  };

  const loadDocuments = async () => {
    try {
      setDocsLoading(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setDocuments([]);
        return;
      }

      const { data: dbProfile } = await supabase
        .from('profiles')
        .select('chapter_id, role')
        .eq('id', user.id)
        .single();

      if (!chapterId) {
        setDocuments([]);
      return;
    }

      if (!dbProfile) {
        setDocuments([]);
        return;
      }

      let visibilityFilter = ['chapter_all', 'active_members', 'alumni', 'admins'];
      if (dbProfile.role === 'active_member') {
        visibilityFilter = ['chapter_all', 'active_members'];
      } else if (dbProfile.role === 'alumni') {
        visibilityFilter = ['chapter_all', 'alumni'];
      }

      const { data: documents, error } = await supabase
        .from('documents')
        .select(`
          *,
          profiles!documents_owner_id_fkey(full_name)
        `)
        .eq('chapter_id', chapterId)
        .eq('is_active', true)
        .overlaps('visibility', visibilityFilter)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading documents:', error);
        setDocuments([]);
      } else {
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
      setDocsLoading(false);
    }
  };

  const handleCreateTask = async (taskData: CreateTaskRequest) => {
    if (!chapterId || !profile?.id) return;
    
    try {
      setCreating(true);
      
      if (Array.isArray(taskData.assignee_id)) {
        const tasks = await Promise.all(
        
          taskData.assignee_id.map((assigneeId) => {
            return supabase
              .from('tasks')
              .insert({
                ...taskData,
                assignee_id: assigneeId,
                chapter_id: chapterId,
                assigned_by: profile.id,
                status: 'pending'
              })
              .select()
              .single();
          })
        );
        
        const errors = tasks.filter(result => result.error);
        if (errors.length > 0) {
          throw new Error(`Failed to create some tasks: ${errors.map(e => e.error?.message).join(', ')}`);
        }
      } else {
        
        const { error } = await supabase
          .from('tasks')
          .insert({
            ...taskData,
            assignee_id: taskData.assignee_id as string,
            chapter_id: chapterId,
            assigned_by: profile.id,
            status: 'pending'
          })
          .select()
          .single();

        if (error) {
          throw new Error(`Failed to create task: ${error.message}`);
        }

      }

      setIsTaskModalOpen(false);
      await loadAllData();
      
      toast.success('Task created successfully!');
    } catch (error) {

      console.error('Error creating task:', error);
      toast.error('Failed to create task');
    } finally {
      setCreating(false);
    }
  };

  const handleReassign = async (taskId: string, newAssigneeId: string) => {
    try {
      await updateTask(taskId, { assignee_id: newAssigneeId });
    } catch (error) {
      console.error('Error reassigning task:', error);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId);

      if (error) throw error;
      setTasks(prev => prev.filter(task => task.id !== taskId));
      
      toast.success('Task deleted successfully!');
    } catch (error) {
      console.error('Error deleting task:', error);

      toast.error('Failed to delete task');
    }
  };

  const handleMarkComplete = async (taskId: string) => {
    try {
      await updateTask(taskId, { status: 'completed' as TaskStatus });
      
      // Update local state optimistically
      setTasks(prev => prev.map(task => 
        task.id === taskId 
          ? { ...task, status: 'completed' as TaskStatus, is_overdue: false }
          : task
      ));
      
      toast.success('Task marked as complete!');
      
      // Optionally reload to ensure consistency
      // await loadAllData();
    } catch (error) {
      console.error('Error marking task as complete:', error);
      toast.error('Failed to mark task as complete');
      // Reload on error to sync state
      await loadAllData();
    }
  };

  const handleUnassign = async (taskId: string) => {
    try {
      await updateTask(taskId, { assignee_id: null });
      toast.success('Task unassigned successfully!');
    } catch (error) {
      console.error('Error unassigning task:', error);
      toast.error('Failed to unassign task');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!uploadFormData.title) {
        setUploadFormData(prev => ({
          ...prev,
          title: file.name.replace(/\.[^/.]+$/, '')
        }));
      }
    }
  };

  const handleUploadDocument = async () => {
    if (!selectedFile || !chapterId) {
      toast.error('Please select a file to upload');
      return;
    }

    try {
      setUploading(true);
      
      const uploadData = {
        title: uploadFormData.title,
        description: uploadFormData.description,
        documentType: uploadFormData.documentType,
        visibility: uploadFormData.visibility,
        tags: [],
        effectiveDate: new Date().toISOString().split('T')[0],
        file: selectedFile
      };

      await documentUploadService.uploadDocument(uploadData);
      
      toast.success('Document uploaded successfully!');
      setShowUploadModal(false);
      setSelectedFile(null);
      setUploadFormData({
        title: '',
        description: '',
        documentType: 'general',
        visibility: ['chapter_all'],
      });
      await loadDocuments();
    } catch (error) {
      console.error('Error uploading document:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to upload document');
    } finally {
      setUploading(false);
    }
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

  const getStatusIcon = (status: TaskStatus) => {
    switch (status) {
      case 'completed': return <CheckSquare className="h-4 w-4 text-green-600" />;
      case 'pending': return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'in_progress': return <Clock className="h-4 w-4 text-brand-accent" />;
      case 'overdue': return <AlertCircle className="h-4 w-4 text-red-600" />;
      default: return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: TaskStatus) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';

      case 'overdue': return 'bg-red-100 text-red-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'in_progress': return 'bg-accent-100 text-accent-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority: TaskPriority) => {
    switch (priority) {

      case 'urgent': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'No due date';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const MAX_DESCRIPTION_LENGTH = 100; // Character limit before truncation

  const handleToggleDescription = (taskId: string) => {
    setExpandedTaskId(expandedTaskId === taskId ? null : taskId);
  };


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

  // Filter and paginate tasks
  const filteredTasks = useMemo(() => {
    if (activeFilter === 'all') return tasks;
    if (activeFilter === 'my_tasks') {
      return tasks.filter(t => t.assignee_id === profile?.id);
    }
    return tasks.filter(t => t.status === activeFilter);
  }, [tasks, activeFilter, profile?.id]);

  const paginatedTasks = useMemo(() => {
    const startIndex = (tasksPage - 1) * tasksPerPage;
    const endIndex = startIndex + tasksPerPage;
    return filteredTasks.slice(startIndex, endIndex);
  }, [filteredTasks, tasksPage, tasksPerPage]);

  const tasksTotalPages = Math.ceil(filteredTasks.length / tasksPerPage);
  const tasksTotal = filteredTasks.length;
  const tasksStartIndex = (tasksPage - 1) * tasksPerPage;
  const tasksEndIndex = Math.min(tasksPage * tasksPerPage, tasksTotal);
  const tasksStart = tasksStartIndex + 1;

  // Paginate documents
  const paginatedDocs = useMemo(() => {
    const startIndex = (docsPage - 1) * docsPerPage;
    const endIndex = startIndex + docsPerPage;
    return documents.slice(startIndex, endIndex);
  }, [documents, docsPage, docsPerPage]);

  const docsTotalPages = Math.ceil(documents.length / docsPerPage);
  const docsTotal = documents.length;
  const docsStartIndex = (docsPage - 1) * docsPerPage;
  const docsEndIndex = Math.min(docsPage * docsPerPage, docsTotal);
  const docsStart = docsStartIndex + 1;

  const filterButtons = [
    { id: 'all' as const, label: 'All', count: tasks.length },
    { id: 'pending' as const, label: 'Pending', count: tasks.filter(t => t.status === 'pending').length },
    { id: 'completed' as const, label: 'Completed', count: tasks.filter(t => t.status === 'completed').length },
    { id: 'my_tasks' as const, label: 'My Tasks', count: tasks.filter(t => t.assignee_id === profile?.id).length }
  ];

  if (!chapterId) {
    return (
      <div className="min-h-screen w-full max-w-none bg-gray-50 pt-4 pb-20 px-0">
        <div className="text-center py-8 text-gray-500">
          <CheckSquare className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="text-lg font-medium mb-2">No Chapter Access</p>
          <p className="text-sm">You need to be associated with a chapter to manage tasks.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full max-w-none bg-gray-50 pt-0 pb-20 px-0">
      {/* Full width of parent padded column (AdminOverview); no max-w-md gutter */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className={cn(
            "grid w-full mb-2 h-11 bg-transparent p-0 rounded-none border-b border-gray-200",
            recruitmentCrmEnabled ? "grid-cols-3" : "grid-cols-2"
          )}>
            <TabsTrigger value="tasks" className="text-sm font-medium rounded-none border-b-2 border-transparent data-[state=active]:border-brand-primary data-[state=active]:text-brand-primary data-[state=active]:shadow-none text-gray-500 data-[state=active]:bg-transparent bg-transparent">Tasks</TabsTrigger>
            <TabsTrigger value="docs" className="text-sm font-medium rounded-none border-b-2 border-transparent data-[state=active]:border-brand-primary data-[state=active]:text-brand-primary data-[state=active]:shadow-none text-gray-500 data-[state=active]:bg-transparent bg-transparent">Docs</TabsTrigger>
            {recruitmentCrmEnabled && (
              <TabsTrigger value="recruits" className="text-sm font-medium rounded-none border-b-2 border-transparent data-[state=active]:border-brand-primary data-[state=active]:text-brand-primary data-[state=active]:shadow-none text-gray-500 data-[state=active]:bg-transparent bg-transparent">Recruits</TabsTrigger>
            )}
          </TabsList>

          {/* Tasks Tab */}
          <TabsContent value="tasks" className="space-y-4">
        {/* Create Task Button */}
          <Button 

              onClick={() => setIsTaskModalOpen(true)}
              className="rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 w-full md:w-auto transition-all duration-300"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create New Task
          </Button>

        {/* Filter Buttons */}
        <div className="-mx-4 px-4">
          <div className="flex space-x-2 overflow-x-auto pb-2 scrollbar-hide">
            {filterButtons.map((filter) => {
              const isActive = activeFilter === filter.id;
              return (
                <button
                  key={filter.id}
                  onClick={() => setActiveFilter(filter.id)}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                    isActive 
                      ? 'bg-brand-accent text-white' 
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <span>{filter.label}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-accent-500 text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {filter.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tasks List */}

            {tasksLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-slate-600" />
              </div>
            ) : filteredTasks.length === 0 ? (
          <Card className="bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20">
            <CardContent className="p-8 text-center">
            <CheckSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-slate-700 text-lg mb-2">
              {activeFilter === 'all' ? 'No tasks found' : activeFilter === 'my_tasks' ? 'No tasks assigned to you' : `No ${activeFilter} tasks`}
            </p>
              <p className="text-slate-600 text-sm">
              {activeFilter === 'all' ? 'Create your first task to get started!' : 'Try a different filter'}
            </p>
            </CardContent>
          </Card>
        ) : (

              <>
                <div className="space-y-2">
                  {paginatedTasks.map((task) => (
                    <Card key={task.id} className="p-3 bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20 transition-all duration-300 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90">
                      <div className="space-y-2">
                        <div className="flex justify-between items-start">
                          <h3 className="font-medium text-slate-900 text-sm flex-1">{task.title}</h3>
                          <div className="flex space-x-2 ml-2">
                    <Badge className={getStatusColor(task.status)}>
                      {task.status}
                    </Badge>
                    <Badge className={getPriorityColor(task.priority)}>
                      {task.priority}
                    </Badge>
                  </div>
                </div>
                
                {task.description && (
                  <div className="mt-1">
                    <div className="text-xs text-slate-700">
                      {expandedTaskId === task.id || task.description.length <= MAX_DESCRIPTION_LENGTH ? (
                        <span>{task.description}</span>
                      ) : (
                        <span>
                          {task.description.substring(0, MAX_DESCRIPTION_LENGTH)}
                          <span className="text-gray-400">...</span>
                        </span>
                      )}
                    </div>
                    {task.description.length > MAX_DESCRIPTION_LENGTH && (
                      <button
                        onClick={() => handleToggleDescription(task.id)}
                        className="mt-1 text-xs text-brand-accent hover:text-accent-700 font-medium flex items-center space-x-1 transition-colors"
                      >
                        <span>{expandedTaskId === task.id ? 'Show less' : 'Show more'}</span>
                        {expandedTaskId === task.id ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                      </button>
                    )}
                  </div>
                )}
                

                <div className="space-y-1 text-xs text-slate-700">
                  <div className="flex items-center space-x-2">
                    <Users className="h-3 w-3" />
                    <span>{task.assignee_name || 'Unassigned'}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Calendar className="h-3 w-3" />
                    <span className={task.is_overdue ? 'text-red-600 font-medium' : ''}>
                      Due: {formatDate(task.due_date)}
                    </span>
                    {task.is_overdue && (
                      <AlertCircle className="h-3 w-3 text-red-600" />
                    )}
                  </div>
                </div>
                

                        <div className="flex space-x-2 pt-2 border-t border-gray-100">
                          {task.status !== 'completed' ? (
                            <Button
                              size="sm"
                              onClick={() => handleMarkComplete(task.id)}
                              className="h-7 px-3 text-xs flex-1 rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300"
                              variant="outline"
                            >
                              <Check className="h-3 w-3 mr-1" />
                              Mark Complete
                            </Button>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                onClick={() => handleUnassign(task.id)}
                                className="h-7 px-3 text-xs flex-1 rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300"
                                variant="outline"
                              >
                                <UserMinus className="h-3 w-3 mr-1" />
                                Unassign
                              </Button>
                    <Button
                      size="sm"
                      onClick={() => handleDeleteTask(task.id)}
                                className="h-7 px-3 text-xs flex-1 rounded-full bg-white/80 backdrop-blur-md border border-red-300 shadow-lg shadow-red-100/20 hover:shadow-xl hover:shadow-red-100/30 hover:bg-red-50/90 text-red-600 hover:text-red-700 hover:border-red-400 transition-all duration-300"
                                variant="outline"
                              >
                                <Trash2 className="h-3 w-3 mr-1" />
                                Delete
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>

                {/* Pagination Controls */}
                {tasksTotalPages > 1 && (
                  <div className="flex flex-col items-center space-y-3 pt-4 border-t border-gray-200 mt-4">
                    <div className="text-xs text-gray-600">
                      Showing {tasksStart} to {tasksEndIndex} of {tasksTotal} tasks
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setTasksPage(prev => Math.max(1, prev - 1))}
                        disabled={tasksPage === 1 || tasksLoading}
                        className="h-8 px-3 text-xs"
                      >
                        <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                        Previous
                      </Button>
                      <div className="flex items-center space-x-1 px-2">
                        <span className="text-xs text-gray-600">Page</span>
                        <span className="text-xs font-medium">{tasksPage}</span>
                        <span className="text-xs text-gray-600">of</span>
                        <span className="text-xs font-medium">{tasksTotalPages}</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setTasksPage(prev => Math.min(tasksTotalPages, prev + 1))}
                        disabled={tasksPage === tasksTotalPages || tasksLoading}
                        className="h-8 px-3 text-xs"
                      >
                        Next
                        <ChevronRight className="h-3.5 w-3.5 ml-1" />
                      </Button>
                    </div>
                    {tasksTotalPages <= 5 && (
                      <div className="flex items-center space-x-1">
                        {Array.from({ length: tasksTotalPages }, (_, i) => i + 1).map((page) => (
                          <Button
                            key={page}
                            variant={tasksPage === page ? "default" : "outline"}
                            size="sm"
                            onClick={() => setTasksPage(page)}
                            className={`h-8 w-8 p-0 text-xs ${
                              tasksPage === page
                                ? 'bg-brand-primary text-white hover:bg-brand-primary-hover'
                                : 'hover:bg-gray-50'
                            }`}
                            disabled={tasksLoading}
                          >
                            {page}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* Docs Tab */}
          <TabsContent value="docs" className="space-y-4">
            {/* Upload Button */}
            <Button 
              onClick={() => setShowUploadModal(true)}
              className="rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 w-full md:w-auto transition-all duration-300"
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload Document
            </Button>

            {/* Stats */}
            <Card className="bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20 transition-all duration-300 hover:shadow-xl hover:shadow-navy-100/30 hover:scale-[1.02] hover:bg-white/90">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-700 font-medium mb-1">Total Documents</p>
                    <p className="text-xl font-semibold text-slate-900">{documents.length}</p>
                  </div>
                  <FileText className="h-5 w-5 text-brand-primary" />
                </div>
              </CardContent>
            </Card>

            {/* Documents List */}
            {docsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-brand-primary" />
              </div>
            ) : documents.length === 0 ? (
              <Card className="bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20">
                <CardContent className="p-4 text-center">
                  <FileText className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-slate-700 mb-2">No documents found</p>
                  <Button 
                    variant="outline" 
                    onClick={() => setShowUploadModal(true)}
                    size="sm"
                    className="rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300"
                  >
                    Upload First Document
                    </Button>

                </CardContent>
              </Card>
            ) : (
              <>
                <div className="space-y-2">
                  {paginatedDocs.map((doc) => (
                    <Card
                      key={doc.id}
                      className="p-3 bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20 transition-all duration-300 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 cursor-pointer"
                      onClick={() => {
                        setSelectedDocument(doc);
                        setShowDocDetailDrawer(true);
                      }}
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-2 flex-1 min-w-0">
                            {getFileIcon(doc.file_type)}
                            <div className="flex-1 min-w-0">
                              <h3 className="font-medium text-sm truncate text-slate-900">{doc.title}</h3>
                              {doc.description && (
                                <p className="text-xs text-slate-700 mt-1 line-clamp-2">{doc.description}</p>
                  )}
                </div>
              </div>

                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2 text-xs text-slate-700">
                            {doc.file_size && (
                              <span>{getFileSize(doc.file_size)}</span>
                            )}
                            {doc.owner_name && (
                              <>
                                <span>•</span>
                                <span>{doc.owner_name}</span>
                              </>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation(); // Prevent card click
                              handleDownload(doc);
                            }}
                            className="h-7 px-2 text-brand-primary-hover hover:text-primary-900 hover:bg-primary-50"
                          >
                            <Download className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>

                {/* Pagination Controls */}
                {docsTotalPages > 1 && (
                  <div className="flex flex-col items-center space-y-3 pt-4 border-t border-gray-200 mt-4">
                    <div className="text-xs text-gray-600">
                      Showing {docsStart} to {docsEndIndex} of {docsTotal} documents
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDocsPage(prev => Math.max(1, prev - 1))}
                        disabled={docsPage === 1 || docsLoading}
                        className="h-8 px-3 text-xs"
                      >
                        <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                        Previous
                      </Button>
                      <div className="flex items-center space-x-1 px-2">
                        <span className="text-xs text-gray-600">Page</span>
                        <span className="text-xs font-medium">{docsPage}</span>
                        <span className="text-xs text-gray-600">of</span>
                        <span className="text-xs font-medium">{docsTotalPages}</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDocsPage(prev => Math.min(docsTotalPages, prev + 1))}
                        disabled={docsPage === docsTotalPages || docsLoading}
                        className="h-8 px-3 text-xs"
                      >
                        Next
                        <ChevronRight className="h-3.5 w-3.5 ml-1" />
                      </Button>
                    </div>
                    {docsTotalPages <= 5 && (
                      <div className="flex items-center space-x-1">
                        {Array.from({ length: docsTotalPages }, (_, i) => i + 1).map((page) => (
                          <Button
                            key={page}
                            variant={docsPage === page ? "default" : "outline"}
                            size="sm"
                            onClick={() => setDocsPage(page)}
                            className={`h-8 w-8 p-0 text-xs ${
                              docsPage === page
                                ? 'bg-brand-primary text-white hover:bg-brand-primary-hover'
                                : 'hover:bg-gray-50'
                            }`}
                            disabled={docsLoading}
                          >
                            {page}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Document Detail Drawer */}
                {selectedDocument && (
                  <DocumentDetailDrawer
                    doc={selectedDocument}
                    isOpen={showDocDetailDrawer}
                    onClose={() => {
                      setShowDocDetailDrawer(false);
                      setSelectedDocument(null);
                    }}
                    onDelete={(deletedId) => {
                      setDocuments(prev => prev.filter(d => d.id !== deletedId));
                      setShowDocDetailDrawer(false);
                      setSelectedDocument(null);
                    }}
                  />
                )}
              </>
            )}
          </TabsContent>

          {/* Recruits Tab */}
          {recruitmentCrmEnabled && (
            <TabsContent value="recruits" className="space-y-4">
              {/* Header Section */}
              <div className="space-y-3">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Search recruits..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-10"
                  />
                </div>

                {/* Stage Filter Chips */}
                <div className="flex space-x-2 overflow-x-auto pb-2 scrollbar-hide">
                  {(['all', 'New', 'Contacted', 'Event Invite', 'Bid Given', 'Declined'] as const).map((stage) => {
                    const count = stage === 'all' 
                      ? recruits.length 
                      : recruits.filter(r => r.stage === stage).length;
                    const isActive = selectedStage === stage;
                    
                    return (
                      <button
                        key={stage}
                        onClick={() => setSelectedStage(stage)}
                        className={cn(
                          "flex items-center space-x-2 px-3 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0",
                          isActive
                            ? 'bg-brand-accent text-white'
                            : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                        )}
                      >
                        <span>{stage === 'all' ? 'All' : stage}</span>
                        <span className={cn(
                          "text-xs px-1.5 py-0.5 rounded-full",
                          isActive ? 'bg-accent-500 text-white' : 'bg-gray-100 text-gray-600'
                        )}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Count Badge */}
                <div className="text-sm text-gray-600">
                  {recruits.length} {recruits.length === 1 ? 'recruit' : 'recruits'}
                </div>
              </div>

              {/* Swipeable Card Stack */}
              {recruitsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-brand-primary" />
                </div>
              ) : recruits.length === 0 ? (
                <Card className="bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20">
                  <CardContent className="p-8 text-center">
                    <UserPlus className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-slate-700 text-lg mb-2">No recruits found</p>
                    <p className="text-slate-600 text-sm">
                      {searchQuery || selectedStage !== 'all' 
                        ? 'Try adjusting your filters' 
                        : 'No recruits have been added yet'}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {/* Card Stack Container */}
                  <div className="relative w-full min-h-[400px] max-h-[450px]">
                    {/* Render 3 cards: previous, current, next */}
                    {[
                      recruits[currentRecruitIndex - 1],
                      recruits[currentRecruitIndex],
                      recruits[currentRecruitIndex + 1],
                    ].map((recruit, offset) => {
                      if (!recruit) return null;
                      const actualIndex = currentRecruitIndex + (offset - 1);
                      const isActive = offset === 1;
                      
                      return (
                        <RecruitCard
                          key={recruit.id}
                          recruit={recruit}
                          isActive={isActive}
                          onTap={() => {
                            setSelectedRecruit(recruit);
                            setShowRecruitDetail(true);
                          }}
                          onEdit={() => {
                            setSelectedRecruit(recruit);
                            setShowRecruitDetail(true);
                          }}
                          onSwipeLeft={() => {
                            if (currentRecruitIndex < recruits.length - 1) {
                              setCurrentRecruitIndex(prev => prev + 1);
                            }
                          }}
                          onSwipeRight={() => {
                            if (currentRecruitIndex > 0) {
                              setCurrentRecruitIndex(prev => prev - 1);
                            }
                          }}
                          index={actualIndex}
                          total={recruits.length}
                        />
                      );
                    })}
                  </div>

                  {/* Navigation Arrows - Fixed below card */}
                  <div className="flex items-center justify-center space-x-4">
                    <Button
                      variant="outline"
                      size="lg"
                      className="h-12 w-12 rounded-full border-gray-300 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => {
                        if (currentRecruitIndex > 0) {
                          setCurrentRecruitIndex(prev => prev - 1);
                        }
                      }}
                      disabled={currentRecruitIndex === 0}
                    >
                      <span>
                        <ChevronLeft className="h-6 w-6 text-slate-400" />
                      </span>
                    </Button>

                    {/* Dot Indicators - Windowed view to prevent overflow */}
                    <div className="flex items-center justify-center space-x-2 min-w-0 flex-1 max-w-[200px] px-2">
                      {(() => {
                        const maxVisibleDots = 9;
                        const halfWindow = Math.floor(maxVisibleDots / 2);
                        const totalRecruits = recruits.length;
                        
                        // Calculate start and end indices for the window
                        let startIdx = Math.max(0, currentRecruitIndex - halfWindow);
                        let endIdx = Math.min(totalRecruits, startIdx + maxVisibleDots);
                        
                        // Adjust start if we're near the end
                        if (endIdx - startIdx < maxVisibleDots) {
                          startIdx = Math.max(0, endIdx - maxVisibleDots);
                        }
                        
                        const visibleDots = [];
                        for (let i = startIdx; i < endIdx; i++) {
                          visibleDots.push(i);
                        }
                        
                        return visibleDots.map((idx) => (
                          <button
                            key={idx}
                            onClick={() => setCurrentRecruitIndex(idx)}
                            className={cn(
                              "h-2 rounded-full transition-all flex-shrink-0",
                              idx === currentRecruitIndex
                                ? "w-8 bg-brand-primary"
                                : "w-2 bg-gray-300"
                            )}
                          />
                        ));
                      })()}
                    </div>

                    <Button
                      variant="outline"
                      size="lg"
                      className="h-12 w-12 rounded-full border-gray-300 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => {
                        if (currentRecruitIndex < recruits.length - 1) {
                          setCurrentRecruitIndex(prev => prev + 1);
                        }
                      }}
                      disabled={currentRecruitIndex === recruits.length - 1}
                    >
                      
                      <span>
                        <ChevronRight className="h-6 w-6 text-slate-400" />
                      </span>
                    </Button>
                  </div>
                </div>
              )}

              {/* Recruit Detail Sheet */}
              {selectedRecruit && (
                <RecruitDetailSheet
                  recruit={selectedRecruit}
                  isOpen={showRecruitDetail}
                  onClose={() => {
                    setShowRecruitDetail(false);
                    setSelectedRecruit(null);
                  }}
                  onUpdate={(updatedRecruit) => {
                    setRecruits(prev => 
                      prev.map(r => r.id === updatedRecruit.id ? updatedRecruit : r)
                    );
                    setSelectedRecruit(updatedRecruit);
                  }}
                  onDelete={(deletedId) => {
                    setRecruits(prev => prev.filter(r => r.id !== deletedId));
                    setShowRecruitDetail(false);
                    setSelectedRecruit(null);
                    if (currentRecruitIndex >= recruits.length - 1) {
                      setCurrentRecruitIndex(Math.max(0, recruits.length - 2));
                    }
                  }}
                />
              )}
            </TabsContent>
          )}
        </Tabs>

        {/* Task Modal */}
        <TaskModal

          isOpen={isTaskModalOpen}
          onClose={() => setIsTaskModalOpen(false)}
          onSubmit={handleCreateTask}
          chapterMembers={chapterMembers}
          creating={creating}
        />


        {/* Upload Document Modal - Mobile: Bottom drawer, Desktop: Centered */}
        {showUploadModal && (
          <div className={cn(
            "fixed inset-0 z-[9999]",
            isMobile
              ? "flex items-end justify-center p-0"
              : "flex items-center justify-center p-4"
          )}>
            {/* Backdrop */}
            <div 
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => {
                setShowUploadModal(false);
                setSelectedFile(null);
                setUploadFormData({
                  title: '',
                  description: '',
                  documentType: 'general',
                  visibility: ['chapter_all'],
                });
              }}
            />
            
            {/* Modal - Mobile: Bottom drawer, Desktop: Centered */}
            <div className={cn(
              "relative bg-white shadow-xl w-full flex flex-col",
              // Mobile: Bottom drawer with iOS 16+ fixes
              isMobile
                ? "max-h-[85dvh] mt-[15dvh] rounded-t-2xl rounded-b-none pb-[env(safe-area-inset-bottom)]"
                // Desktop: Centered modal (existing style)
                : "max-w-md rounded-lg"
            )}>
              {/* Header */}
              <div className={cn(
                "flex-shrink-0 border-b border-gray-200",
                isMobile ? "p-4" : "p-6"
              )}>
                <h3 className={cn(
                  "font-semibold",
                  isMobile ? "text-lg" : "text-lg"
                )}>
                  Upload Document
                </h3>
              </div>

              {/* Scrollable Content Area */}
              <div className={cn(
                "flex-1 overflow-y-auto",
                isMobile ? "p-4" : "p-6"
              )}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">File</label>
                    <input
                      type="file"
                      onChange={handleFileSelect}
                      className="w-full text-sm"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.txt"
                    />
                    {selectedFile && (
                      <p className="text-xs text-gray-600 mt-1">{selectedFile.name}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Title</label>
                    <input
                      type="text"
                      value={uploadFormData.title}
                      onChange={(e) => setUploadFormData(prev => ({ ...prev, title: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                      placeholder="Document title"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Description</label>
                    <textarea
                      value={uploadFormData.description}
                      onChange={(e) => setUploadFormData(prev => ({ ...prev, description: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                      placeholder="Optional description"
                      rows={3}
                    />
                  </div>
                </div>
              </div>

              {/* Footer - with iOS safe-area padding */}
              <div className={cn(
                "flex space-x-2 flex-shrink-0 border-t border-gray-200",
                isMobile 
                  ? "p-4 pb-[calc(12px+env(safe-area-inset-bottom))]"
                  : "p-6"
              )}>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowUploadModal(false);
                    setSelectedFile(null);
                    setUploadFormData({
                      title: '',
                      description: '',
                      documentType: 'general',
                      visibility: ['chapter_all'],
                    });
                  }}
                  className="flex-1 rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleUploadDocument}
                  disabled={!selectedFile || !uploadFormData.title || uploading}
                  className="flex-1 rounded-full bg-brand-primary text-white hover:bg-brand-primary-hover shadow-lg shadow-navy-100/20 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}

