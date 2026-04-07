'use client';

import { useState, useEffect, useMemo } from 'react';
import { Users, DollarSign, TrendingUp, Plus, Search, Eye, Edit, Trash2, Calendar, AlertCircle, CheckCircle, Clock, UserCheck, Settings, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { useProfileModal } from '@/lib/contexts/ProfileModalContext';
import { useAuth } from '@/lib/supabase/auth-context';
import { useChapterBudget } from '@/lib/hooks/useChapterBudget';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EditUserModal } from '@/components/user-management/EditUserModal';
import { DeleteUserModal } from '@/components/user-management/DeleteUserModal';
import { AddMemberForm } from '@/components/chapter/AddMemberForm';
import { execColumns } from '@/components/user-management/columns';
import { createPortal } from 'react-dom';
import { toast } from 'react-toastify';
import { supabase } from '@/lib/supabase/client';
import { useEvents } from '@/lib/hooks/useEvents';
import { useFeatureFlag } from '@/lib/hooks/useFeatureFlag';
import { useSearchParams } from 'next/navigation';
import { useScopedChapterId } from '@/lib/hooks/useScopedChapterId';

interface User {
  id: string;
  email: string;
  full_name: string;
  first_name?: string | null;
  last_name?: string | null;
  role: string | null;
  chapter_role: string | null;
  member_status: string | null;
  chapter?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface DuesCycle {
  id: string;
  name: string;
  base_amount: number;
  due_date: string;
  status: string;
}

interface DuesAssignment {
  id: string;
  user: {
    id: string;
    full_name: string;
    email: string;
    member_status: string;
  };
  status: 'required' | 'exempt' | 'reduced' | 'waived' | 'paid';
  amount_assessed: number;
  amount_due: number;
  amount_paid: number;
  cycle: {
    name: string;
    due_date: string;
  };
}

export function MobileOperationsPage() {
  const { profile } = useProfile();
  const { openUserProfile } = useProfileModal();
  const { session, getAuthHeaders } = useAuth();
  const chapterId = useScopedChapterId();
  const { enabled: financialToolsEnabled } = useFeatureFlag('financial_tools_enabled');
  const { enabled: eventsManagementEnabled } = useFeatureFlag('events_management_enabled');
  const searchParams = useSearchParams();
  
  // Read tab from URL parameter, default to 'members'
  const urlTab = searchParams.get('tab');
  const initialTab = (urlTab === 'members' || urlTab === 'dues' || urlTab === 'budget') 
    ? urlTab 
    : 'members';
  
  const [activeTab, setActiveTab] = useState<'members' | 'dues' | 'budget'>(initialTab);
  
  // Update tab when URL parameter changes
  useEffect(() => {
    const urlTab = searchParams.get('tab');
    if (urlTab === 'members' || urlTab === 'dues' || urlTab === 'budget') {
      setActiveTab(urlTab);
    }
  }, [searchParams]);
  
  // Members state
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const membersPerPage = 6;
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<User | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  
  // Dues state
  const [cycles, setCycles] = useState<DuesCycle[]>([]);
  const [assignments, setAssignments] = useState<DuesAssignment[]>([]);
  const [duesLoading, setDuesLoading] = useState(true);
  
  // Budget state
  const { events, loading: eventsLoading } = useEvents({ 
    chapterId: chapterId || '', 
    scope: 'all' 
  });
  const { startingBudget } = useChapterBudget();
  const [budgetEventsPage, setBudgetEventsPage] = useState(1);
  const budgetEventsPerPage = 6;

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(searchTerm.trim()), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchDebounced]);

  // Load members
  useEffect(() => {
    if (chapterId && activeTab === 'members' && session) {
      fetchUsers();
    }
  }, [chapterId, activeTab, searchDebounced, session]);

  // Load dues
  useEffect(() => {
    if (chapterId && activeTab === 'dues') {
      loadDuesData();
    }
  }, [chapterId, activeTab]);

  // Reset budget events page when switching tabs
  useEffect(() => {
    if (activeTab !== 'budget') {
      setBudgetEventsPage(1);
    }
  }, [activeTab]);

  // Redirect to members tab if Dues tab is selected but financial tools are disabled.
  // Budget remains available as a high-level planning tool even when financial tools are off.
  useEffect(() => {
    if (!financialToolsEnabled && activeTab === 'dues') {
      setActiveTab('members');
    }
  }, [activeTab, financialToolsEnabled]);

  const fetchUsers = async () => {
    if (!chapterId || !session) return;
    
    try {
      setMembersLoading(true);
      const q = searchDebounced ? `&q=${encodeURIComponent(searchDebounced)}` : '';
      const headers = getAuthHeaders();
      
      const response = await fetch(`/api/developer/users?page=1&limit=1000&chapterId=${encodeURIComponent(chapterId)}${q}`, {
        headers,
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }

      const data = await response.json();
      const fetchedUsers = data.users || [];
      
      const filteredUsers = fetchedUsers.filter((user: User) => 
        user.role === 'active_member' || user.role === 'admin'
      );

      setAllUsers(filteredUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
      setAllUsers([]);
    } finally {
      setMembersLoading(false);
    }
  };

  const loadDuesData = async () => {
    if (!chapterId) return;
    
    try {
      setDuesLoading(true);
      
      const { data: cyclesData } = await supabase
        .from('dues_cycles')
        .select('*')
        .eq('chapter_id', chapterId)
        .order('created_at', { ascending: false });

      setCycles(cyclesData || []);

      const { data: assignmentsData } = await supabase
        .from('dues_assignments')
        .select(`
          *,
          user:profiles!dues_assignments_user_id_fkey(
            id,
            full_name,
            email,
            member_status
          ),
          cycle:dues_cycles!dues_assignments_dues_cycle_id_fkey(
            name,
            due_date
          )
        `)
        .eq('cycle.chapter_id', chapterId);

      setAssignments(assignmentsData || []);
    } catch (error) {
      console.error('Error loading dues data:', error);
    } finally {
      setDuesLoading(false);
    }
  };

  // Budget calculations
  const budgetData = useMemo(() => {
    if (!events || events.length === 0) {
      return {
        totalAllocated: 0,
        totalSpent: 0,
        remaining: 0,
        eventsWithBudget: 0,
        startingBudget: startingBudget
      };
    }

    const eventsWithBudget = events.filter(event => 
      event.budget_amount && parseFloat(String(event.budget_amount)) > 0
    );

    const totalAllocated = eventsWithBudget.reduce((sum, event) => 
      sum + parseFloat(String(event.budget_amount || '0')), 0
    );

    const remaining = startingBudget - totalAllocated;

    return {
      totalAllocated,
      totalSpent: totalAllocated, // MVP: spent = allocated
      remaining,
      eventsWithBudget: eventsWithBudget.length,
      startingBudget: startingBudget
    };
  }, [events, startingBudget]);

  // Dues statistics
  const duesStats = useMemo(() => {
    const total = assignments.length;
    const paid = assignments.filter(a => a.status === 'paid').length;
    const required = assignments.filter(a => a.status === 'required').length;
    const totalDue = assignments.reduce((sum, a) => sum + a.amount_due, 0);
    const totalPaid = assignments.reduce((sum, a) => sum + a.amount_paid, 0);
    
    return {
      total,
      paid,
      required,
      totalDue,
      totalPaid,
      collectionRate: total > 0 ? Math.round((paid / total) * 100) : 0
    };
  }, [assignments]);

  // Modal handlers
  const openEditModal = (user: User) => {
    setUserToEdit(user);
    setEditModalOpen(true);
  };

  const openDeleteModal = (user: User) => {
    setUserToDelete(user);
    setDeleteModalOpen(true);
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    try {
      const response = await fetch(`/api/developer/users?userId=${userToDelete.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete user');
      }

      setAllUsers(prevUsers => prevUsers.filter(user => user.id !== userToDelete.id));
      setDeleteModalOpen(false);
      toast.success(`User "${userToDelete.email}" has been deleted successfully.`);
      await fetchUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      toast.error(`Failed to delete user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Filter users based on search (already filtered by API, but keeping for client-side filtering if needed)
  const filteredUsers = useMemo(() => {
    return allUsers;
  }, [allUsers]);

  // Paginate filtered users
  const paginatedUsers = useMemo(() => {
    const startIndex = (currentPage - 1) * membersPerPage;
    const endIndex = startIndex + membersPerPage;
    return filteredUsers.slice(startIndex, endIndex);
  }, [filteredUsers, currentPage, membersPerPage]);

  // Calculate pagination info
  const totalPages = Math.ceil(filteredUsers.length / membersPerPage);
  const totalUsers = filteredUsers.length;
  const startIndex = (currentPage - 1) * membersPerPage;
  const endIndex = Math.min(currentPage * membersPerPage, totalUsers);

  return (
    <div className="min-h-screen w-full max-w-none bg-gray-50 pt-0 pb-20 px-0">
      {/* Full width of parent padded column (AdminOverview); no max-w-md gutter */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className={`grid w-full mb-2 h-11 bg-transparent p-0 rounded-none border-b border-gray-200 ${financialToolsEnabled ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <TabsTrigger value="members" className="text-sm font-medium rounded-none border-b-2 border-transparent data-[state=active]:border-brand-primary data-[state=active]:text-brand-primary data-[state=active]:shadow-none text-gray-500 data-[state=active]:bg-transparent bg-transparent">Members</TabsTrigger>
            {/* Budget is always available for chapter-level planning */}
            <TabsTrigger value="budget" className="text-sm font-medium rounded-none border-b-2 border-transparent data-[state=active]:border-brand-primary data-[state=active]:text-brand-primary data-[state=active]:shadow-none text-gray-500 data-[state=active]:bg-transparent bg-transparent">Budget</TabsTrigger>
            {/* Dues remains gated behind financial tools */}
            {financialToolsEnabled && (
              <TabsTrigger value="dues" className="text-sm font-medium rounded-none border-b-2 border-transparent data-[state=active]:border-brand-primary data-[state=active]:text-brand-primary data-[state=active]:shadow-none text-gray-500 data-[state=active]:bg-transparent bg-transparent">Dues</TabsTrigger>
            )}
          </TabsList>

          {/* Members Tab */}
          <TabsContent value="members" className="space-y-4">
            {/* Search and Add */}
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search members..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button 
                onClick={() => setShowAddMemberModal(true)}
                className="rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 w-full md:w-auto transition-all duration-300"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Member
              </Button>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3">
              <Card className="bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20 transition-all duration-300 hover:shadow-xl hover:shadow-navy-100/30 hover:scale-[1.02] hover:bg-white/90">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-700 font-medium mb-1">Total Members</p>
                      <p className="text-xl font-semibold text-slate-900">{filteredUsers.length}</p>
                    </div>
                    <Users className="h-5 w-5 text-brand-primary" />
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20 transition-all duration-300 hover:shadow-xl hover:shadow-navy-100/30 hover:scale-[1.02] hover:bg-white/90">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-700 font-medium mb-1">Active</p>
                      <p className="text-xl font-semibold text-slate-900">
                        {filteredUsers.filter(u => u.member_status === 'active').length}
                      </p>
                    </div>
                    <CheckCircle className="h-5 w-5 text-brand-primary" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Members List */}
            {membersLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-brand-primary" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <Card className="bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20">
                <CardContent className="p-8 text-center">
                  <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-slate-700">No members found</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="space-y-2">
                  {paginatedUsers.map((user) => (
                    <Card key={user.id} className="p-3 bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20 transition-all duration-300 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-sm truncate text-slate-900">{user.full_name}</h3>
                          <p className="text-xs text-slate-700 truncate">{user.email}</p>
                          <div className="flex items-center space-x-2 mt-1">
                            {user.role && (
                              <Badge variant="secondary" className="text-xs border-primary-200 text-brand-primary-hover">
                                {user.role}
                              </Badge>
                            )}
                            {user.chapter_role && (
                              <Badge variant="outline" className="text-xs border-primary-200 text-brand-primary-hover">
                                {user.chapter_role}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-1 ml-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openUserProfile(user.id)}
                            className="h-8 w-8 p-0 text-brand-primary-hover hover:text-primary-900 hover:bg-primary-50"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEditModal(user)}
                            className="h-8 w-8 p-0 text-brand-primary-hover hover:text-primary-900 hover:bg-primary-50"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openDeleteModal(user)}
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex flex-col items-center space-y-3 pt-4 border-t border-gray-200">
                    <div className="text-xs text-gray-600">
                      Showing {startIndex + 1} to {endIndex} of {totalUsers} members
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1 || membersLoading}
                        className="h-8 px-3 text-xs rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                        Previous
                      </Button>
                      <div className="flex items-center space-x-1 px-2">
                        <span className="text-xs text-gray-600">Page</span>
                        <span className="text-xs font-medium">{currentPage}</span>
                        <span className="text-xs text-gray-600">of</span>
                        <span className="text-xs font-medium">{totalPages}</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages || membersLoading}
                        className="h-8 px-3 text-xs rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                        <ChevronRight className="h-3.5 w-3.5 ml-1" />
                      </Button>
                    </div>
                    {/* Page Number Buttons - Show up to 5 pages */}
                    {totalPages <= 5 && (
                      <div className="flex items-center space-x-1">
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                          <Button
                            key={page}
                            variant={currentPage === page ? "default" : "outline"}
                            size="sm"
                            onClick={() => setCurrentPage(page)}
                            className={`h-8 w-8 p-0 text-xs rounded-full transition-all duration-300 ${
                              currentPage === page
                                ? 'bg-brand-primary text-white hover:bg-brand-primary-hover shadow-lg shadow-navy-100/20'
                                : 'bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900'
                            }`}
                            disabled={membersLoading}
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

          {/* Dues Tab (still gated behind financial tools) */}
          {financialToolsEnabled && (
            <TabsContent value="dues" className="space-y-4">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-3">
                <Card className="bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20 transition-all duration-300 hover:shadow-xl hover:shadow-navy-100/30 hover:scale-[1.02] hover:bg-white/90">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-slate-700 font-medium mb-1">Total Due</p>
                        <p className="text-lg font-semibold text-slate-900">${duesStats.totalDue.toLocaleString()}</p>
                      </div>
                      <DollarSign className="h-5 w-5 text-brand-primary" />
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20 transition-all duration-300 hover:shadow-xl hover:shadow-navy-100/30 hover:scale-[1.02] hover:bg-white/90">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-slate-700 font-medium mb-1">Paid</p>
                        <p className="text-lg font-semibold text-slate-900">${duesStats.totalPaid.toLocaleString()}</p>
                      </div>
                      <CheckCircle className="h-5 w-5 text-brand-primary" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Collection Rate */}
              <Card className="bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20 transition-all duration-300 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90">
                <CardContent className="p-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-700">Collection Rate</span>
                      <span className="font-semibold text-slate-900">{duesStats.collectionRate}%</span>
                    </div>
                    <Progress value={duesStats.collectionRate} className="h-2" />
                  </div>
                </CardContent>
              </Card>

              {/* Cycles */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Dues Cycles</h3>
                {duesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-brand-primary" />
                  </div>
                ) : cycles.length === 0 ? (
                  <Card className="bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20">
                    <CardContent className="p-4 text-center">
                      <p className="text-sm text-slate-700">No dues cycles found</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {cycles.map((cycle) => (
                      <Card key={cycle.id} className="p-3 bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20 transition-all duration-300 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-medium text-sm text-slate-900">{cycle.name}</h4>
                            <p className="text-xs text-slate-700">
                              ${cycle.base_amount.toLocaleString()} • Due {new Date(cycle.due_date).toLocaleDateString()}
                            </p>
                          </div>
                          <Badge className={cycle.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                            {cycle.status}
                          </Badge>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Assignments */}
              <div>
                <h3 className="text-sm font-semibold mb-2 text-slate-900">Recent Assignments</h3>
                {assignments.length === 0 ? (
                  <Card className="bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20">
                    <CardContent className="p-4 text-center">
                      <p className="text-sm text-slate-700">No assignments found</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {assignments.slice(0, 5).map((assignment) => (
                      <Card key={assignment.id} className="p-3 bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20 transition-all duration-300 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-sm truncate text-slate-900">{assignment.user.full_name}</h4>
                            <p className="text-xs text-slate-700">
                              ${assignment.amount_due.toLocaleString()} • {assignment.cycle.name}
                            </p>
                          </div>
                          <Badge className={
                            assignment.status === 'paid' ? 'bg-green-100 text-green-800' :
                            assignment.status === 'required' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          }>
                            {assignment.status}
                          </Badge>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          )}

          {/* Budget Tab (always available) */}
          <TabsContent value="budget" className="space-y-4">
              {/* Budget Overview Cards */}
              <div className="grid grid-cols-2 gap-3">
                <Card className="bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20 transition-all duration-300 hover:shadow-xl hover:shadow-navy-100/30 hover:scale-[1.02] hover:bg-white/90">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-slate-700 font-medium mb-1">Allocated</p>
                        <p className="text-lg font-semibold text-slate-900">${budgetData.totalAllocated.toLocaleString()}</p>
                      </div>
                      <TrendingUp className="h-5 w-5 text-brand-primary" />
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20 transition-all duration-300 hover:shadow-xl hover:shadow-navy-100/30 hover:scale-[1.02] hover:bg-white/90">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-slate-700 font-medium mb-1">Remaining</p>
                        <p className={`text-lg font-semibold ${budgetData.remaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ${budgetData.remaining.toLocaleString()}
                        </p>
                      </div>
                      <DollarSign className="h-5 w-5 text-brand-primary" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Budget Progress */}
              <Card className="bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20 transition-all duration-300 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90">
                <CardHeader className="pb-3 flex-shrink-0 border-b border-primary-100/30">
                  <CardTitle className="text-sm text-slate-900 font-semibold">Budget Overview</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-700">Starting Budget</span>
                    <span className="font-semibold text-sm text-slate-900">${budgetData.startingBudget.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-700">Total Allocated</span>
                    <span className="font-semibold text-sm text-orange-600">${budgetData.totalAllocated.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-700">Remaining</span>
                    <span className={`font-semibold text-sm ${budgetData.remaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ${budgetData.remaining.toLocaleString()}
                    </span>
                  </div>
                  <Progress 
                    value={(budgetData.totalAllocated / budgetData.startingBudget) * 100} 
                    className="h-2"
                  />
                  <p className="text-xs text-slate-600 text-center">
                    {((budgetData.totalAllocated / budgetData.startingBudget) * 100).toFixed(1)}% allocated
                  </p>
                </CardContent>
              </Card>

              {/* Events with Budget */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Events with Budget ({budgetData.eventsWithBudget})</h3>
                {eventsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-brand-primary" />
                  </div>
                ) : (() => {
                  const eventsWithBudget = events.filter(e => e.budget_amount && parseFloat(String(e.budget_amount)) > 0);
                  const budgetEventsTotalPages = Math.ceil(eventsWithBudget.length / budgetEventsPerPage);
                  const budgetEventsStartIndex = (budgetEventsPage - 1) * budgetEventsPerPage;
                  const budgetEventsEndIndex = budgetEventsStartIndex + budgetEventsPerPage;
                  const paginatedBudgetEvents = eventsWithBudget.slice(budgetEventsStartIndex, budgetEventsEndIndex);
                  const budgetEventsTotal = eventsWithBudget.length;
                  const budgetEventsStart = budgetEventsStartIndex + 1;
                  const budgetEventsEnd = Math.min(budgetEventsPage * budgetEventsPerPage, budgetEventsTotal);

                  return eventsWithBudget.length === 0 ? (
                    <Card className="bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20">
                      <CardContent className="p-4 text-center">
                        <p className="text-sm text-slate-700">No events with budgets</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <>
                      <div className="space-y-2">
                        {paginatedBudgetEvents.map((event) => (
                          <Card key={event.id} className="p-3 bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20 transition-all duration-300 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90">
                            <div className="flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-sm truncate text-slate-900">{event.title}</h4>
                                <p className="text-xs text-slate-700">
                                  {event.start_time
                                    ? new Date(event.start_time).toLocaleDateString()
                                    : 'Time TBD'}
                                </p>
                              </div>
                              <div className="text-right ml-2">
                                <p className="font-semibold text-sm text-green-600">
                                  ${parseFloat(String(event.budget_amount)).toLocaleString()}
                                </p>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>

                      {/* Pagination Controls */}
                      {budgetEventsTotalPages > 1 && (
                        <div className="flex flex-col items-center space-y-3 pt-4 border-t border-gray-200 mt-4">
                          <div className="text-xs text-gray-600">
                            Showing {budgetEventsStart} to {budgetEventsEnd} of {budgetEventsTotal} events
                          </div>
                          <div className="flex items-center space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setBudgetEventsPage(prev => Math.max(1, prev - 1))}
                              disabled={budgetEventsPage === 1 || eventsLoading}
                              className="h-8 px-3 text-xs rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                              Previous
                            </Button>
                            <div className="flex items-center space-x-1 px-2">
                              <span className="text-xs text-gray-600">Page</span>
                              <span className="text-xs font-medium">{budgetEventsPage}</span>
                              <span className="text-xs text-gray-600">of</span>
                              <span className="text-xs font-medium">{budgetEventsTotalPages}</span>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setBudgetEventsPage(prev => Math.min(budgetEventsTotalPages, prev + 1))}
                              disabled={budgetEventsPage === budgetEventsTotalPages || eventsLoading}
                              className="h-8 px-3 text-xs rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Next
                              <ChevronRight className="h-3.5 w-3.5 ml-1" />
                            </Button>
                          </div>
                          {/* Page Number Buttons - Show up to 5 pages */}
                          {budgetEventsTotalPages <= 5 && (
                            <div className="flex items-center space-x-1">
                              {Array.from({ length: budgetEventsTotalPages }, (_, i) => i + 1).map((page) => (
                                <Button
                                  key={page}
                                  variant={budgetEventsPage === page ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => setBudgetEventsPage(page)}
                                  className={`h-8 w-8 p-0 text-xs rounded-full transition-all duration-300 ${
                                    budgetEventsPage === page
                                      ? 'bg-brand-primary text-white hover:bg-brand-primary-hover shadow-lg shadow-navy-100/20'
                                      : 'bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900'
                                  }`}
                                  disabled={eventsLoading}
                                >
                                  {page}
                                </Button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </TabsContent>
        </Tabs>

        {/* Modals */}
        {showAddMemberModal && (
          <AddMemberForm
            onClose={() => setShowAddMemberModal(false)}
            onSuccess={() => {
              setShowAddMemberModal(false);
              fetchUsers();
            }}
            chapterContext={{
              chapterId: chapterId || '',
              chapterName: profile?.chapter || '',
              isChapterAdmin: true
            }}
          />
        )}

        {editModalOpen && typeof window !== 'undefined' && (
          <EditUserModal
            isOpen={editModalOpen}
            onClose={() => setEditModalOpen(false)}
            user={userToEdit}
            onSaved={() => {
              fetchUsers();
              setEditModalOpen(false);
            }}
          />
        )}

        {deleteModalOpen && typeof window !== 'undefined' && userToDelete && createPortal(
          <DeleteUserModal
            isOpen={deleteModalOpen}
            onClose={() => setDeleteModalOpen(false)}
            onConfirm={handleDeleteUser}
            user={{
              email: userToDelete.email,
              full_name: userToDelete.full_name,
              role: userToDelete.role,
              chapter: userToDelete.chapter || null
            }}
            isDeleting={false}
          />,
          document.body
        )}
    </div>
  );
}

