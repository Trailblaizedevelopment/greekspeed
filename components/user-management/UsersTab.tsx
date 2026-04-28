'use client';
import { UsersTable } from './UsersTable';
import { execColumns, buildDeveloperColumns } from './columns';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Users, Plus, Search, Edit, Trash2, Eye } from 'lucide-react';
import { CreateUserForm } from './CreateUserForm';
import { DeleteUserModal } from './DeleteUserModal';
import { getRoleDisplayName } from '@/lib/permissions';
import { EditUserModal } from './EditUserModal';
import { Select, SelectItem } from '@/components/ui/select';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { useProfileModal } from '@/lib/contexts/ProfileModalContext';
import { useAuth } from '@/lib/supabase/auth-context';

interface User {
  id: string;
  email: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  chapter: string | null;
  role: string | null;
  created_at: string;
  updated_at: string;
  bio: string | null;
  phone: string | null;
  location: string | null;
  avatar_url: string | null;
  chapter_role: string | null;
  member_status: string | null;
  pledge_class: string | null;
  grad_year: number | null;
  major: string | null;
  minor: string | null;
  hometown: string | null;
  gpa: number | null;
  chapter_id: string | null;
  is_developer: boolean;
  developer_permissions: string[];
  access_level: string | null;
}

export function UsersTab({
  chapterId,
  chapterContext,
}: {
  chapterId?: string;
  chapterContext?: { chapterId: string; chapterName: string; isChapterAdmin?: boolean };
} = {}) {
  const { isDeveloper } = useProfile();
  const { openUserProfile } = useProfileModal();
  const { session, getAuthHeaders } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<User | null>(null);
  
  // Add pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [searchDebounced, setSearchDebounced] = useState('');
  const [pageSize] = useState(25); // Show 100 users per page

  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'active_member' | 'alumni' | 'governance'>('all');

  useEffect(() => { setCurrentPage(1); }, [roleFilter]);
  
  useEffect(() => {
    if (session) fetchUsers();
  }, [currentPage, searchDebounced, roleFilter, session]);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(searchTerm.trim()), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    // when search term changes, go back to first page
    setCurrentPage(1);
  },[searchDebounced]);

  const fetchUsers = async () => {
    if (!session) return;
    try {
      setLoading(true);
      const q = searchDebounced ? `&q=${encodeURIComponent(searchDebounced)}` : '';
      const role = roleFilter !== 'all' ? `&role=${encodeURIComponent(roleFilter)}` : '';
      const url = `/api/developer/users?page=${currentPage}&limit=${pageSize}${chapterId ? `&chapterId=${encodeURIComponent(chapterId)}` : ''}${q}${role}`;
      const response = await fetch(url, {
        headers: getAuthHeaders(),
      });
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Failed to fetch users (${response.status}): ${err}`);
      }
      const data = await response.json();
      setUsers(data.users || []);
      setTotalUsers(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const openDeleteModal = (user: User) => {
    setUserToDelete(user);
    setDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    setDeleteModalOpen(false);
    setUserToDelete(null);
  };

  const openEditModal = (user: User) => {
    setUserToEdit(user);
    setEditModalOpen(true);
  };

  const closeEditModal = () => {
    setEditModalOpen(false);
    setUserToEdit(null);
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    try {
      setDeletingUserId(userToDelete.id);
      
      const response = await fetch(`/api/developer/users?userId=${userToDelete.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete user');
      }

      const result = await response.json();
      // User deleted successfully
      
      // Remove the user from the local state
      setUsers(prevUsers => prevUsers.filter(user => user.id !== userToDelete.id));
      
      // Close modal and show success message
      closeDeleteModal();
      
      // Show success message (you could replace this with a toast notification)
      alert(`User "${userToDelete.email}" has been deleted successfully.`);
      
    } catch (error) {
      console.error('Error deleting user:', error);
      alert(`Failed to delete user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setDeletingUserId(null);
    }
  };

  const filteredUsers = users;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getRoleBadgeVariant = (role: string | null) => {
    switch (role) {
      case 'admin': return 'destructive';
      case 'alumni': return 'secondary';
      case 'active_member': return 'default';
      default: return 'outline';
    }
  };

  const columns = chapterId
    ? execColumns
    : buildDeveloperColumns({
      getRoleBadgeVariant,
      formatDate,
      showDeveloperColumn: !chapterId,
    });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">User Management</h2>
          <p className="text-gray-600">Create and manage user accounts</p>
        </div>
        <Button onClick={() => setShowCreateForm(true)} className="flex items-center space-x-2 rounded-full">
          <Plus className="h-4 w-4" />
          <span>Create User</span>
        </Button>
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search users by email, name, role, or chapter..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="w-full sm:w-56">
          <Select value={roleFilter} onValueChange={(v: any) => setRoleFilter(v)}>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="active_member">Active Members</SelectItem>
            <SelectItem value="alumni">Alumni</SelectItem>
            <SelectItem value="admin">Admin / Executive</SelectItem>
            <SelectItem value="governance">Governance</SelectItem>
          </Select>
        </div>
      </div>

      {/* Users Table */}
      <UsersTable
        title={`All Users (${totalUsers.toLocaleString()})`}
        users={filteredUsers}
        loading={loading}
        columns={columns}
        renderActions={(user) => (
          <div className="flex items-center space-x-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => openUserProfile(user.id)}
              className="hover:bg-accent-50 hover:text-brand-accent"
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => openEditModal(user)}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={() => openDeleteModal(user)}
              disabled={deletingUserId === user.id}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
        pagination={(
          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-gray-600">
              <p>Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalUsers)} of {totalUsers.toLocaleString()} users</p>
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
        )}
      />

      {/* Create User Form */}
      {showCreateForm && (
        <CreateUserForm 
          onClose={() => setShowCreateForm(false)} 
          onSuccess={fetchUsers} 
          chapterContext={chapterContext}
          isDeveloper={isDeveloper}
        />
      )}

      {/* Delete User Modal */}
      <DeleteUserModal
        isOpen={deleteModalOpen}
        onClose={closeDeleteModal}
        onConfirm={handleDeleteUser}
        user={userToDelete}
        isDeleting={deletingUserId === userToDelete?.id}
      />

      {/* Edit User Modal */}
      <EditUserModal
        isOpen={editModalOpen}
        onClose={closeEditModal}
        user={userToEdit}
        onSaved={fetchUsers}
      />
    </div>
  );
}
