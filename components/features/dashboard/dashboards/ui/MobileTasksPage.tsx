'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ListTodo, Loader2, Plus } from 'lucide-react';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { useScopedChapterId } from '@/lib/hooks/useScopedChapterId';
import { supabase } from '@/lib/supabase/client';
import { Task, TaskStatus } from '@/types/operations';

export function MobileTasksPage() {
  const { profile } = useProfile();
  const chapterId = useScopedChapterId();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load tasks for the current user
  const loadMyTasks = async () => {
    const effectiveChapterId = chapterId ?? profile?.chapter_id;
    if (!effectiveChapterId || !profile?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const { data: allTasks, error: fetchError } = await supabase
        .from('tasks')
        .select(`
          *,
          assignee:profiles!tasks_assignee_id_fkey(full_name),
          assigned_by:profiles!tasks_assigned_by_fkey(full_name),
          chapter:spaces!tasks_chapter_id_fkey(name)
        `)
        .eq('chapter_id', effectiveChapterId)
        .eq('assignee_id', profile.id)
        .order('created_at', { ascending: false });

      if (fetchError) {
        throw fetchError;
      }

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
  }, [chapterId, profile?.chapter_id, profile?.id]);

  const handleTaskToggle = async (taskId: string, currentStatus: TaskStatus) => {
    try {
      const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
      
      const { error: updateError } = await supabase
        .from('tasks')
        .update({ 
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', taskId);

      if (updateError) throw updateError;

      setTasks(prev => prev.map(task => 
        task.id === taskId ? { ...task, status: newStatus } : task
      ));
    } catch (error) {
      console.error('Error updating task:', error);
    }
  };

  const completedTasks = tasks.filter(task => task.status === 'completed').length;
  const totalTasks = tasks.length;
  const progressPercentage = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 pt-4 pb-20 px-4">
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-brand-primary" />
            <span className="ml-2 text-gray-600">Loading tasks...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 pt-4 pb-20 px-4">
        <div className="max-w-md mx-auto">
          <div className="text-center py-8 text-red-600">
            <p className="font-medium mb-2">Error loading tasks</p>
            <p className="text-sm">{error}</p>
            <Button 
              onClick={() => loadMyTasks()} 
              className="mt-3 bg-brand-primary hover:bg-brand-primary-hover"
            >
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-4 pb-20 px-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="flex items-center space-x-2 mb-6">
          <ListTodo className="h-6 w-6 text-brand-primary" />
          <h1 className="text-xl font-semibold text-gray-900">My Tasks</h1>
        </div>

        {/* Progress Card */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Progress</span>
                <span className="text-gray-900 font-medium">{completedTasks}/{totalTasks}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className="bg-brand-primary h-3 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercentage}%` }}
                ></div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tasks List */}
        {tasks.length === 0 ? (
          <div className="text-center py-12">
            <ListTodo className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 text-lg mb-2">You're all caught up! 🎉</p>
            <p className="text-gray-400 text-sm">No tasks assigned to you yet</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
            {tasks.map((task, index) => (
              <div 
                key={task.id} 
                className={`px-4 py-4 ${index !== tasks.length - 1 ? 'border-b border-gray-100' : ''}`}
              >
                <div className="flex items-start space-x-3">
                  <Checkbox
                    checked={task.status === 'completed'}
                    onCheckedChange={() => handleTaskToggle(task.id, task.status)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm break-words ${task.status === 'completed' ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                      {task.title}
                    </div>
                    {task.description && (
                      <div className={`text-xs break-words mt-1 ${task.status === 'completed' ? 'text-gray-400' : 'text-gray-600'}`}>
                        {task.description}
                      </div>
                    )}
                    {task.due_date && (
                      <div className={`text-xs mt-2 ${task.status === 'completed' ? 'text-gray-400' : 'text-gray-500'}`}>
                        Due: {new Date(task.due_date).toLocaleDateString('en-US', { 
                          month: 'long', 
                          day: 'numeric', 
                          year: 'numeric' 
                        })}
                      </div>
                    )}
                    <div className="mt-2">
                      <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${
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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
