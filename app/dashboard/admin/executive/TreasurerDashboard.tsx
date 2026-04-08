'use client';
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { DollarSign, TrendingUp, Users, AlertTriangle, CheckCircle, Download, Mail, Plus, Calendar, Edit, Eye, UserPlus, X, Lock, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { createPortal } from 'react-dom';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectItem, SelectContent } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useProfile } from "@/lib/contexts/ProfileContext";
import { supabase } from '@/lib/supabase/client';
import { QuickActions, QuickAction } from '@/components/features/dashboard/dashboards/ui/QuickActions';

interface DuesCycle {
  id: string;
  name: string;
  base_amount: number;
  due_date: string;
  close_date: string | null;
  status: string;
  allow_payment_plans: boolean;
  created_at: string;
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
  notes?: string;
  cycle: {
    name: string;
    due_date: string;
  };
}

interface ChapterMember {
  id: string;
  full_name: string;
  email: string;
  member_status: string;
  current_dues_amount: number;
  dues_status: string;
  last_dues_assignment_date: string | null;
  role: string;
  chapter_role: string;
}

// Add CSV export function for dues data
const exportDuesToCSV = (assignments: DuesAssignment[], filename: string = "dues-export.csv") => {
  // Define the CSV headers
  const headers = [
    "Member Name",
    "Email", 
    "Class",
    "Amount Due",
    "Amount Paid",
    "Status",
    "Due Date",
    "Cycle Name",
    "Notes"
  ];

  // Convert assignments data to CSV rows
  const csvRows = assignments.map(assignment => [
    assignment.user.full_name || "",
    assignment.user.email || "",
    assignment.user.member_status || "",
    assignment.amount_due || 0,
    assignment.amount_paid || 0,
    assignment.status || "",
    new Date(assignment.cycle.due_date).toLocaleDateString(),
    assignment.cycle.name || "",
    assignment.notes || ""
  ]);

  // Combine headers and data
  const csvContent = [headers, ...csvRows]
    .map(row => 
      row.map(field => {
        // Escape quotes and wrap in quotes if contains comma, newline, or quote
        const escaped = String(field).replace(/"/g, '""');
        if (escaped.includes(',') || escaped.includes('\n') || escaped.includes('"')) {
          return `"${escaped}"`;
        }
        return escaped;
      }).join(',')
    )
    .join('\n');

  // Create and download the file
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

export function TreasurerDashboard() {
  const { profile } = useProfile();
  const [selectedTab, setSelectedTab] = useState("overview");
  const [cycles, setCycles] = useState<DuesCycle[]>([]);
  const [assignments, setAssignments] = useState<DuesAssignment[]>([]);
  const [chapterMembers, setChapterMembers] = useState<ChapterMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const membersPerPage = 10;
  const [showCreateCycle, setShowCreateCycle] = useState(false);
  const [showAssignDues, setShowAssignDues] = useState(false);
  const [showBulkAssignDues, setShowBulkAssignDues] = useState(false);
  const [showEditAssignment, setShowEditAssignment] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<DuesAssignment | null>(null);
  const [newCycle, setNewCycle] = useState({
    name: '',
    base_amount: 0,
    due_date: '',
    allow_payment_plans: false
  });
  const [newAssignment, setNewAssignment] = useState({
    memberId: '',
    amount: 0,
    status: 'required' as const,
    notes: ''
  });
  const [bulkAssignment, setBulkAssignment] = useState({
    selectedMembers: [] as string[],
    cycleId: '' as string,
    amount: 0,
    status: 'required' as 'required' | 'exempt' | 'reduced' | 'waived',
    notes: ''
  });

  useEffect(() => {
    if (profile?.chapter_id) {
      loadDuesData();
      loadChapterMembers();
    }
  }, [profile?.chapter_id]);

  // Reset to page 1 when chapterMembers changes
  useEffect(() => {
    setCurrentPage(1);
  }, [chapterMembers.length]);

  const loadDuesData = async () => {
    try {
      setLoading(true);
      
      // Load cycles
      const { data: cyclesData } = await supabase
        .from('dues_cycles')
        .select('*')
        .eq('chapter_id', profile?.chapter_id)
        .order('created_at', { ascending: false });

      setCycles(cyclesData || []);

      // Load assignments
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
        .eq('cycle.chapter_id', profile?.chapter_id);

      setAssignments(assignmentsData || []);
    } catch (error) {
      console.error('Error loading dues data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadChapterMembers = async () => {
    try {
      // Loading chapter members
      
      const { data: membersData, error } = await supabase
        .from('profiles')
        .select(`
          id, 
          full_name, 
          email, 
          member_status, 
          current_dues_amount, 
          dues_status, 
          last_dues_assignment_date,
          role,
          chapter_role
        `)
        .eq('chapter_id', profile?.chapter_id)
        .in('role', ['admin', 'active_member']) // ✅ FIXED: Only fetch admin and active_member roles
        .order('full_name');

      if (error) {
        console.error('❌ Error loading chapter members:', error);
        return;
      }

      // Loaded chapter members
      
      setChapterMembers(membersData || []);
    } catch (error) {
      console.error('❌ Error loading chapter members:', error);
    }
  };

  const handleCreateCycle = async () => {
    try {
      const response = await fetch('/api/dues/cycles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCycle)
      });

      if (response.ok) {
        setShowCreateCycle(false);
        setNewCycle({ name: '', base_amount: 0, due_date: '', allow_payment_plans: false });
        loadDuesData();
      }
    } catch (error) {
      console.error('Error creating cycle:', error);
    }
  };

  const handleAssignDues = async () => {
    try {
      const response = await fetch('/api/dues/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: newAssignment.memberId,
          amount: newAssignment.amount,
          status: newAssignment.status,
          notes: newAssignment.notes,
          cycleId: cycles[0]?.id // Assign to current cycle
        })
      });

      if (response.ok) {
        setShowAssignDues(false);
        setNewAssignment({ memberId: '', amount: 0, status: 'required', notes: '' });
        loadDuesData();
        loadChapterMembers();
      }
    } catch (error) {
      console.error('Error assigning dues:', error);
    }
  };

  const handleBulkAssignDues = async () => {
    try {
      // Starting bulk dues assignment
      
      // Check if we have a valid cycle selected
      if (!bulkAssignment.cycleId) {
        console.error('❌ No dues cycle selected. Please select a cycle first.');
        alert('Please select a dues cycle first.');
        return;
      }
      
      const promises = bulkAssignment.selectedMembers.map(memberId => 
        fetch('/api/dues/assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            memberId,
            amount: bulkAssignment.amount,
            status: bulkAssignment.status,
            notes: bulkAssignment.notes,
            cycleId: bulkAssignment.cycleId
          })
        })
      );

      const responses = await Promise.all(promises);
      const allSuccessful = responses.every(response => response.ok);

      if (allSuccessful) {
        setShowBulkAssignDues(false);
        setBulkAssignment({ selectedMembers: [], cycleId: '', amount: 0, status: 'required', notes: '' });
        loadDuesData();
        loadChapterMembers();
        // Bulk dues assignment completed successfully
      } else {
        console.error('❌ Some bulk assignments failed');
      }
    } catch (error) {
      console.error('❌ Error in bulk dues assignment:', error);
    }
  };

  const handleEditAssignment = async () => {
    if (!selectedAssignment) return;

    try {
      const response = await fetch('/api/dues/assignments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignmentId: selectedAssignment.id,
          amount_assessed: selectedAssignment.amount_assessed,
          amount_due: selectedAssignment.amount_due,
          status: selectedAssignment.status,
          notes: selectedAssignment.notes
        })
      });

      if (response.ok) {
        setShowEditAssignment(false);
        setSelectedAssignment(null);
        loadDuesData();
        loadChapterMembers();
      }
    } catch (error) {
      console.error('Error updating assignment:', error);
    }
  };

  const handleDeleteAssignment = async (assignmentId: string) => {
    if (!confirm('Are you sure you want to delete this dues assignment? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch('/api/dues/assignments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId })
      });

      if (response.ok) {
        loadDuesData();
        loadChapterMembers();
        // Dues assignment deleted successfully
      } else {
        console.error('❌ Error deleting dues assignment');
        alert('Failed to delete dues assignment. Please try again.');
      }
    } catch (error) {
      console.error('❌ Error deleting dues assignment:', error);
      alert('Failed to delete dues assignment. Please try again.');
    }
  };

  const handleMemberSelection = (memberId: string, checked: boolean) => {
    if (checked) {
      setBulkAssignment(prev => ({
        ...prev,
        selectedMembers: [...prev.selectedMembers, memberId]
      }));
    } else {
      setBulkAssignment(prev => ({
        ...prev,
        selectedMembers: prev.selectedMembers.filter(id => id !== memberId)
      }));
    }
  };

  const handleSelectAllMembers = (checked: boolean) => {
    if (checked) {
      setBulkAssignment(prev => ({
        ...prev,
        selectedMembers: chapterMembers.map(member => member.id)
      }));
    } else {
      setBulkAssignment(prev => ({
        ...prev,
        selectedMembers: []
      }));
    }
  };

  // Calculate financial overview from real data
  const financialOverview = {
    totalCollected: assignments.reduce((sum, a) => sum + a.amount_paid, 0),
    totalOutstanding: assignments.reduce((sum, a) => sum + (a.amount_due - a.amount_paid), 0),
    collectionRate: assignments.length > 0 ? 
      (assignments.reduce((sum, a) => sum + a.amount_paid, 0) / 
       assignments.reduce((sum, a) => sum + a.amount_assessed, 0)) * 100 : 0
  };

  // NEW: Calculate dues collection progress for current cycle
  const getCurrentCycle = () => {
    // Get the most recent active cycle
    return cycles.find(cycle => cycle.status === 'active') || cycles[0];
  };

  const getDuesCollectionProgress = () => {
    const currentCycle = getCurrentCycle();
    if (!currentCycle) {
      return {
        cycleName: 'No Active Cycle',
        paid: 0,
        pending: 0,
        overdue: 0,
        total: 0,
        collectionRate: 0
      };
    }

    // Filter assignments for current cycle
    const currentCycleAssignments = assignments.filter(
      assignment => assignment.cycle.name === currentCycle.name
    );

    const now = new Date();
    const dueDate = new Date(currentCycle.due_date);

    // Calculate counts
    const paid = currentCycleAssignments.filter(a => a.status === 'paid').length;
    const pending = currentCycleAssignments.filter(a => 
      a.status === 'required' && now <= dueDate
    ).length;
    const overdue = currentCycleAssignments.filter(a => 
      a.status === 'required' && now > dueDate
    ).length;

    const total = currentCycleAssignments.length;
    const collectionRate = total > 0 ? (paid / total) * 100 : 0;

    return {
      cycleName: currentCycle.name,
      paid,
      pending,
      overdue,
      total,
      collectionRate
    };
  };

  const duesProgress = getDuesCollectionProgress();

  const getStatusColor = (status: string) => {
    switch (status) {
      case "paid": return "bg-green-100 text-green-800";
      case "required": return "bg-yellow-100 text-yellow-800";
      case "exempt": return "bg-gray-100 text-gray-800";
      case "waived": return "bg-accent-100 text-accent-800";
      case "reduced": return "bg-orange-100 text-orange-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>;
  }

  const quickActions: QuickAction[] = [
    {
      id: 'bulk-assign',
      label: 'Bulk Assign Dues',
      icon: Users,
      onClick: () => setShowBulkAssignDues(true),
      className: 'w-full justify-start text-sm whitespace-nowrap rounded-full bg-white/80 backdrop-blur-md border border-primary-300/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300',
      variant: 'outline',
    },
    {
      id: 'assign-dues',
      label: 'Assign Dues',
      icon: UserPlus,
      onClick: () => setShowAssignDues(true),
      className: 'w-full justify-start text-sm whitespace-nowrap rounded-full bg-white/80 backdrop-blur-md border border-primary-300/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300',
      variant: 'outline',
    },
    {
      id: 'create-cycle',
      label: 'Create Dues Cycle',
      icon: Plus,
      onClick: () => setShowCreateCycle(true),
      className: 'w-full justify-start text-sm whitespace-nowrap rounded-full bg-white/80 backdrop-blur-md border border-primary-300/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300',
      variant: 'outline',
    },
    {
      id: 'export-report',
      label: 'Export Financial Report',
      icon: Download,
      onClick: () => exportDuesToCSV(assignments, `financial-report-${new Date().toISOString().split('T')[0]}.csv`),
      className: 'w-full justify-start text-sm whitespace-nowrap rounded-full bg-white/80 backdrop-blur-md border border-primary-300/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300',
      variant: 'outline',
    },
  ];

  // Mobile version with smaller buttons
  const mobileQuickActions: QuickAction[] = quickActions.map(action => ({
    ...action,
    className: action.className ? `${action.className} text-sm py-2` : 'w-full justify-start text-sm py-2',
  }));

  return (
    <div className="max-w-7xl mx-auto px-6 py-0 sm:py-8">
      {/* Financial Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-4 sm:mb-8">
        {/* Desktop Layout - Preserved */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="hidden md:block"
        >
          <Card className="bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20 transition-all duration-300 hover:shadow-xl hover:shadow-navy-100/30 hover:scale-[1.02] hover:bg-white/90">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-brand-primary-hover text-sm font-medium">Total Collected</p>
                  <p className="text-2xl font-semibold text-primary-900">${financialOverview.totalCollected.toLocaleString()}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-brand-primary" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="hidden md:block"
        >
          <Card className="bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20 transition-all duration-300 hover:shadow-xl hover:shadow-navy-100/30 hover:scale-[1.02] hover:bg-white/90">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-brand-primary-hover text-sm font-medium">Outstanding</p>
                  <p className="text-2xl font-semibold text-primary-900">${financialOverview.totalOutstanding.toLocaleString()}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-brand-primary" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="hidden md:block"
        >
          <Card className="bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20 transition-all duration-300 hover:shadow-xl hover:shadow-navy-100/30 hover:scale-[1.02] hover:bg-white/90">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-brand-primary-hover text-sm font-medium">Collection Rate</p>
                  <p className="text-2xl font-semibold text-primary-900">{financialOverview.collectionRate.toFixed(1)}%</p>
                </div>
                <TrendingUp className="h-8 w-8 text-brand-primary" />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Mobile Layout - Single Row */}
      <div className="md:hidden mb-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-3 gap-2"
        >
          {/* Total Collected */}
          <Card className="bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20">
            <CardContent className="p-2">
              <div className="flex flex-col items-center text-center space-y-1">
                <CheckCircle className="h-5 w-5 text-brand-primary" />
                <p className="text-base font-semibold text-primary-900">${financialOverview.totalCollected.toLocaleString()}</p>
                <p className="text-brand-primary-hover text-xs font-medium">Collected</p>
              </div>
            </CardContent>
          </Card>

          {/* Outstanding */}
          <Card className="bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20">
            <CardContent className="p-2">
              <div className="flex flex-col items-center text-center space-y-1">
                <AlertTriangle className="h-5 w-5 text-brand-primary" />
                <p className="text-base font-semibold text-primary-900">${financialOverview.totalOutstanding.toLocaleString()}</p>
                <p className="text-brand-primary-hover text-xs font-medium">Outstanding</p>
              </div>
            </CardContent>
          </Card>

          {/* Collection Rate */}
          <Card className="bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20">
            <CardContent className="p-2">
              <div className="flex flex-col items-center text-center space-y-1">
                <TrendingUp className="h-5 w-5 text-brand-primary" />
                <p className="text-base font-semibold text-primary-900">{financialOverview.collectionRate.toFixed(1)}%</p>
                <p className="text-brand-primary-hover text-xs font-medium">Rate</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Tab Navigation */}
      <div className="mb-4 sm:mb-6">
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
          {[
            { value: "overview", label: "Overview" },
            { value: "members", label: "Members" }
          ].map((tab) => (
            <button
              key={tab.value}
              onClick={() => setSelectedTab(tab.value)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                selectedTab === tab.value
                  ? "bg-white text-brand-primary shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {selectedTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-8">
          {/* Desktop Layout - Dues Collection Progress (2/3 width) */}
          <Card className="hidden lg:block lg:col-span-2 bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20">
            <CardHeader className="border-b border-primary-100/30">
              <CardTitle className="text-primary-900">Dues Collection Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span>{duesProgress.cycleName}</span>
                  <span className="font-medium">{duesProgress.collectionRate.toFixed(1)}%</span>
                </div>
                <Progress value={duesProgress.collectionRate} className="h-3" />
                
                <div className="grid grid-cols-3 gap-4 mt-6">
                  <div className="text-center">
                    <p className="text-2xl font-semibold text-green-600">
                      {duesProgress.paid}
                    </p>
                    <p className="text-sm text-gray-600">Paid</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-semibold text-yellow-600">
                      {duesProgress.pending}
                    </p>
                    <p className="text-sm text-gray-600">Pending</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-semibold text-red-600">
                      {duesProgress.overdue}
                    </p>
                    <p className="text-sm text-gray-600">Overdue</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Desktop Layout - Quick Actions Sidebar (1/3 width) */}
          <div className="hidden lg:block">
            <QuickActions 
              actions={quickActions}
            />
          </div>

          {/* Mobile Layout - Dues Collection Progress */}
          <Card className="lg:hidden bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20">
            <CardHeader className="pb-2 border-b border-primary-100/30">
              <CardTitle className="text-primary-900">Dues Collection Progress</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">{duesProgress.cycleName}</span>
                  <span className="text-sm font-medium">{duesProgress.collectionRate.toFixed(1)}%</span>
                </div>
                <Progress value={duesProgress.collectionRate} className="h-2" />
                
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div className="text-center">
                    <p className="text-lg font-semibold text-green-600">
                      {duesProgress.paid}
                    </p>
                    <p className="text-xs text-gray-600">Paid</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold text-yellow-600">
                      {duesProgress.pending}
                    </p>
                    <p className="text-xs text-gray-600">Pending</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold text-red-600">
                      {duesProgress.overdue}
                    </p>
                    <p className="text-xs text-gray-600">Overdue</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Mobile Layout - Quick Actions */}
          <div className="lg:hidden">
            <QuickActions 
              actions={mobileQuickActions}
              headerClassName="pb-2"
              contentClassName="pt-2 space-y-2"
            />
          </div>
        </div>
      )}

      {selectedTab === "members" && (
        <Card className="bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20">
          <CardHeader className="pb-2 sm:pb-6 border-b border-primary-100/30">
            {/* Desktop Layout */}
            <div className="hidden sm:flex justify-between items-center">
              <CardTitle className="text-primary-900">All Chapter Members ({chapterMembers.length})</CardTitle>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-600">
                  {chapterMembers.length} {chapterMembers.length === 1 ? 'member' : 'members'}
                </span>
                {Math.ceil(chapterMembers.length / membersPerPage) > 1 && (
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1 || loading}
                      className="h-8 px-3 text-xs"
                    >
                      <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                      Previous
                    </Button>
                    <div className="flex items-center space-x-1">
                      {Array.from({ length: Math.ceil(chapterMembers.length / membersPerPage) }, (_, i) => i + 1).map((page) => (
                        <Button
                          key={page}
                          variant={currentPage === page ? "default" : "outline"}
                          size="sm"
                          onClick={() => setCurrentPage(page)}
                          className={`h-8 w-8 p-0 text-xs flex-shrink-0 ${
                            currentPage === page
                              ? 'bg-brand-primary text-white hover:bg-brand-primary-hover'
                              : 'hover:bg-gray-50'
                          }`}
                        >
                          {page}
                        </Button>
                      ))}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.min(Math.ceil(chapterMembers.length / membersPerPage), prev + 1))}
                      disabled={currentPage === Math.ceil(chapterMembers.length / membersPerPage) || loading}
                      className="h-8 px-3 text-xs"
                    >
                      Next
                      <ChevronRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </div>
                )}
                <div className="flex space-x-2">
                  <Button onClick={() => setShowBulkAssignDues(true)} variant="outline">
                    <Users className="h-4 w-4 mr-2" />
                    Bulk Assign Dues
                  </Button>
                  <Button onClick={() => setShowAssignDues(true)} variant="outline">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Assign Dues
                  </Button>
                </div>
              </div>
            </div>

            {/* Mobile Layout */}
            <div className="sm:hidden">
              <CardTitle className="text-lg mb-3 text-primary-900">All Chapter Members ({chapterMembers.length})</CardTitle>
              <div className="flex space-x-2">
                <Button 
                  onClick={() => setShowBulkAssignDues(true)} 
                  variant="outline"
                  className="flex-1 justify-center text-sm py-2"
                >
                  <Users className="h-4 w-4 mr-2" />
                  Bulk Assign
                </Button>
                <Button 
                  onClick={() => setShowAssignDues(true)} 
                  variant="outline"
                  className="flex-1 justify-center text-sm py-2"
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Assign Dues
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-2 sm:pt-6">
            {chapterMembers.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Users className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                <p className="text-lg font-medium mb-2">No chapter members</p>
                <p className="text-sm">No active members found in this chapter.</p>
              </div>
            ) : (
              <>
                {/* Calculate pagination */}
                {(() => {
                  const totalPages = Math.ceil(chapterMembers.length / membersPerPage);
                  const startIndex = (currentPage - 1) * membersPerPage;
                  const endIndex = startIndex + membersPerPage;
                  const paginatedMembers = chapterMembers.slice(startIndex, endIndex);
                  
                  return (
                    <>
                      {/* Desktop Table */}
                      <div className="hidden md:block">
                        <div className="overflow-x-auto">
                          <div className="border border-gray-200 rounded-lg">
                            <table className="w-full border-collapse">
                              <thead className="sticky top-0 bg-gray-50 z-10">
                                <tr className="border-b">
                                  <th className="text-left p-3 font-medium text-sm bg-gray-50">Member</th>
                                  <th className="text-left p-3 font-medium text-sm bg-gray-50">Amount</th>
                                  <th className="text-left p-3 font-medium text-sm bg-gray-50">Last Assigned</th>
                                  <th className="text-left p-3 font-medium text-sm bg-gray-50">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {paginatedMembers.map((member) => (
                                  <tr key={member.id} className="border-b hover:bg-gray-50 whitespace-nowrap">
                                    <td className="p-3 max-w-[250px]">
                                      <div>
                                        <p className="font-medium truncate" title={member.full_name}>{member.full_name}</p>
                                        <p className="text-sm text-gray-600 truncate" title={member.email}>{member.email}</p>
                                      </div>
                                    </td>
                                    <td className="p-3">
                                      <p className="font-medium">${member.current_dues_amount.toFixed(2)}</p>
                                    </td>
                                    <td className="p-3">
                                      <p className="text-sm text-gray-600">
                                        {member.last_dues_assignment_date 
                                          ? new Date(member.last_dues_assignment_date).toLocaleDateString()
                                          : 'Never'
                                        }
                                      </p>
                                    </td>
                                    <td className="p-3">
                                      <Button 
                                        size="sm" 
                                        variant="outline"
                                        onClick={() => {
                                          setNewAssignment({
                                            memberId: member.id,
                                            amount: member.current_dues_amount,
                                            status: 'required',
                                            notes: ''
                                          });
                                          setShowAssignDues(true);
                                        }}
                                        className="hover:bg-green-50 hover:text-green-600"
                                      >
                                        <DollarSign className="h-4 w-4 mr-1 flex-shrink-0" />
                                        Assign
                                      </Button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                        
                        {/* Pagination Footer */}
                        {totalPages > 1 && (
                          <div className="mt-4 flex items-center justify-between">
                            <div className="text-sm text-gray-600">
                              <p>Showing {startIndex + 1} to {Math.min(endIndex, chapterMembers.length)} of {chapterMembers.length} members</p>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1 || loading}
                                className="h-8 px-3 text-xs"
                              >
                                <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                                Previous
                              </Button>
                              <div className="flex items-center space-x-1">
                                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                                  <Button
                                    key={page}
                                    variant={currentPage === page ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setCurrentPage(page)}
                                    className={`h-8 w-8 p-0 text-xs flex-shrink-0 ${
                                      currentPage === page
                                        ? 'bg-brand-primary text-white hover:bg-brand-primary-hover'
                                        : 'hover:bg-gray-50'
                                    }`}
                                  >
                                    {page}
                                  </Button>
                                ))}
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                disabled={currentPage === totalPages || loading}
                                className="h-8 px-3 text-xs"
                              >
                                Next
                                <ChevronRight className="h-3.5 w-3.5 ml-1" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Mobile Card Layout */}
                      <div className="md:hidden space-y-3">
                        {paginatedMembers.map((member) => (
                    <div key={member.id} className="border border-gray-200 rounded-lg p-3 space-y-2">
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm text-gray-900 truncate" title={member.full_name}>
                            {member.full_name}
                          </h4>
                          <p className="text-xs text-gray-600 mt-1 truncate" title={member.email}>
                            {member.email}
                          </p>
                        </div>
                        <div className="flex flex-col items-end space-y-1 ml-2">
                          <p className="text-sm font-medium text-gray-900">
                            ${member.current_dues_amount.toFixed(2)}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                        <div className="text-xs text-gray-600">
                          <span>
                            Last assigned: {member.last_dues_assignment_date 
                              ? new Date(member.last_dues_assignment_date).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric'
                                })
                              : 'Never'
                            }
                          </span>
                        </div>
                        
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => {
                            setNewAssignment({
                              memberId: member.id,
                              amount: member.current_dues_amount,
                              status: 'required',
                              notes: ''
                            });
                            setShowAssignDues(true);
                          }}
                          className="h-7 px-2 text-xs hover:bg-green-50 hover:text-green-600"
                        >
                          <DollarSign className="h-3 w-3 mr-1 flex-shrink-0" />
                          Assign
                        </Button>
                      </div>
                    </div>
                  ))}
                  
                        {/* Mobile Pagination */}
                        {totalPages > 1 && (
                          <div className="flex items-center justify-between mt-4 pt-4 border-t">
                            <div className="text-xs text-gray-600">
                              <p>Showing {startIndex + 1} to {Math.min(endIndex, chapterMembers.length)} of {chapterMembers.length}</p>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1 || loading}
                                className="h-8 px-2 text-xs"
                              >
                                <ChevronLeft className="h-3 w-3" />
                              </Button>
                              <div className="flex items-center space-x-1">
                                {Array.from({ length: totalPages }, (_, i) => i + 1).slice(0, 5).map((page) => (
                                  <Button
                                    key={page}
                                    variant={currentPage === page ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setCurrentPage(page)}
                                    className={`h-8 w-8 p-0 text-xs flex-shrink-0 ${
                                      currentPage === page
                                        ? 'bg-brand-primary text-white hover:bg-brand-primary-hover'
                                        : 'hover:bg-gray-50'
                                    }`}
                                  >
                                    {page}
                                  </Button>
                                ))}
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                disabled={currentPage === totalPages || loading}
                                className="h-8 px-2 text-xs"
                              >
                                <ChevronRight className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Create Cycle Dialog */}
      <Dialog open={showCreateCycle} onOpenChange={setShowCreateCycle}>
        <DialogContent className="bg-white border border-gray-200 shadow-lg">
          <DialogHeader>
            <DialogTitle>Create New Dues Cycle</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Cycle Name</Label>
              <Input
                id="name"
                value={newCycle.name}
                onChange={(e) => setNewCycle({ ...newCycle, name: e.target.value })}
                placeholder="e.g., Spring 2024"
              />
            </div>
            <div>
              <Label htmlFor="amount">Base Amount ($)</Label>
              <Input
                id="amount"
                type="number"
                value={newCycle.base_amount}
                onChange={(e) => setNewCycle({ ...newCycle, base_amount: parseFloat(e.target.value) || 0 })}
                placeholder="150.00"
              />
            </div>
            <div>
              <Label htmlFor="dueDate">Due Date</Label>
              <Input
                id="dueDate"
                type="date"
                value={newCycle.due_date}
                onChange={(e) => setNewCycle({ ...newCycle, due_date: e.target.value })}
              />
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="paymentPlans"
                checked={newCycle.allow_payment_plans}
                onChange={(e) => setNewCycle({ ...newCycle, allow_payment_plans: e.target.checked })}
              />
              <Label htmlFor="paymentPlans">Allow Payment Plans</Label>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-end space-y-3 sm:space-y-0 sm:space-x-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreateCycle(false)}
                className="rounded-full bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300 h-12 sm:h-10 w-full sm:w-auto text-base sm:text-sm"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleCreateCycle}
                className="rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300 h-12 sm:h-10 w-full sm:w-auto text-base sm:text-sm"
              >
                Create Cycle
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign Dues Dialog */}
      {showAssignDues && typeof window !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999]">
          {/* Backdrop - click to close */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
            onClick={() => setShowAssignDues(false)}
          />
          
          {/* Modal container - centers content */}
          <div className="relative flex items-center justify-center min-h-screen p-4">
            {/* Modal - styled like TaskModal */}
            <div 
              className="relative transform rounded-lg bg-white text-left shadow-xl transition-all w-full max-w-[95vw] sm:max-w-lg flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header - Fixed, styled like TaskModal */}
              <div className="rounded-t-lg bg-white px-4 pt-4 pb-3 sm:px-6 sm:pt-4 sm:pb-3 flex-shrink-0 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium leading-6 text-gray-900">
                    Assign Dues to Member
                  </h3>
                  <button
                    onClick={() => setShowAssignDues(false)}
                    className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 p-1"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Body - Scrollable */}
              <div className="bg-white px-4 pt-3 pb-4 sm:px-6 sm:pt-4 sm:pb-4 flex-1 overflow-y-auto">
                <div className="space-y-4 sm:space-y-3">
                  <div>
                    <Label htmlFor="member" className="block text-sm font-medium text-gray-700 mb-1">
                      Select Member
                    </Label>
                    <Select
                      value={newAssignment.memberId}
                      onValueChange={(value) => setNewAssignment({ ...newAssignment, memberId: value })}
                    >
                      <SelectItem value="">Choose a member</SelectItem>
                      {chapterMembers.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.full_name} ({member.email})
                        </SelectItem>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-1">
                      Dues Amount ($)
                    </Label>
                    <Input
                      id="amount"
                      type="number"
                      value={newAssignment.amount}
                      onChange={(e) => setNewAssignment({ ...newAssignment, amount: parseFloat(e.target.value) || 0 })}
                      placeholder="150.00"
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-brand-primary focus:ring-brand-primary text-sm h-9"
                    />
                  </div>
                  <div>
                    <Label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
                      Status
                    </Label>
                    <Select
                      value={newAssignment.status}
                      onValueChange={(value: any) => setNewAssignment({ ...newAssignment, status: value })}
                    >
                      <SelectItem value="required">Required</SelectItem>
                      <SelectItem value="exempt">Exempt</SelectItem>
                      <SelectItem value="reduced">Reduced</SelectItem>
                      <SelectItem value="waived">Waived</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                      Notes
                    </Label>
                    <Textarea
                      id="notes"
                      value={newAssignment.notes}
                      onChange={(e) => setNewAssignment({ ...newAssignment, notes: e.target.value })}
                      placeholder="Optional notes about this assignment"
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-brand-primary focus:ring-brand-primary text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Footer - Fixed, styled like TaskModal */}
              <div className="rounded-b-lg bg-gray-50 px-4 py-2 sm:px-6 sm:py-3 flex-shrink-0 border-t border-gray-200">
                <div className="flex flex-col sm:flex-row sm:justify-end space-y-3 sm:space-y-0 sm:space-x-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowAssignDues(false)}
                    className="rounded-full bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300 h-12 sm:h-10 w-full sm:w-auto text-base sm:text-sm"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleAssignDues}
                    className="rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300 h-12 sm:h-10 w-full sm:w-auto text-base sm:text-sm"
                  >
                    Assign Dues
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Bulk Assign Dues Dialog */}
      {showBulkAssignDues && typeof window !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999]">
          {/* Backdrop - click to close */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
            onClick={() => setShowBulkAssignDues(false)}
          />
          
          {/* Modal container - centers content */}
          <div className="relative flex items-center justify-center min-h-screen p-4">
            {/* Modal - styled like TaskModal */}
            <div 
              className="relative transform rounded-lg bg-white text-left shadow-xl transition-all w-full max-w-[95vw] sm:max-w-4xl max-h-[90vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header - Fixed, styled like TaskModal */}
              <div className="rounded-t-lg bg-white px-4 pt-4 pb-3 sm:px-6 sm:pt-4 sm:pb-3 flex-shrink-0 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium leading-6 text-gray-900">
                    Assign Dues to Members
                  </h3>
                  <button
                    onClick={() => setShowBulkAssignDues(false)}
                    className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 p-1"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Scrollable Content Area - flex-1 for remaining space */}
              <div className="bg-white px-4 pt-3 pb-4 sm:px-6 sm:pt-4 sm:pb-4 flex-1 overflow-y-auto">
                <div className="space-y-4 sm:space-y-3">
                  {/* Select All Header */}
                  <div className="flex items-center space-x-2 p-3 bg-white rounded-lg border border-gray-200">
                    <Checkbox
                      id="selectAll"
                      checked={bulkAssignment.selectedMembers.length === chapterMembers.length}
                      onCheckedChange={handleSelectAllMembers}
                    />
                    <Label htmlFor="selectAll" className="font-medium">
                      Select All Members ({chapterMembers.length})
                    </Label>
                  </div>
                  
                  {/* Members Table - with internal scrolling */}
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="max-h-[400px] overflow-y-auto">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-white">
                          <TableRow className="bg-white border-b border-gray-200 hover:bg-white">
                            <TableHead className="bg-white border-r border-gray-200 w-12 sticky top-0">
                              <div className="flex justify-center items-center h-full p-2">
                                <Checkbox
                                  checked={bulkAssignment.selectedMembers.length === chapterMembers.length}
                                  onCheckedChange={handleSelectAllMembers}
                                  indeterminate={bulkAssignment.selectedMembers.length > 0 && bulkAssignment.selectedMembers.length < chapterMembers.length}
                                  className="data-[state=checked]:bg-brand-primary data-[state=checked]:border-brand-primary"
                                />
                              </div>
                            </TableHead>
                            <TableHead className="bg-white border-r border-gray-200 sticky top-0">
                              <span className="font-medium text-gray-900">NAME</span>
                            </TableHead>
                            <TableHead className="bg-white sticky top-0">
                              <span className="font-medium text-gray-900">EMAIL</span>
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {chapterMembers.map((member) => (
                            <TableRow 
                              key={member.id} 
                              className={`border-b border-gray-200 hover:bg-gray-50 transition-colors ${
                                bulkAssignment.selectedMembers.includes(member.id) ? 'bg-primary-50 border-primary-200' : ''
                              }`}
                            >
                              {/* Checkbox Column */}
                              <TableCell className="bg-white border-r border-gray-200 w-12">
                                <div className="flex justify-center items-center h-full p-2">
                                  <Checkbox
                                    checked={bulkAssignment.selectedMembers.includes(member.id)}
                                    onCheckedChange={(checked) => handleMemberSelection(member.id, checked as boolean)}
                                    className="data-[state=checked]:bg-brand-primary data-[state=checked]:border-brand-primary"
                                  />
                                </div>
                              </TableCell>
                              
                              {/* Name Column */}
                              <TableCell className="bg-white border-r border-gray-200">
                                <div className="flex items-start space-x-3">
                                  {/* Avatar */}
                                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-primary to-brand-primary flex items-center justify-center flex-shrink-0">
                                    <span className="text-white text-sm font-medium">
                                      {member.full_name?.[0] || ''}{member.full_name?.split(' ')[1]?.[0] || ''}
                                    </span>
                                  </div>
                                  
                                  {/* Name */}
                                  <div className="flex-1 min-w-0">
                                    <span className="font-medium text-gray-900 break-words">
                                      {member.full_name}
                                    </span>
                                  </div>
                                </div>
                              </TableCell>
                              
                              {/* Email Column */}
                              <TableCell className="bg-white">
                                <span className="text-gray-900 text-sm">{member.email}</span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  {/* Assignment Details */}
                  <div className="border-t pt-4 space-y-4">
                    {/* Add Cycle Selection */}
                    <div>
                      <Label htmlFor="bulkCycle" className="block text-sm font-medium text-gray-700 mb-1">
                        Dues Cycle
                      </Label>
                      <Select 
                        value={bulkAssignment.cycleId || ''} 
                        onValueChange={(value: string) => setBulkAssignment({ ...bulkAssignment, cycleId: value })}
                        placeholder="Select a dues cycle"
                      >
                        <SelectItem value="">Select a dues cycle</SelectItem>
                        {cycles.map((cycle) => (
                          <SelectItem key={cycle.id} value={cycle.id}>
                            {cycle.name} - ${cycle.base_amount} (Due: {new Date(cycle.due_date).toLocaleDateString()})
                          </SelectItem>
                        ))}
                      </Select>
                      {cycles.length === 0 && (
                        <p className="text-sm text-red-600 mt-1">
                          No dues cycles available. Please create a cycle first.
                        </p>
                      )}
                    </div>
                    
                    <div>
                      <Label htmlFor="bulkAmount" className="block text-sm font-medium text-gray-700 mb-1">
                        Dues Amount ($)
                      </Label>
                      <Input
                        id="bulkAmount"
                        type="number"
                        step="5"
                        min="0"
                        value={bulkAssignment.amount}
                        onChange={(e) => setBulkAssignment({ ...bulkAssignment, amount: parseFloat(e.target.value) || 0 })}
                        placeholder="150.00"
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-brand-primary focus:ring-brand-primary text-sm h-9"
                      />
                    </div>
                    <div>
                      <Label htmlFor="bulkStatus" className="block text-sm font-medium text-gray-700 mb-1">
                        Status
                      </Label>
                      <Select 
                        value={bulkAssignment.status} 
                        onValueChange={(value: string) => setBulkAssignment({ ...bulkAssignment, status: value as 'required' | 'exempt' | 'reduced' | 'waived' })}
                        placeholder="Select status"
                      >
                        <SelectItem value="">Select status</SelectItem>
                        <SelectItem value="required">Required</SelectItem>
                        <SelectItem value="exempt">Exempt</SelectItem>
                        <SelectItem value="reduced">Reduced</SelectItem>
                        <SelectItem value="waived">Waived</SelectItem>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="bulkNotes" className="block text-sm font-medium text-gray-700 mb-1">
                        Notes
                      </Label>
                      <Textarea
                        id="bulkNotes"
                        value={bulkAssignment.notes}
                        onChange={(e) => setBulkAssignment({ ...bulkAssignment, notes: e.target.value })}
                        placeholder="Optional notes about this assignment"
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-brand-primary focus:ring-brand-primary text-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Persistent Footer - styled like TaskModal */}
              <div className="rounded-b-lg bg-gray-50 px-4 py-2 sm:px-6 sm:py-3 flex-shrink-0 border-t border-gray-200">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-3 sm:space-y-0">
                  <p className="text-sm text-gray-600">
                    Selected: {bulkAssignment.selectedMembers.length} members
                  </p>
                  <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowBulkAssignDues(false)}
                      className="rounded-full bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300 h-12 sm:h-10 w-full sm:w-auto text-base sm:text-sm"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={handleBulkAssignDues}
                      disabled={bulkAssignment.selectedMembers.length === 0 || !bulkAssignment.cycleId}
                      className="rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300 h-12 sm:h-10 w-full sm:w-auto text-base sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Assign Dues to {bulkAssignment.selectedMembers.length} Members
                    </Button>
                  </div>
                </div>
              </div>
            </div>
        </div>
      </div>,
      document.body
      )}

      {/* Edit Assignment Dialog */}
      <Dialog open={showEditAssignment} onOpenChange={setShowEditAssignment}>
        <DialogContent className="bg-white border border-gray-200 shadow-lg">
          <DialogHeader>
            <DialogTitle>Edit Dues Assignment</DialogTitle>
          </DialogHeader>
          {selectedAssignment && (
            <div className="space-y-4">
              <div>
                <Label>Member</Label>
                <p className="text-sm text-gray-600">{selectedAssignment.user.full_name}</p>
              </div>
              <div>
                <Label htmlFor="editAmount">Amount Due ($)</Label>
                <Input
                  id="editAmount"
                  type="number"
                  value={selectedAssignment.amount_due}
                  onChange={(e) => setSelectedAssignment({
                    ...selectedAssignment,
                    amount_due: parseFloat(e.target.value) || 0
                  })}
                />
              </div>
              <div>
                <Label htmlFor="editStatus">Status</Label>
                <Select
                  value={selectedAssignment.status}
                  onValueChange={(value: any) => setSelectedAssignment({
                    ...selectedAssignment,
                    status: value
                  })}
                >
                  <SelectItem value="required">Required</SelectItem>
                  <SelectItem value="exempt">Exempt</SelectItem>
                  <SelectItem value="reduced">Reduced</SelectItem>
                  <SelectItem value="waived">Waived</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                </Select>
              </div>
              <div>
                <Label htmlFor="editNotes">Notes</Label>
                <Textarea
                  id="editNotes"
                  value={selectedAssignment.notes || ''}
                  onChange={(e) => setSelectedAssignment({
                    ...selectedAssignment,
                    notes: e.target.value
                  })}
                />
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-end space-y-3 sm:space-y-0 sm:space-x-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowEditAssignment(false)}
                  className="rounded-full bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300 h-12 sm:h-10 w-full sm:w-auto text-base sm:text-sm"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleEditAssignment}
                  className="rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300 h-12 sm:h-10 w-full sm:w-auto text-base sm:text-sm"
                >
                  Update Assignment
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}