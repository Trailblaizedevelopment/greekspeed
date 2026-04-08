'use client';

import { useState, useEffect } from 'react';
import { Drawer } from 'vaul';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, X, Users, UserCheck } from 'lucide-react';
import { TaskPriority, CreateTaskRequest } from '@/types/operations';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (task: CreateTaskRequest) => Promise<void>;
  chapterMembers: Array<{ id: string; full_name: string; role: string; chapter_role: string | null }>;
  creating: boolean;
}

/** Shared with native `<select>` (mobile) and custom Select (desktop). */
const TASK_PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

export function TaskModal({ isOpen, onClose, onSubmit, chapterMembers, creating }: TaskModalProps) {
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const executiveMembers = chapterMembers.filter(
    (member) =>
      member.role === 'admin' ||
      (member.chapter_role &&
        [
          'president',
          'vice_president',
          'treasurer',
          'secretary',
          'rush_chair',
          'social_chair',
          'philanthropy_chair',
          'risk_management_chair',
          'alumni_relations_chair',
        ].includes(member.chapter_role))
  );

  const activeMembers = chapterMembers.filter(
    (member) =>
      member.role === 'active_member' &&
      (!member.chapter_role ||
        ![
          'president',
          'vice_president',
          'treasurer',
          'secretary',
          'rush_chair',
          'social_chair',
          'philanthropy_chair',
          'risk_management_chair',
          'alumni_relations_chair',
        ].includes(member.chapter_role))
  );

  const executiveIds = executiveMembers.map((member) => member.id);
  const activeIds = activeMembers.map((member) => member.id);

  const handleAssigneeToggle = (memberId: string) => {
    setSelectedAssignees((prev) => {
      const newSelection = prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId];

      setNewTask((prevTask) => ({
        ...prevTask,
        assignee_id: newSelection,
      }));

      return newSelection;
    });
  };

  const handleSelectAllExecutive = () => {
    const allExecutiveSelected = executiveIds.every((id) => selectedAssignees.includes(id));

    if (allExecutiveSelected) {
      setSelectedAssignees((prev) => prev.filter((id) => !executiveIds.includes(id)));
      setNewTask((prevTask) => ({
        ...prevTask,
        assignee_id: Array.isArray(prevTask.assignee_id)
          ? prevTask.assignee_id.filter((id: string) => !executiveIds.includes(id))
          : [],
      }));
    } else {
      setSelectedAssignees((prev) => [...new Set([...prev, ...executiveIds])]);
      setNewTask((prevTask) => ({
        ...prevTask,
        assignee_id: [...new Set([...(prevTask.assignee_id as string[]), ...executiveIds])],
      }));
    }
  };

  const handleSelectAllActive = () => {
    const allActiveSelected = activeIds.every((id) => selectedAssignees.includes(id));

    if (allActiveSelected) {
      setSelectedAssignees((prev) => prev.filter((id) => !activeIds.includes(id)));
      setNewTask((prevTask) => ({
        ...prevTask,
        assignee_id: Array.isArray(prevTask.assignee_id)
          ? prevTask.assignee_id.filter((id: string) => !activeIds.includes(id))
          : [],
      }));
    } else {
      setSelectedAssignees((prev) => [...new Set([...prev, ...activeIds])]);
      setNewTask((prevTask) => ({
        ...prevTask,
        assignee_id: [...new Set([...(prevTask.assignee_id as string[]), ...activeIds])],
      }));
    }
  };

  const [newTask, setNewTask] = useState<CreateTaskRequest>({
    title: '',
    description: '',
    assignee_id: [],
    due_date: '',
    priority: 'medium',
    chapter_id: '',
  });

  const handleSubmit = async () => {
    if (!newTask.title || (Array.isArray(newTask.assignee_id) && newTask.assignee_id.length === 0)) {
      return;
    }

    await onSubmit(newTask);

    setNewTask({
      title: '',
      description: '',
      assignee_id: [],
      due_date: '',
      priority: 'medium',
      chapter_id: '',
    });
    setSelectedAssignees([]);
  };

  return (
    <Drawer.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      direction="bottom"
      modal
      dismissible
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[9999] bg-black/40 transition-opacity" />
        <Drawer.Content
          className={cn(
            'bg-white flex flex-col z-[10000] fixed bottom-0 left-0 right-0 shadow-2xl border border-gray-200 outline-none overflow-hidden min-h-0',
            isMobile
              ? 'h-[85dvh] max-h-[85dvh] rounded-t-[20px]'
              : 'h-[min(80vh,100dvh)] max-h-[80vh] max-w-lg mx-auto rounded-t-[20px]'
          )}
        >
          {isMobile && (
            <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-zinc-300 mt-3 mb-1" aria-hidden />
          )}

          <div className="flex flex-col flex-1 min-h-0">
            {/* Header */}
            <div className="bg-white flex-shrink-0 border-b border-gray-200 px-4 pt-2 sm:pt-4 pb-3">
              <div className="flex items-center justify-between gap-3">
                <Drawer.Title className="text-lg font-semibold text-gray-900">Create New Task</Drawer.Title>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 p-1 shrink-0"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Body — scrolls; footer stays pinned above system UI */}
            <div
              className={cn(
                'bg-white flex-1 min-h-0 overflow-y-auto overscroll-contain',
                isMobile ? 'px-4 pt-3 pb-2' : 'px-4 sm:px-6 pt-3 pb-2 sm:pt-4'
              )}
            >
              <div className={cn(isMobile ? 'space-y-4' : 'space-y-4 sm:space-y-3')}>
                <div>
                  <Label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
                    Task Title *
                  </Label>
                  <Input
                    id="title"
                    value={newTask.title}
                    onChange={(e) => setNewTask((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="Enter task title"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-brand-primary focus:ring-brand-primary text-sm h-9"
                  />
                </div>

                <div>
                  <Label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </Label>
                  <Textarea
                    id="description"
                    value={newTask.description}
                    onChange={(e) => setNewTask((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Enter task description"
                    rows={3}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-brand-primary focus:ring-brand-primary text-sm min-h-[60px] max-h-[120px] resize-y"
                  />
                </div>

                <div>
                  <Label htmlFor="assignee" className="text-sm font-medium text-gray-700 mb-2">
                    Assign To * ({selectedAssignees.length} selected)
                  </Label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {executiveMembers.length > 0 && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-1">
                            <Users className="h-3 w-3 text-brand-primary" />
                            <span className="text-xs font-medium text-gray-700">Executive</span>
                            <span className="text-xs text-gray-500">({executiveMembers.length})</span>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleSelectAllExecutive}
                            className="h-5 px-2 text-xs"
                          >
                            {executiveMembers.every((member) => selectedAssignees.includes(member.id)) ? 'None' : 'All'}
                          </Button>
                        </div>
                        <div className="space-y-1 max-h-20 overflow-y-auto border border-gray-200 rounded-md p-2 bg-gray-50">
                          {executiveMembers.map((member) => (
                            <div key={member.id} className="flex items-center space-x-1">
                              <Checkbox
                                id={`exec-${member.id}`}
                                checked={selectedAssignees.includes(member.id)}
                                onCheckedChange={() => handleAssigneeToggle(member.id)}
                                className="h-3 w-3"
                              />
                              <Label
                                htmlFor={`exec-${member.id}`}
                                className="text-xs text-gray-700 cursor-pointer flex-1 truncate"
                              >
                                {member.full_name}
                                {member.chapter_role && (
                                  <span className="ml-1 text-xs text-gray-500 capitalize">
                                    ({member.chapter_role.replace('_', ' ')})
                                  </span>
                                )}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {activeMembers.length > 0 && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-1">
                            <UserCheck className="h-3 w-3 text-brand-accent" />
                            <span className="text-xs font-medium text-gray-700">Active</span>
                            <span className="text-xs text-gray-500">({activeMembers.length})</span>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleSelectAllActive}
                            className="h-5 px-2 text-xs"
                          >
                            {activeMembers.every((member) => selectedAssignees.includes(member.id)) ? 'None' : 'All'}
                          </Button>
                        </div>
                        <div className="space-y-1 max-h-20 overflow-y-auto border border-gray-200 rounded-md p-2 bg-gray-50">
                          {activeMembers.map((member) => (
                            <div key={member.id} className="flex items-center space-x-1">
                              <Checkbox
                                id={`active-${member.id}`}
                                checked={selectedAssignees.includes(member.id)}
                                onCheckedChange={() => handleAssigneeToggle(member.id)}
                                className="h-3 w-3"
                              />
                              <Label
                                htmlFor={`active-${member.id}`}
                                className="text-xs text-gray-700 cursor-pointer flex-1 truncate"
                              >
                                {member.full_name}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {selectedAssignees.length === 0 && (
                    <div className="text-xs text-gray-500 italic mt-1">
                      Select at least one member to assign this task to
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="due_date" className="block text-sm font-medium text-gray-700 mb-1">
                      Due Date
                    </Label>
                    <Input
                      id="due_date"
                      type="date"
                      value={newTask.due_date}
                      onChange={(e) => setNewTask((prev) => ({ ...prev, due_date: e.target.value }))}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-brand-primary focus:ring-brand-primary text-sm h-9"
                    />
                  </div>

                  <div>
                    <Label htmlFor="priority" className="block text-base sm:text-sm font-medium text-gray-700 mb-2 sm:mb-1">
                      Priority *
                    </Label>
                    {isMobile ? (
                      <select
                        id="priority"
                        value={newTask.priority}
                        onChange={(e) =>
                          setNewTask((prev) => ({
                            ...prev,
                            priority: e.target.value as TaskPriority,
                          }))
                        }
                        className={cn(
                          'mt-1 flex h-9 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm',
                          'focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary',
                          'disabled:cursor-not-allowed disabled:opacity-50'
                        )}
                      >
                        {TASK_PRIORITY_OPTIONS.map(({ value, label }) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Select
                        className="mt-1 w-full"
                        disableDynamicPositioning
                        value={newTask.priority}
                        onValueChange={(value) =>
                          setNewTask((prev) => ({ ...prev, priority: value as TaskPriority }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select priority" />
                        </SelectTrigger>
                        <SelectContent>
                          {TASK_PRIORITY_OPTIONS.map(({ value, label }) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer — fixed strip inside drawer, always above scroll + above bottom nav (z layering) */}
            <div
              className={cn(
                'bg-gray-50 flex-shrink-0 border-t border-gray-200',
                isMobile ? 'px-4 py-3 pb-[calc(12px+env(safe-area-inset-bottom))]' : 'px-4 py-2 sm:px-6 sm:py-3'
              )}
            >
              <div className="flex justify-end space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={creating}
                  className="inline-flex justify-center rounded-full border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 h-8"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={
                    creating ||
                    !newTask.title ||
                    (Array.isArray(newTask.assignee_id) && newTask.assignee_id.length === 0)
                  }
                  className="inline-flex justify-center rounded-full border border-transparent bg-brand-primary px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-primary-hover focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 h-8"
                >
                  {creating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                  {Array.isArray(newTask.assignee_id) && newTask.assignee_id.length > 1
                    ? `Create ${newTask.assignee_id.length} Tasks`
                    : 'Create Task'}
                </Button>
              </div>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
