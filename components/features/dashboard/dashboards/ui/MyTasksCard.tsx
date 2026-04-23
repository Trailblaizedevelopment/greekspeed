'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ListTodo, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { supabase } from '@/lib/supabase/client';
import { Task, TaskStatus } from '@/types/operations';
import { toast } from 'react-toastify';

export function MyTasksCard() {
  const { profile } = useProfile();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(3);

  // Load tasks for the current user
  const loadMyTasks = async () => {
    if (!profile?.chapter_id || !profile?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      // Use Supabase directly to fetch tasks
      const { data: allTasks, error: fetchError } = await supabase
        .from('tasks')
        .select(`
          *,
          assignee:profiles!tasks_assignee_id_fkey(full_name),
          assigned_by:profiles!tasks_assigned_by_fkey(full_name),
          chapter:spaces!tasks_chapter_id_fkey(name)
        `)
        .eq('chapter_id', profile.chapter_id)
        .eq('assignee_id', profile.id) // Only get tasks assigned to current user
        .order('created_at', { ascending: false });

      if (fetchError) {
        throw fetchError;
      }

      // Transform data to include computed fields
      const transformedTasks = allTasks.map(task => ({
        ...task,
        assignee_name: task.assignee?.full_name || 'Unassigned',
        assigned_by_name: task.assigned_by?.full_name || 'Unknown',
        chapter_name: task.chapter?.name || 'Unknown Chapter',
        is_overdue: task.due_date && task.status !== 'completed' && new Date(task.due_date) < new Date()
      }));

      setTasks(transformedTasks);
    } catch (error) {
      console.error('Error loading my tasks:', error);
      setError('Failed to load tasks');
      setTasks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMyTasks();
  }, [profile?.chapter_id, profile?.id]);

  const handleTaskToggle = async (taskId: string, currentStatus: TaskStatus) => {
    try {
      const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
      
      // Update in Supabase
      const { error: updateError } = await supabase
        .from('tasks')
        .update({ 
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', taskId);

      if (updateError) throw updateError;

      // Update local state
      setTasks(prev => prev.map(task => 
        task.id === taskId ? { ...task, status: newStatus } : task
      ));

      // Show toast notification on desktop only
      if (window.innerWidth >= 640) { // sm breakpoint
        if (newStatus === 'completed') {
          toast.success('Task marked as complete and will be removed upon admin approval', {
            position: "top-right",
            autoClose: 3000,
            hideProgressBar: false,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
          });
        } else {
          toast.info('Task marked as incomplete', {
            position: "top-right",
            autoClose: 3000,
            hideProgressBar: false,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
          });
        }
      }
    } catch (error) {
      console.error('Error updating task:', error);
      // Show error toast on desktop
      if (window.innerWidth >= 640) {
        toast.error('Failed to update task. Please try again.', {
          position: "top-right",
          autoClose: 3000,
        });
      }
    }
  };

  // Calculate progress based on completed tasks
  const completedTasks = tasks.filter(task => task.status === 'completed').length;
  const totalTasks = tasks.length;
  const progressPercentage = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  // Pagination
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = tasks.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(tasks.length / itemsPerPage);

  const handlePreviousPage = () => {
    setCurrentPage(prevPage => Math.max(prevPage - 1, 1));
  };

  const handleNextPage = () => {
    setCurrentPage(prevPage => Math.min(prevPage + 1, totalPages));
  };

  // Smart pagination - always show max 3 page numbers with ellipsis
  const getVisiblePages = () => {
    // If 3 or fewer pages, show all
    if (totalPages <= 3) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    
    const pages: (number | 'ellipsis')[] = [];
    
    if (currentPage === 1) {
      // First page: show 1, 2, 3, ..., last (3 numbers)
      pages.push(1, 2, 3);
      pages.push('ellipsis');
      pages.push(totalPages);
    } else if (currentPage === totalPages) {
      // Last page: show 1, ..., last-2, last-1, last (3 numbers)
      pages.push(1);
      pages.push('ellipsis');
      pages.push(totalPages - 2, totalPages - 1, totalPages);
    } else if (currentPage === 2) {
      // Second page: show 1, 2, 3, ..., last (3 numbers)
      pages.push(1, 2, 3);
      pages.push('ellipsis');
      pages.push(totalPages);
    } else if (currentPage === totalPages - 1) {
      // Second to last: show 1, ..., last-2, last-1, last (3 numbers)
      pages.push(1);
      pages.push('ellipsis');
      pages.push(totalPages - 2, totalPages - 1, totalPages);
    } else {
      // Middle pages: show 1, ..., current, ..., last (only 1 number in middle)
      pages.push(1);
      pages.push('ellipsis');
      pages.push(currentPage);
      pages.push('ellipsis');
      pages.push(totalPages);
    }
    
    return pages;
  };

  // Show loading state
  if (loading) {
    return (
      <Card className="bg-white shadow-sm border border-gray-200">
        <CardHeader className="pb-3 border-b border-gray-100">
          <CardTitle className="text-lg flex items-center space-x-2 font-semibold text-gray-900">
            <ListTodo className="h-5 w-5 text-brand-primary" />
            <span>My Tasks</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-brand-primary" />
            <span className="ml-2 text-gray-600">Loading tasks...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show error state
  if (error) {
    return (
      <Card className="bg-white shadow-sm border border-gray-200">
        <CardHeader className="pb-3 border-b border-gray-100">
          <CardTitle className="text-lg flex items-center space-x-2 font-semibold text-gray-900">
            <ListTodo className="h-5 w-5 text-brand-primary" />
            <span>My Tasks</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="text-center py-8 text-red-600">
            <p className="font-medium mb-2">Error loading tasks</p>
            <p className="text-sm">{error}</p>
            <Button 
              onClick={() => loadMyTasks()} 
              className="mt-3 bg-brand-primary hover:bg-brand-primary-hover h-10 sm:h-8"
            >
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show empty state (no tasks)
  if (tasks.length === 0) {
    return (
      <Card className="bg-white shadow-sm border border-gray-200">
        <CardHeader className="pb-3 border-b border-gray-100">
          <CardTitle className="text-lg flex items-center space-x-2 font-semibold text-gray-900">
            <ListTodo className="h-5 w-5 text-brand-primary" />
            <span>My Tasks</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="text-center py-8">
            <p className="text-gray-500 text-sm mb-2">You&apos;re all caught up 🎉</p>
            <p className="text-gray-400 text-xs mb-3">No tasks assigned to you yet</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show tasks
  return (
    <Card className="bg-white shadow-sm border border-gray-200">
      <CardHeader className="pb-3 border-b border-gray-100">
        <CardTitle className="text-lg flex items-center space-x-2 font-semibold text-gray-900">
          <ListTodo className="h-5 w-5 text-brand-primary" />
          <span>My Tasks</span>
          <span className="ml-2 px-2 py-1 text-xs rounded-full text-gray-500 bg-gray-100">{totalTasks}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-4 sm:space-y-3">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-base sm:text-sm">
              <span className="text-gray-600">Progress</span>
              <span className="text-gray-900 font-medium">{completedTasks}/{totalTasks}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 sm:h-2">
              <div 
                className="bg-brand-primary h-3 sm:h-2 rounded-full transition-all duration-300"
                style={{ width: `${progressPercentage}%` }}
              ></div>
            </div>
          </div>

          {/* Task List */}
          <div className="space-y-2.5 max-h-48 overflow-y-auto">
            {currentItems.map((task) => (
              <div key={task.id} className="flex items-start space-x-3 sm:space-x-3 p-3 sm:p-2 rounded-lg hover:border-primary-300 hover:shadow-sm transition-all duration-200 bg-white border border-gray-200">
                <Checkbox
                  checked={task.status === 'completed'}
                  onCheckedChange={() => handleTaskToggle(task.id, task.status)}
                  className="mt-1 sm:mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className={`text-base sm:text-sm break-words ${task.status === 'completed' ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                    {task.title}
                  </div>
                  {task.description && (
                    <div className={`text-sm sm:text-xs break-words ${task.status === 'completed' ? 'text-gray-400' : 'text-gray-600'}`}>
                      {task.description}
                    </div>
                  )}
                  {task.due_date && (
                    <div className={`text-sm sm:text-xs ${task.status === 'completed' ? 'text-gray-400' : 'text-gray-500'}`}>
                      Due: {new Date(task.due_date).toLocaleDateString('en-US', { 
                        month: 'long', 
                        day: 'numeric', 
                        year: 'numeric' 
                      })}
                    </div>
                  )}
                  {/* Show priority badge */}
                  <div className="mt-2 sm:mt-1">
                    <span className={`inline-block px-3 py-1 sm:px-2 sm:py-1 text-sm sm:text-xs rounded-full ${
                      task.priority === 'urgent' ? 'bg-red-100 text-red-800' :
                      task.priority === 'high' ? 'bg-orange-100 text-orange-800' :
                      task.priority === 'medium' ? 'bg-accent-100 text-accent-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {task.priority}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="w-full overflow-hidden">
                <div className="flex items-center justify-between w-full gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePreviousPage}
                    disabled={currentPage === 1}
                    className="h-7 px-1.5 text-xs flex-shrink-0"
                  >
                    <ChevronLeft className="h-3 w-3" />
                    <span className="hidden sm:inline ml-0.5">Back</span>
                  </Button>
                  <div className="flex items-center gap-0.5 justify-center flex-1 min-w-0 overflow-hidden">
                    {getVisiblePages().map((page, index) => {
                      if (page === 'ellipsis') {
                        return (
                          <span key={`ellipsis-${index}`} className="px-0.5 text-gray-500 text-xs flex-shrink-0">
                            ...
                          </span>
                        );
                      }
                      return (
                        <Button
                          key={page}
                          variant={currentPage === page ? "default" : "outline"}
                          size="sm"
                          onClick={() => setCurrentPage(page)}
                          className={`h-7 w-7 p-0 text-xs flex-shrink-0 ${
                            currentPage === page
                              ? 'bg-brand-primary text-white hover:bg-brand-primary-hover'
                              : 'hover:bg-gray-50'
                          }`}
                        >
                          {page}
                        </Button>
                      );
                    })}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNextPage}
                    disabled={currentPage === totalPages}
                    className="h-7 px-1.5 text-xs flex-shrink-0"
                  >
                    <span className="hidden sm:inline mr-0.5">Next</span>
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
} 