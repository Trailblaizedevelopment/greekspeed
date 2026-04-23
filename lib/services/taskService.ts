import { supabase } from '@/lib/supabase/client';
import { Task, CreateTaskRequest, UpdateTaskRequest, TaskFilters } from '@/types/operations';

// Task Management
export async function createTask(taskData: CreateTaskRequest, assignedBy: string): Promise<Task | Task[]> {
  // taskService: createTask called
  
  // Handle multiple assignees by creating separate tasks
  if (Array.isArray(taskData.assignee_id)) {
    // Creating multiple tasks for assignees
    
    const tasks = await Promise.all(
      taskData.assignee_id.map((assigneeId, index) => {
        // Creating task for assignee
        return supabase
          .from('tasks')
          .insert({
            ...taskData,
            assignee_id: assigneeId,
            assigned_by: assignedBy,
            status: 'pending'
          })
          .select()
          .single();
      })
    );
    
    // All task creation promises completed
    
    const errors = tasks.filter(result => result.error);
    // Errors found
    
    if (errors.length > 0) {
      console.error('❌ Failed to create some tasks:', errors.map(e => e.error?.message));
      throw new Error(`Failed to create some tasks: ${errors.map(e => e.error?.message).join(', ')}`);
    }
    
    const createdTasks = tasks.map(result => result.data);
    // Successfully created tasks
    return createdTasks;
  }
  
  // Single assignee (original behavior)
  // Creating single task for assignee
  
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      ...taskData,
      assignee_id: taskData.assignee_id as string,
      assigned_by: assignedBy,
      status: 'pending'
    })
    .select()
    .single();

  // Single task creation result

  if (error) {
    console.error('❌ Failed to create single task:', error);
    throw error;
  }
  
  // Successfully created single task
  return data;
}

export async function getTasksByChapter(chapterId: string, filters?: TaskFilters): Promise<Task[]> {
  let query = supabase
    .from('tasks')
    .select(`
      *,
      assignee:profiles!tasks_assignee_id_fkey(full_name),
      assigned_by:profiles!tasks_assigned_by_fkey(full_name),
      chapter:spaces!tasks_chapter_id_fkey(name)
    `)
    .eq('chapter_id', chapterId);

  if (filters?.assignee_id) {
    query = query.eq('assignee_id', filters.assignee_id);
  }
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.priority) {
    query = query.eq('priority', filters.priority);
  }
  if (filters?.due_date_from) {
    query = query.gte('due_date', filters.due_date_from);
  }
  if (filters?.due_date_to) {
    query = query.lte('due_date', filters.due_date_to);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) throw error;

  // Transform data to include computed fields
  return data.map(task => ({
    ...task,
    assignee_name: task.assignee?.full_name || 'Unassigned',
    assigned_by_name: task.assigned_by?.full_name || 'Unknown',
    chapter_name: task.chapter?.name || 'Unknown Chapter',
    is_overdue: task.due_date && task.status !== 'completed' && new Date(task.due_date) < new Date()
  }));
}

export async function updateTask(taskId: string, updates: UpdateTaskRequest): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', taskId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteTask(taskId: string): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', taskId);

  if (error) throw error;
}

// Get chapter members for task assignment
export async function getChapterMembers(chapterId: string): Promise<Array<{ id: string; full_name: string }>> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('chapter_id', chapterId)
    .in('role', ['admin', 'active_member', 'alumni']) // Include all relevant roles
    .order('full_name');

  if (error) throw error;
  return data || [];
}

// Get chapter members for task assignment (excludes alumni)
export async function getChapterMembersForTasks(chapterId: string): Promise<Array<{ id: string; full_name: string; role: string; chapter_role: string | null }>> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, chapter_role')
    .eq('chapter_id', chapterId)
    .in('role', ['admin', 'active_member']) // Exclude alumni for task assignment
    .order('full_name');

  if (error) throw error;
  return data || [];
}

// Subscribe to real-time task updates
export function subscribeToTasks(chapterId: string, callback: (payload: any) => void) {
  return supabase
    .channel(`tasks-${chapterId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'tasks',
        filter: `chapter_id=eq.${chapterId}`
      },
      callback
    )
    .subscribe();
}
