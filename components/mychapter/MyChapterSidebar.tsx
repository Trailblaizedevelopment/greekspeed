"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, GraduationCap, UserPlus, Calendar, Lock, X, ChevronRight, Loader2, UserCheck, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useProfile } from '@/lib/contexts/ProfileContext';
import { useChapterMembers } from '@/lib/hooks/useChapterMembers';
import { useScopedChapterId } from '@/lib/hooks/useScopedChapterId';
import { AddMemberForm } from '@/components/chapter/AddMemberForm';
import { EventForm } from '@/components/ui/EventForm'; // Add this import
import { FeatureGuard } from '@/components/shared/FeatureGuard'; // Add this import
import { AddRecruitForm } from '@/components/features/recruitment/AddRecruitForm';
import type { Recruit } from '@/types/recruitment';
import { useRouter } from 'next/navigation';
import { EXECUTIVE_ROLES } from '@/lib/permissions';


interface MyChapterSidebarProps {
  onNavigate: (section: string) => void;
  activeSection: string;
  searchTerm: string;
  onSearchChange: (term: string) => void;
}

export function MyChapterSidebar({ onNavigate, activeSection, searchTerm, onSearchChange }: MyChapterSidebarProps) {
  const router = useRouter();
  
  // Add state for both modals
  const [showAddMemberForm, setShowAddMemberForm] = useState(false);
  const [showCreateEventForm, setShowCreateEventForm] = useState(false);
  const [showAddRecruitModal, setShowAddRecruitModal] = useState(false); // New state for recruit modal
  
  // Get current user's profile to check role and chapter
  const { profile } = useProfile();
  const chapterId = useScopedChapterId();
  
  // Fetch chapter members to calculate stats dynamically, excluding alumni
  const { members, loading: membersLoading } = useChapterMembers(chapterId || undefined, true);
  
  // Check if user is admin (same pattern as other components)
  const isAdmin = profile?.role === 'admin';
  // Check if user can submit recruits (active_member or admin)
  const canSubmitRecruit = profile?.role === 'active_member' || profile?.role === 'admin';
  // Check if user is exec (admin or exec chapter_role) - can view recruitment page
  const isExec = isAdmin || (profile?.chapter_role && EXECUTIVE_ROLES.includes(profile.chapter_role as any));

  // Calculate stats dynamically from the fetched members
  const stats = {
    totalMembers: members.length,
    activeMembers: members.filter(m => m.member_status === 'active').length,
    officers: members.filter(m => m.chapter_role && m.chapter_role !== 'member' && m.chapter_role !== 'pledge').length
  };

  // Collapsible sidebar state (following AlumniPipelineLayout pattern)
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Set mobile-specific initial state (following AlumniPipelineLayout pattern)
  useEffect(() => {
    const isMobile = window.innerWidth < 768; // md breakpoint
    if (isMobile) {
      setSidebarCollapsed(true); // Start collapsed on mobile
    }
  }, []);

  const sidebarItems = [
    {
      id: "all",
      label: "All Members",
      icon: Users,
      count: stats.totalMembers,
      description: "View all chapter members",
      locked: false,
      showForAll: true
    },
    {
      id: "members",
      label: "General Members",
      icon: Users,
      count: stats.totalMembers - stats.officers,
      description: "Active chapter members",
      locked: false,
      showForAll: true
    },
    {
      id: "officers",
      label: "Officers & Leadership",
      icon: GraduationCap,
      count: stats.officers,
      description: "Chapter leadership team",
      locked: false,
      showForAll: true
    }
  ];

  // Remove the filter since we no longer have adminOnly items
  const visibleItems = sidebarItems;

  // Handle event creation
  const handleCreateEvent = async (eventData: any) => {
    try {
      // TODO: Implement actual event creation API call
      // Creating event
      setShowCreateEventForm(false);
      // Optionally refresh events or navigate to events section
    } catch (error) {
      console.error('Error creating event:', error);
    }
  };

  return (
    <div className="flex bg-gray-50 overflow-hidden">
      {/* Collapsible Sidebar — desktop only; mobile uses dashboard header + drawer (AlumniDashboard) or compact bar (standalone). */}
      <div className="hidden md:flex">
        {/* Main Sidebar */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ 
                width: sidebarCollapsed ? 64 : (window.innerWidth < 768 ? '100vw' : 320), 
                opacity: 1 
              }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="bg-gradient-to-b from-[#FFFFFF] to-[#F9FAFB] shadow-sm flex-shrink-0 border-r-4 border-transparent bg-clip-padding"
            >
              <div className="flex flex-col">
                {/* Header */}
                <div className="p-4 border-b border-gray-200 bg-gray-50 flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Users className="h-5 w-5 text-brand-primary flex-shrink-0" />
                      {!sidebarCollapsed && (
                        <motion.h3 
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="font-semibold text-gray-900"
                        >
                          Manage my chapter
                        </motion.h3>
                      )}
                    </div>
                    <div className="flex items-center space-x-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                        className="h-8 w-8 p-0"
                      >
                        {sidebarCollapsed ? (
                          <ChevronRight className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4 rotate-180" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSidebarOpen(false)}
                        className="h-8 w-8 p-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Sidebar Content */}
                <div className="p-4">
                  {sidebarCollapsed ? (
                    // Collapsed view - show only icons
                    <div className="space-y-4">
                      <div className="flex flex-col items-center space-y-2">
                        {visibleItems.map((item) => (
                          <Button
                            key={item.id}
                            variant={activeSection === item.id ? "default" : "ghost"}
                            size="sm"
                            className={`h-10 w-10 p-0 ${
                              item.locked 
                                ? 'opacity-60 cursor-not-allowed' 
                                : activeSection === item.id 
                                  ? 'bg-slate-200 text-white hover:bg-slate-100-hover' 
                                  : 'hover:bg-gray-50'
                              }`}
                            onClick={() => !item.locked && onNavigate(item.id)}
                            disabled={item.locked}
                            title={item.label}
                          >
                            <item.icon className="h-5 w-5" />
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    // Expanded view - show full sidebar content
                    <div className="space-y-6">
                      {/* Search Bar */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">Search Members</label>
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="Search by name, major, or interests..."
                            value={searchTerm}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md focus:ring-brand-primary focus:border-brand-primary text-sm"
                          />
                          <svg className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                        </div>
                      </div>

                      {/* Navigation Items */}
                      <div className="space-y-2">
                        {visibleItems.map((item) => (
                          <Button
                            key={item.id}
                            variant={activeSection === item.id ? "default" : "ghost"}
                            className={`w-full rounded-full justify-start h-auto p-3 ${
                              item.locked 
                                ? 'opacity-60 cursor-not-allowed' 
                                : activeSection === item.id 
                                  ? 'bg-slate-200 text-white hover:bg-slate-100-hover' 
                                  : 'hover:bg-gray-50'
                            }`}
                            onClick={() => !item.locked && onNavigate(item.id)}
                            disabled={item.locked}
                          >
                            <div className="flex items-center space-x-3 w-full">
                              <div className="flex-shrink-0">
                                <item.icon className="h-5 w-5 text-gray-600" />
                              </div>
                              <div className="flex-1 text-left min-w-0">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium text-gray-900 truncate">
                                    {item.label}
                                  </span>
                                  <div className="flex items-center space-x-2">
                                    {item.count !== null && (
                                      <Badge variant="secondary" className="text-xs">
                                        {membersLoading ? (
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                          item.count
                                        )}
                                      </Badge>
                                    )}
                                    {item.locked && (
                                      <Lock className="h-3 w-3 text-gray-400" />
                                    )}
                                  </div>
                                </div>
                                <p className="text-xs text-gray-500 truncate mt-1">
                                  {item.description}
                                </p>
                              </div>
                            </div>
                          </Button>
                        ))}
                      </div>

                      {/* Quick Actions - Only show for admins */}
                      {isAdmin && (
                        <div className="border-t border-gray-200 pt-4">
                          <h3 className="text-sm font-medium text-gray-900 mb-3">Quick Actions</h3>
                          <div className="space-y-2">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="w-full rounded-full font-medium shadow-sm hover:shadow-md transition-all duration-200 border-primary-300 hover:bg-gray-50"
                              onClick={() => setShowAddMemberForm(true)}
                            >
                              <UserPlus className="h-4 w-4 mr-2" />
                              Add New Member
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="w-full rounded-full font-medium shadow-sm hover:shadow-md transition-all duration-200 border-primary-300 hover:bg-gray-50"
                              onClick={() => setShowCreateEventForm(true)}
                            >
                              <Calendar className="h-4 w-4 mr-2" />
                              Create Event
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Recruitment Management - Available to execs */}
                      {isExec && (
                        <FeatureGuard flagName="recruitment_crm_enabled">
                          <div className={`border-t border-gray-200 pt-4 ${!isAdmin ? 'mt-4' : ''}`}>
                            <h3 className="text-sm font-medium text-gray-900 mb-3">Organization</h3>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="w-full rounded-full font-medium shadow-sm hover:shadow-md transition-all duration-200 border-primary-300 hover:bg-gray-50"
                              onClick={() => router.push('/dashboard/admin?view=recruitment')}
                            >
                              <Settings className="h-4 w-4 mr-2" />
                              Manage Organization
                            </Button>
                          </div>
                        </FeatureGuard>
                      )}

                      {/* Submit Recruit - Available to active members and admins */}
                      {canSubmitRecruit && (
                        <FeatureGuard flagName="recruitment_crm_enabled">
                          <div className={`border-t border-gray-200 pt-4 ${!isAdmin && !isExec ? 'mt-4' : ''}`}>
                            {!isAdmin && !isExec && (
                              <h3 className="text-sm font-medium text-gray-900 mb-3">Quick Actions</h3>
                            )}
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="w-full rounded-full font-medium shadow-sm hover:shadow-md transition-all duration-200 border-primary-300 hover:bg-gray-50"
                              onClick={() => setShowAddRecruitModal(true)}
                            >
                              <UserPlus className="h-4 w-4 mr-2" />
                              Submit Recruit
                            </Button>
                          </div>
                        </FeatureGuard>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sidebar Toggle Button (when sidebar is completely closed) */}
        {!sidebarOpen && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center"
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(true)}
              className="h-12 w-8 bg-white border-r border-gray-200 shadow-sm rounded-r-lg hover:bg-gray-50"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </motion.div>
        )}
      </div>

      {/* Add Member Modal */}
      {showAddMemberForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <AddMemberForm
            onClose={() => setShowAddMemberForm(false)}
            onSuccess={() => {
              setShowAddMemberForm(false);
              onNavigate('all');
            }}
            chapterContext={{
              chapterId: profile?.chapter_id || '',
              chapterName: profile?.chapter || 'Phi Delta Theta',
              isChapterAdmin: true
            }}
          />
        </div>
      )}

      {/* Create Event Modal */}
      {showCreateEventForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <EventForm
            onSubmit={handleCreateEvent}
            onCancel={() => setShowCreateEventForm(false)}
          />
        </div>
      )}

      {/* Add Recruit Modal */}
      {showAddRecruitModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <AddRecruitForm
            onSuccess={(recruit: Recruit) => {
              setShowAddRecruitModal(false);
              // Optionally refresh data or show notification
            }}
            onCancel={() => setShowAddRecruitModal(false)}
            variant="modal"
          />
        </div>
      )}
    </div>
  );
} 