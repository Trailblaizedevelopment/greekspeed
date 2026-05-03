'use client';
import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { DollarSign, Users, Download, Mail, Plus, Calendar, Edit, Eye, UserPlus, X, Lock, ChevronLeft, ChevronRight, Loader2, Landmark, RefreshCw } from "lucide-react";
import { toast } from 'react-toastify';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createPortal } from 'react-dom';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectItem, SelectContent } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useProfile } from "@/lib/contexts/ProfileContext";
import { useFeatureFlag } from '@/lib/hooks/useFeatureFlag';
import { useCrowdedChapterBalance } from '@/lib/hooks/useCrowdedChapterBalance';
import { supabase } from '@/lib/supabase/client';
import { QuickActions, QuickAction } from '@/components/features/dashboard/dashboards/ui/QuickActions';
import { CreateDuesCycleWizard } from '@/components/features/dashboard/admin/CreateDuesCycleWizard';
import { CrowdedCollectionsAdminPanel } from '@/components/features/dashboard/admin/CrowdedCollectionsAdminPanel';
import { DonationCampaignsPanel } from '@/components/features/dashboard/admin/DonationCampaignsPanel';
import { StripeChapterDonationsConnectCard } from '@/components/features/dashboard/admin/StripeChapterDonationsConnectCard';
import { CrowdedRecentActivityCard } from '@/components/features/dashboard/admin/CrowdedRecentActivityCard';
import type { CrowdedContactSyncSummary } from '@/types/crowded';

interface DuesCycle {
  id: string;
  name: string;
  base_amount: number;
  due_date: string;
  close_date: string | null;
  status: string;
  allow_payment_plans: boolean;
  created_at: string;
  crowded_collection_id?: string | null;
  description?: string | null;
}

interface DuesAssignment {
  id: string;
  dues_cycle_id: string;
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

interface MemberCrowdedSyncResult {
  tone: 'success' | 'warning' | 'error';
  message: string;
}

interface MemberCrowdedContactState {
  status: 'matched' | 'no_match' | 'no_profile_email' | 'ambiguous';
  contactId?: string;
}

/**
 * Default cycle for new assignments: newest active cycle, else newest cycle.
 * Caller should load `cycles` with `created_at` descending so "first active" is the newest active.
 */
function getDefaultAssignmentCycleId(cyclesList: DuesCycle[]): string {
  if (!cyclesList.length) return '';
  const firstActive = cyclesList.find((c) => c.status === 'active');
  if (firstActive) return firstActive.id;
  return cyclesList[0].id;
}

function getCycleBaseAmount(cyclesList: DuesCycle[], cycleId: string): number | null {
  const c = cyclesList.find((x) => x.id === cycleId);
  if (!c) return null;
  const n = Number(c.base_amount);
  return Number.isFinite(n) ? n : null;
}

/** Suggested reduced dues: half of base, capped strictly below base. */
function suggestedReducedAmount(base: number): number {
  if (!Number.isFinite(base) || base <= 0) return 0;
  if (base <= 1) return Math.round(base * 0.5 * 100) / 100;
  return Math.min(Math.round((base / 2) * 100) / 100, base - 0.01);
}

function formatCrowdedProductLabel(product: string | null | undefined): string {
  const value = (product ?? '').trim().toLowerCase();
  switch (value) {
    case 'checking':
      return 'Checking';
    case 'perdiem':
      return 'Per Diem';
    case 'wallet':
      return 'Wallet';
    default:
      return value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Unknown';
  }
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
  const { enabled: crowdedIntegrationEnabled, loading: crowdedFlagLoading } =
    useFeatureFlag('crowded_integration_enabled');
  const { enabled: crowdedContactSyncEnabled, loading: crowdedContactSyncFlagLoading } =
    useFeatureFlag('crowded_contact_sync_enabled');
  const { enabled: financialToolsEnabled, loading: financialToolsFlagLoading } =
    useFeatureFlag('financial_tools_enabled');
  const { enabled: stripeDonationsEnabled, loading: stripeDonationsFlagLoading } =
    useFeatureFlag('stripe_donations_enabled');
  const crowdedBalanceFetchEnabled =
    !crowdedFlagLoading && crowdedIntegrationEnabled && Boolean(profile?.chapter_id);
  const crowdedBalanceQuery = useCrowdedChapterBalance(
    profile?.chapter_id ?? null,
    crowdedBalanceFetchEnabled
  );
  const [selectedTab, setSelectedTab] = useState("overview");
  const [cycles, setCycles] = useState<DuesCycle[]>([]);
  const [assignments, setAssignments] = useState<DuesAssignment[]>([]);
  const [chapterMembers, setChapterMembers] = useState<ChapterMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const membersPerPage = 10;
  const [showCreateCycleWizard, setShowCreateCycleWizard] = useState(false);
  const [showAssignDues, setShowAssignDues] = useState(false);
  const [showBulkAssignDues, setShowBulkAssignDues] = useState(false);
  const [showEditAssignment, setShowEditAssignment] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<DuesAssignment | null>(null);
  const [newAssignment, setNewAssignment] = useState({
    memberId: '',
    cycleId: '' as string,
    status: 'required' as
      | 'required'
      | 'exempt'
      | 'reduced'
      | 'waived'
      | 'paid',
    notes: '',
    useCustomAmount: false,
    customAmount: 0,
  });
  const [bulkAssignment, setBulkAssignment] = useState({
    selectedMembers: [] as string[],
    cycleId: '' as string,
    status: 'required' as 'required' | 'exempt' | 'reduced' | 'waived',
    notes: '',
    useCustomAmount: false,
    customAmount: 0,
  });
  const [linkingCrowdedCycleId, setLinkingCrowdedCycleId] = useState<string | null>(null);
  const [syncingCrowdedMemberId, setSyncingCrowdedMemberId] = useState<string | null>(null);
  const [memberCrowdedSyncResults, setMemberCrowdedSyncResults] = useState<
    Record<string, MemberCrowdedSyncResult>
  >({});
  const [memberCrowdedContactStates, setMemberCrowdedContactStates] = useState<
    Record<string, MemberCrowdedContactState>
  >({});
  const crowdedContactStatusEnabled =
    crowdedIntegrationEnabled &&
    !crowdedFlagLoading &&
    Boolean(profile?.chapter_id?.trim());
  const rowLevelCrowdedSyncEnabled =
    crowdedContactSyncEnabled &&
    !crowdedContactSyncFlagLoading &&
    crowdedIntegrationEnabled &&
    !crowdedFlagLoading &&
    Boolean(profile?.chapter_id?.trim());

  const openAssignDuesModal = useCallback(
    (preset?: { memberId?: string }) => {
      const cycleId = getDefaultAssignmentCycleId(cycles);
      setNewAssignment({
        memberId: preset?.memberId ?? '',
        cycleId,
        status: 'required',
        notes: '',
        useCustomAmount: false,
        customAmount: 0,
      });
      setShowAssignDues(true);
    },
    [cycles]
  );

  const openBulkAssignDuesModal = useCallback(() => {
    setBulkAssignment({
      selectedMembers: [],
      cycleId: getDefaultAssignmentCycleId(cycles),
      status: 'required',
      notes: '',
      useCustomAmount: false,
      customAmount: 0,
    });
    setShowBulkAssignDues(true);
  }, [cycles]);

  const singleAssignSubmitDisabled = useMemo(() => {
    const { cycleId, memberId, status, useCustomAmount, customAmount } = newAssignment;
    if (!cycleId.trim() || !memberId.trim()) return true;
    const base = getCycleBaseAmount(cycles, cycleId);
    if (status === 'exempt' || status === 'waived') return false;
    if (status === 'reduced') {
      return !(
        base != null &&
        base > 0 &&
        Number.isFinite(customAmount) &&
        customAmount > 0 &&
        customAmount < base
      );
    }
    if (useCustomAmount) {
      if (!Number.isFinite(customAmount) || customAmount <= 0) return true;
      if (base != null && customAmount > base * 2) return true;
      return false;
    }
    return !(base != null && base > 0);
  }, [newAssignment, cycles]);

  const bulkAssignSubmitDisabled = useMemo(() => {
    const { cycleId, selectedMembers, status, useCustomAmount, customAmount } = bulkAssignment;
    if (!cycleId.trim() || selectedMembers.length === 0) return true;
    const base = getCycleBaseAmount(cycles, cycleId);
    if (status === 'exempt' || status === 'waived') return false;
    if (status === 'reduced') {
      return !(
        base != null &&
        base > 0 &&
        Number.isFinite(customAmount) &&
        customAmount > 0 &&
        customAmount < base
      );
    }
    if (useCustomAmount) {
      if (!Number.isFinite(customAmount) || customAmount <= 0) return true;
      if (base != null && customAmount > base * 2) return true;
      return false;
    }
    return !(base != null && base > 0);
  }, [bulkAssignment, cycles]);

  useEffect(() => {
    if (profile?.chapter_id) {
      loadDuesData();
      loadChapterMembers();
    }
  }, [profile?.chapter_id]);

  useEffect(() => {
    if (selectedTab !== "members" || !crowdedContactStatusEnabled) {
      return;
    }

    const chapterId = profile?.chapter_id?.trim();
    if (!chapterId) return;

    let cancelled = false;

    const loadMemberCrowdedStatuses = async () => {
      try {
        const response = await fetch(`/api/chapters/${chapterId}/crowded/contacts/status`, {
          method: 'GET',
          credentials: 'include',
        });

        const json = (await response.json().catch(() => null)) as
          | {
              ok?: boolean;
              members?: Array<{
                memberId: string;
                status: MemberCrowdedContactState['status'];
                contactId?: string;
              }>;
              error?: string;
            }
          | null;

        if (!response.ok || !json?.ok || !Array.isArray(json.members)) {
          console.error('Could not preload Crowded contact statuses:', json?.error || response.status);
          return;
        }

        if (cancelled) return;

        const next: Record<string, MemberCrowdedContactState> = {};
        for (const row of json.members) {
          next[row.memberId] = {
            status: row.status,
            ...(row.contactId ? { contactId: row.contactId } : {}),
          };
        }
        setMemberCrowdedContactStates(next);
      } catch (error) {
        if (!cancelled) {
          console.error('Could not preload Crowded contact statuses:', error);
        }
      }
    };

    void loadMemberCrowdedStatuses();

    return () => {
      cancelled = true;
    };
  }, [selectedTab, crowdedContactStatusEnabled, profile?.chapter_id]);

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

  const handleLinkCrowdedCollection = async (cycle: DuesCycle) => {
    const chapterId = profile?.chapter_id?.trim();
    if (!chapterId) {
      alert('Your profile is not linked to a chapter.');
      return;
    }
    const base = Number(cycle.base_amount);
    if (!Number.isFinite(base) || base < 0) {
      alert('This cycle has an invalid base amount; fix it before linking Crowded.');
      return;
    }
    const requestedAmount = Math.max(1, Math.round(base * 100));
    setLinkingCrowdedCycleId(cycle.id);
    try {
      const createRes = await fetch(`/api/chapters/${chapterId}/crowded/collections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: cycle.name || 'Dues',
          requestedAmount,
          duesCycleId: cycle.id,
        }),
      });
      const createJson = (await createRes.json().catch(() => null)) as {
        data?: { id?: string };
        error?: string;
      } | null;
      if (!createRes.ok) {
        console.error('Crowded create collection failed:', createRes.status, createJson);
        alert(createJson?.error || `Could not create Crowded collection (${createRes.status})`);
        return;
      }
      const collectionId = createJson?.data?.id;
      if (!collectionId || typeof collectionId !== 'string') {
        alert('Crowded did not return a collection id. Check server logs.');
        return;
      }
      await loadDuesData();
    } catch (e) {
      console.error('Link Crowded collection error:', e);
      alert('Could not link Crowded collection. Check your connection and try again.');
    } finally {
      setLinkingCrowdedCycleId(null);
    }
  };


  const handleAssignDues = async () => {
    if (!newAssignment.cycleId.trim()) {
      alert('Please select a dues cycle.');
      return;
    }
    if (!newAssignment.memberId.trim()) {
      alert('Please select a member.');
      return;
    }
    try {
      const st = newAssignment.status;
      const body: Record<string, unknown> = {
        memberId: newAssignment.memberId,
        cycleId: newAssignment.cycleId,
        status: st,
        notes: newAssignment.notes,
      };
      if (st === 'reduced') {
        body.useCustomAmount = true;
        body.customAmount = newAssignment.customAmount;
      } else if (st === 'exempt' || st === 'waived') {
        // Server resolves to $0 from cycle base_amount rules
      } else if (newAssignment.useCustomAmount) {
        body.useCustomAmount = true;
        body.customAmount = newAssignment.customAmount;
      } else {
        body.useCustomAmount = false;
      }

      const response = await fetch('/api/dues/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        setShowAssignDues(false);
        setNewAssignment({
          memberId: '',
          cycleId: '',
          status: 'required',
          notes: '',
          useCustomAmount: false,
          customAmount: 0,
        });
        loadDuesData();
        loadChapterMembers();
      } else {
        const errBody = (await response.json().catch(() => null)) as { error?: string; code?: string } | null;
        if (response.status === 409 || errBody?.code === 'DUPLICATE_DUES_ASSIGNMENT') {
          const message = errBody?.error || 'This member already has dues assigned for this cycle.';
          toast.warn(message);
          alert(message);
          return;
        }
        alert(errBody?.error || `Could not assign dues (${response.status})`);
      }
    } catch (error) {
      console.error('Error assigning dues:', error);
      alert('Could not assign dues. Check your connection and try again.');
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
      
      const st = bulkAssignment.status;
      const buildBody = (memberId: string): Record<string, unknown> => {
        const body: Record<string, unknown> = {
          memberId,
          cycleId: bulkAssignment.cycleId,
          status: st,
          notes: bulkAssignment.notes,
        };
        if (st === 'reduced') {
          body.useCustomAmount = true;
          body.customAmount = bulkAssignment.customAmount;
        } else if (st === 'exempt' || st === 'waived') {
          // amount from server rules
        } else if (bulkAssignment.useCustomAmount) {
          body.useCustomAmount = true;
          body.customAmount = bulkAssignment.customAmount;
        } else {
          body.useCustomAmount = false;
        }
        return body;
      };

      const promises = bulkAssignment.selectedMembers.map((memberId) =>
        fetch('/api/dues/assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildBody(memberId)),
        })
      );

      const responses = await Promise.all(promises);
      const allSuccessful = responses.every((response) => response.ok);

      if (allSuccessful) {
        setShowBulkAssignDues(false);
        setBulkAssignment({
          selectedMembers: [],
          cycleId: '',
          status: 'required',
          notes: '',
          useCustomAmount: false,
          customAmount: 0,
        });
        loadDuesData();
        loadChapterMembers();
        // Bulk dues assignment completed successfully
      } else {
        console.error('❌ Some bulk assignments failed');
        const firstErr = await (async () => {
          for (const res of responses) {
            if (!res.ok) {
              const j = (await res.json().catch(() => null)) as { error?: string } | null;
              return j?.error || `HTTP ${res.status}`;
            }
          }
          return 'Unknown error';
        })();
        alert(`Some assignments failed: ${firstErr}`);
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

  const handleSyncMemberToCrowded = useCallback(async (member: ChapterMember) => {
    const chapterId = profile?.chapter_id?.trim();
    if (!chapterId) {
      alert('Your profile is not linked to a chapter.');
      return;
    }
    if (!rowLevelCrowdedSyncEnabled) {
      alert('Crowded contact sync is not enabled for this chapter.');
      return;
    }

    setSyncingCrowdedMemberId(member.id);
    setMemberCrowdedSyncResults((prev) => {
      const next = { ...prev };
      delete next[member.id];
      return next;
    });

    try {
      const response = await fetch(`/api/chapters/${chapterId}/crowded/contacts/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ memberIds: [member.id] }),
      });

      const json = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            summary?: CrowdedContactSyncSummary;
            error?: string;
          }
        | null;

      if (!response.ok || !json?.ok || !json.summary) {
        setMemberCrowdedSyncResults((prev) => ({
          ...prev,
          [member.id]: {
            tone: 'error',
            message: json?.error || `Crowded sync failed (${response.status})`,
          },
        }));
        return;
      }

      const summary = json.summary;
      const unverifiedForMember = summary.unverifiedCreates?.find((u) => u.profileId === member.id);

      let result: MemberCrowdedSyncResult;
      if (summary.errors.length > 0) {
        result = {
          tone: 'error',
          message: summary.errors[0] || 'Crowded API error',
        };
      } else if (unverifiedForMember) {
        result = {
          tone: 'warning',
          message:
            'Another contact may exist with similar data in Crowded — check for duplicates then try again.',
        };
        toast.warn(result.message);
      } else if (summary.created > 0) {
        result = {
          tone: 'success',
          message: 'Crowded contact created',
        };
      } else if (summary.alreadyInCrowded > 0) {
        result = {
          tone: 'success',
          message: 'Already exists in Crowded',
        };
      } else if (summary.skippedNoEmail > 0) {
        result = {
          tone: 'warning',
          message: 'Skipped: no email',
        };
      } else if (summary.skippedNoName > 0) {
        result = {
          tone: 'warning',
          message: 'Skipped: no name',
        };
      } else if (summary.skippedDuplicateEmailInProfiles > 0) {
        result = {
          tone: 'warning',
          message: 'Skipped: duplicate profile email',
        };
      } else {
        result = {
          tone: 'warning',
          message: 'No sync change reported',
        };
      }

      setMemberCrowdedSyncResults((prev) => ({
        ...prev,
        [member.id]: result,
      }));
      if (!unverifiedForMember && (summary.created > 0 || summary.alreadyInCrowded > 0)) {
        setMemberCrowdedContactStates((prev) => ({
          ...prev,
          [member.id]: {
            status: 'matched',
            ...(prev[member.id]?.contactId ? { contactId: prev[member.id]?.contactId } : {}),
          },
        }));
      } else if (summary.skippedNoEmail > 0) {
        setMemberCrowdedContactStates((prev) => ({
          ...prev,
          [member.id]: { status: 'no_profile_email' },
        }));
      }
    } catch (error) {
      console.error('Crowded member sync failed:', error);
      setMemberCrowdedSyncResults((prev) => ({
        ...prev,
        [member.id]: {
          tone: 'error',
          message: 'Network error syncing member',
        },
      }));
    } finally {
      setSyncingCrowdedMemberId(null);
    }
  }, [profile?.chapter_id, rowLevelCrowdedSyncEnabled]);

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
      onClick: () => openBulkAssignDuesModal(),
      className: 'w-full justify-start text-sm whitespace-nowrap rounded-full bg-white/80 backdrop-blur-md border border-primary-300/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300',
      variant: 'outline',
    },
    {
      id: 'assign-dues',
      label: 'Assign Dues',
      icon: UserPlus,
      onClick: () => openAssignDuesModal(),
      className: 'w-full justify-start text-sm whitespace-nowrap rounded-full bg-white/80 backdrop-blur-md border border-primary-300/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300',
      variant: 'outline',
    },
    {
      id: 'create-cycle',
      label: 'Create Dues Cycle',
      icon: Plus,
      onClick: () => setShowCreateCycleWizard(true),
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
      {!financialToolsFlagLoading &&
        !stripeDonationsFlagLoading &&
        financialToolsEnabled &&
        stripeDonationsEnabled &&
        profile?.chapter_id && (
          <Suspense
            fallback={
              <Card className="mb-4 sm:mb-6 bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20">
                <CardContent className="pt-6 text-sm text-gray-600 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-brand-primary" />
                  Loading Stripe Connect…
                </CardContent>
              </Card>
            }
          >
            <StripeChapterDonationsConnectCard chapterId={profile.chapter_id} />
          </Suspense>
        )}
      {!crowdedFlagLoading && crowdedIntegrationEnabled && profile?.chapter_id && (
        <Card className="mb-4 sm:mb-6 bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20">
          <CardHeader className="flex flex-col gap-2 border-b border-primary-100/30 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-primary-900 flex items-center gap-2">
                <Landmark className="h-5 w-5 text-brand-primary" />
                Chapter Account Balance
              </CardTitle>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 rounded-full"
              disabled={crowdedBalanceQuery.isFetching}
              onClick={() => void crowdedBalanceQuery.refetch()}
            >
              {crowdedBalanceQuery.isFetching ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Refreshing
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Refresh
                </>
              )}
            </Button>
          </CardHeader>
          <CardContent className="pt-4">
            {crowdedBalanceQuery.isPending && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Loader2 className="h-5 w-5 animate-spin text-brand-primary" />
                Loading balance from Crowded…
              </div>
            )}
            {crowdedBalanceQuery.isError && (
              <div className="rounded-lg border border-red-200 bg-red-50/80 p-3 text-sm text-red-800">
                <p className="font-medium">Could not load balance</p>
                <p className="mt-1">{crowdedBalanceQuery.error?.message ?? 'Something went wrong.'}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => void crowdedBalanceQuery.refetch()}
                >
                  Try again
                </Button>
              </div>
            )}
            {crowdedBalanceQuery.data && !crowdedBalanceQuery.data.ok && crowdedBalanceQuery.data.code === 'no_customer' && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-sm text-amber-900">
                <p className="font-medium">Banking not set up in Crowded</p>
                <p className="mt-1">{crowdedBalanceQuery.data.message}</p>
              </div>
            )}
            {crowdedBalanceQuery.data && !crowdedBalanceQuery.data.ok && crowdedBalanceQuery.data.code === 'api_error' && (
              <div className="rounded-lg border border-red-200 bg-red-50/80 p-3 text-sm text-red-800">
                <p className="font-medium">Crowded could not return balances</p>
                <p className="mt-1">{crowdedBalanceQuery.data.message}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => void crowdedBalanceQuery.refetch()}
                >
                  Try again
                </Button>
              </div>
            )}
            {crowdedBalanceQuery.data?.ok === true && (
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-600">Total balance</p>
                  <p className="text-3xl font-semibold text-primary-900 tabular-nums">
                    {new Intl.NumberFormat('en-US', {
                      style: 'currency',
                      currency: 'USD',
                    }).format(crowdedBalanceQuery.data.data.balanceUsd)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {crowdedBalanceQuery.data.data.accountCount === 0
                      ? 'No Crowded accounts returned yet.'
                      : `${crowdedBalanceQuery.data.data.accountCount} account${crowdedBalanceQuery.data.data.accountCount === 1 ? '' : 's'} · Updated ${new Date(crowdedBalanceQuery.data.data.syncedAt).toLocaleString()}`}
                  </p>
                </div>
                {crowdedBalanceQuery.data.data.dbSyncError ? (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-md p-2">
                    Balance shown from Crowded; saving to Trailblaize failed: {crowdedBalanceQuery.data.data.dbSyncError}
                  </p>
                ) : null}
                {crowdedBalanceQuery.data.data.accounts.length > 1 ? (
                  <ul className="text-sm text-gray-700 space-y-1 border-t border-gray-100 pt-3">
                    {crowdedBalanceQuery.data.data.accounts.map((a) => (
                      <li key={a.crowdedAccountId} className="flex justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{a.displayName}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            <Badge variant="outline" className="text-[11px]">
                              {formatCrowdedProductLabel(a.product)}
                            </Badge>
                            {a.status ? (
                              <Badge variant="outline" className="text-[11px]">
                                {a.status}
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                        <span className="tabular-nums shrink-0">
                          {new Intl.NumberFormat('en-US', {
                            style: 'currency',
                            currency: 'USD',
                          }).format(a.balanceUsd)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
        <>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-8">
          <div className="lg:col-span-2">
            {profile?.chapter_id?.trim() ? (
              <CrowdedRecentActivityCard
                chapterId={profile.chapter_id.trim()}
                enabled={!crowdedFlagLoading && crowdedIntegrationEnabled}
              />
            ) : null}
          </div>

          {/* Desktop Layout - Quick Actions Sidebar (1/3 width) */}
          <div className="hidden lg:block">
            <QuickActions 
              actions={quickActions}
            />
          </div>

          {/* Mobile Layout - Quick Actions */}
          <div className="lg:hidden">
            <QuickActions 
              actions={mobileQuickActions}
              headerClassName="pb-2"
              contentClassName="pt-2 space-y-2"
            />
          </div>
        </div>

        {profile?.chapter_id?.trim() ? (
          <>
            {!crowdedFlagLoading && crowdedIntegrationEnabled ? (
              <CrowdedCollectionsAdminPanel
                chapterId={profile.chapter_id.trim()}
                cycles={cycles}
                assignments={assignments}
                linkingCrowdedCycleId={linkingCrowdedCycleId}
                contactSyncEnabled={false}
                onCreateAndLink={(c) => void handleLinkCrowdedCollection(c as DuesCycle)}
                onContactsSynced={async () => {
                  await loadDuesData();
                }}
              />
            ) : null}
            {!financialToolsFlagLoading &&
            !stripeDonationsFlagLoading &&
            financialToolsEnabled &&
            stripeDonationsEnabled ? (
              <DonationCampaignsPanel chapterId={profile.chapter_id.trim()} enabled />
            ) : null}
          </>
        ) : null}
        </>
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
                  <Button onClick={() => openBulkAssignDuesModal()} variant="outline">
                    <Users className="h-4 w-4 mr-2" />
                    Bulk Assign Dues
                  </Button>
                  <Button onClick={() => openAssignDuesModal()} variant="outline">
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
                  onClick={() => openBulkAssignDuesModal()} 
                  variant="outline"
                  className="flex-1 justify-center text-sm py-2"
                >
                  <Users className="h-4 w-4 mr-2" />
                  Bulk Assign
                </Button>
                <Button 
                  onClick={() => openAssignDuesModal()} 
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
                                {paginatedMembers.map((member) => {
                                  const syncResult = memberCrowdedSyncResults[member.id];
                                  const contactState = memberCrowdedContactStates[member.id];
                                  const isSyncing = syncingCrowdedMemberId === member.id;
                                  const isConnectedInCrowded = contactState?.status === 'matched';
                                  const displayBadge =
                                    syncResult ??
                                    (contactState?.status === 'matched'
                                      ? { tone: 'success' as const, message: 'Connected in Crowded' }
                                      : contactState?.status === 'no_profile_email'
                                        ? { tone: 'warning' as const, message: 'Missing email' }
                                        : contactState?.status === 'ambiguous'
                                          ? { tone: 'warning' as const, message: 'Ambiguous Crowded match' }
                                          : null);
                                  return (
                                  <tr key={member.id} className="border-b hover:bg-gray-50 whitespace-nowrap">
                                    <td className="p-3 max-w-[250px]">
                                      <div>
                                        <p className="font-medium truncate" title={member.full_name}>{member.full_name}</p>
                                        <p className="text-sm text-gray-600 truncate" title={member.email}>{member.email}</p>
                                        {displayBadge ? (
                                          <Badge
                                            variant="outline"
                                            className={`mt-2 ${
                                              displayBadge.tone === 'success'
                                                ? 'border-green-200 bg-green-50 text-green-700'
                                                : displayBadge.tone === 'warning'
                                                  ? 'border-yellow-200 bg-yellow-50 text-yellow-700'
                                                  : 'border-red-200 bg-red-50 text-red-700'
                                            }`}
                                          >
                                            {displayBadge.message}
                                          </Badge>
                                        ) : null}
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
                                      <div className="flex items-center gap-2">
                                        {rowLevelCrowdedSyncEnabled ? (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={isSyncing || isConnectedInCrowded}
                                            onClick={() => void handleSyncMemberToCrowded(member)}
                                            className="hover:bg-blue-50 hover:text-blue-600"
                                          >
                                            {isSyncing ? (
                                              <Loader2 className="h-4 w-4 mr-1 flex-shrink-0 animate-spin" />
                                            ) : isConnectedInCrowded ? (
                                              <Lock className="h-4 w-4 mr-1 flex-shrink-0" />
                                            ) : (
                                              <RefreshCw className="h-4 w-4 mr-1 flex-shrink-0" />
                                            )}
                                            {isConnectedInCrowded ? 'Connected' : 'Sync to Crowded'}
                                          </Button>
                                        ) : null}
                                        <Button 
                                          size="sm" 
                                          variant="outline"
                                          onClick={() =>
                                            openAssignDuesModal({
                                              memberId: member.id,
                                            })
                                          }
                                          className="hover:bg-green-50 hover:text-green-600"
                                        >
                                          <DollarSign className="h-4 w-4 mr-1 flex-shrink-0" />
                                          Assign
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                )})}
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
                        {paginatedMembers.map((member) => {
                          const syncResult = memberCrowdedSyncResults[member.id];
                          const contactState = memberCrowdedContactStates[member.id];
                          const isSyncing = syncingCrowdedMemberId === member.id;
                          const isConnectedInCrowded = contactState?.status === 'matched';
                          const displayBadge =
                            syncResult ??
                            (contactState?.status === 'matched'
                              ? { tone: 'success' as const, message: 'Connected in Crowded' }
                              : contactState?.status === 'no_profile_email'
                                ? { tone: 'warning' as const, message: 'Missing email' }
                                : contactState?.status === 'ambiguous'
                                  ? { tone: 'warning' as const, message: 'Ambiguous Crowded match' }
                                  : null);
                          return (
                    <div key={member.id} className="border border-gray-200 rounded-lg p-3 space-y-2">
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm text-gray-900 truncate" title={member.full_name}>
                            {member.full_name}
                          </h4>
                          <p className="text-xs text-gray-600 mt-1 truncate" title={member.email}>
                            {member.email}
                          </p>
                          {displayBadge ? (
                            <Badge
                              variant="outline"
                              className={`mt-2 ${
                                displayBadge.tone === 'success'
                                  ? 'border-green-200 bg-green-50 text-green-700'
                                  : displayBadge.tone === 'warning'
                                    ? 'border-yellow-200 bg-yellow-50 text-yellow-700'
                                    : 'border-red-200 bg-red-50 text-red-700'
                              }`}
                            >
                              {displayBadge.message}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="flex flex-col items-end space-y-1 ml-2">
                          <p className="text-sm font-medium text-gray-900">
                            ${member.current_dues_amount.toFixed(2)}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex justify-between items-center gap-2 pt-2 border-t border-gray-100">
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
                        
                        <div className="flex items-center gap-2">
                          {rowLevelCrowdedSyncEnabled ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isSyncing || isConnectedInCrowded}
                              onClick={() => void handleSyncMemberToCrowded(member)}
                              className="h-7 px-2 text-xs hover:bg-blue-50 hover:text-blue-600"
                            >
                              {isSyncing ? (
                                <Loader2 className="h-3 w-3 mr-1 flex-shrink-0 animate-spin" />
                              ) : isConnectedInCrowded ? (
                                <Lock className="h-3 w-3 mr-1 flex-shrink-0" />
                              ) : (
                                <RefreshCw className="h-3 w-3 mr-1 flex-shrink-0" />
                              )}
                              {isConnectedInCrowded ? 'Connected' : 'Sync'}
                            </Button>
                          ) : null}
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() =>
                              openAssignDuesModal({
                                memberId: member.id,
                              })
                            }
                            className="h-7 px-2 text-xs hover:bg-green-50 hover:text-green-600"
                          >
                            <DollarSign className="h-3 w-3 mr-1 flex-shrink-0" />
                            Assign
                          </Button>
                        </div>
                      </div>
                    </div>
                  )})}
                  
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

      {profile?.chapter_id?.trim() ? (
        <CreateDuesCycleWizard
          open={showCreateCycleWizard}
          onOpenChange={setShowCreateCycleWizard}
          chapterId={profile.chapter_id.trim()}
          crowdedIntegrationEnabled={crowdedIntegrationEnabled && !crowdedFlagLoading}
          members={chapterMembers.map((m) => ({
            id: m.id,
            full_name: m.full_name,
            email: m.email,
          }))}
          onSuccess={async () => {
            await loadDuesData();
          }}
        />
      ) : null}

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
                    <Label htmlFor="assign-cycle" className="block text-sm font-medium text-gray-700 mb-1">
                      Dues cycle
                    </Label>
                    <Select
                      value={newAssignment.cycleId || ''}
                      onValueChange={(value: string) => {
                        setNewAssignment((prev) => {
                          const next = { ...prev, cycleId: value };
                          const base = getCycleBaseAmount(cycles, value);
                          if (prev.status === 'reduced' && base != null && base > 0) {
                            next.useCustomAmount = true;
                            next.customAmount = suggestedReducedAmount(base);
                          } else if (prev.useCustomAmount && base != null && base > 0) {
                            next.customAmount = base;
                          }
                          return next;
                        });
                      }}
                      placeholder="Select a dues cycle"
                    >
                      <SelectItem value="">Select a dues cycle</SelectItem>
                      {cycles.map((cycle) => (
                        <SelectItem key={cycle.id} value={cycle.id}>
                          {cycle.name} — ${Number(cycle.base_amount).toFixed(2)} (due{' '}
                          {new Date(cycle.due_date).toLocaleDateString()}
                          {cycle.status === 'active' ? ', active' : ''})
                        </SelectItem>
                      ))}
                    </Select>
                    {cycles.length === 0 && (
                      <p className="text-sm text-red-600 mt-1">
                        No dues cycles yet. Create a cycle first.
                      </p>
                    )}
                  </div>
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
                  {newAssignment.cycleId.trim() ? (
                    <div className="rounded-md bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-800">
                      <span className="font-medium text-gray-700">Cycle amount: </span>
                      {(() => {
                        const b = getCycleBaseAmount(cycles, newAssignment.cycleId);
                        return b != null && b >= 0
                          ? `$${b.toFixed(2)} (from dues cycle)`
                          : '— (invalid cycle base)';
                      })()}
                    </div>
                  ) : null}
                  {(newAssignment.status === 'exempt' || newAssignment.status === 'waived') && (
                    <p className="text-sm text-gray-600">
                      This assignment will record <span className="font-medium">$0.00</span> for the member.
                    </p>
                  )}
                  {newAssignment.status === 'reduced' && (
                    <div>
                      <Label htmlFor="reduced-amount" className="block text-sm font-medium text-gray-700 mb-1">
                        Reduced amount ($)
                      </Label>
                      <p className="text-xs text-gray-500 mb-1">
                        Must be greater than $0 and less than the cycle base.
                      </p>
                      <Input
                        id="reduced-amount"
                        type="number"
                        step="0.01"
                        min="0"
                        value={newAssignment.customAmount || ''}
                        onChange={(e) =>
                          setNewAssignment({
                            ...newAssignment,
                            useCustomAmount: true,
                            customAmount: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-brand-primary focus:ring-brand-primary text-sm h-9"
                      />
                    </div>
                  )}
                  {(newAssignment.status === 'required' || newAssignment.status === 'paid') && (
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="single-adjust-amount"
                          checked={newAssignment.useCustomAmount}
                          onCheckedChange={(checked) => {
                            const on = Boolean(checked);
                            setNewAssignment((prev) => {
                              const base = getCycleBaseAmount(cycles, prev.cycleId);
                              return {
                                ...prev,
                                useCustomAmount: on,
                                customAmount:
                                  on && base != null && base > 0
                                    ? base
                                    : prev.customAmount,
                              };
                            });
                          }}
                        />
                        <Label htmlFor="single-adjust-amount" className="text-sm font-medium text-gray-700 cursor-pointer">
                          Adjust amount (override cycle default)
                        </Label>
                      </div>
                      {newAssignment.useCustomAmount && (
                        <div>
                          <Label htmlFor="custom-amount" className="block text-sm font-medium text-gray-700 mb-1">
                            Custom amount ($)
                          </Label>
                          <Input
                            id="custom-amount"
                            type="number"
                            step="0.01"
                            min="0"
                            value={newAssignment.customAmount || ''}
                            onChange={(e) =>
                              setNewAssignment({
                                ...newAssignment,
                                customAmount: parseFloat(e.target.value) || 0,
                              })
                            }
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-brand-primary focus:ring-brand-primary text-sm h-9"
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Max twice the cycle base (treasurer guardrail).
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  <div>
                    <Label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
                      Status
                    </Label>
                    <Select
                      value={newAssignment.status}
                      onValueChange={(value: string) => {
                        const st = value as typeof newAssignment.status;
                        setNewAssignment((prev) => {
                          const base = getCycleBaseAmount(cycles, prev.cycleId);
                          if (st === 'exempt' || st === 'waived') {
                            return { ...prev, status: st, useCustomAmount: false, customAmount: 0 };
                          }
                          if (st === 'reduced') {
                            const sug =
                              base != null && base > 0 ? suggestedReducedAmount(base) : 0;
                            return { ...prev, status: st, useCustomAmount: true, customAmount: sug };
                          }
                          return { ...prev, status: st, useCustomAmount: false, customAmount: 0 };
                        });
                      }}
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
                    disabled={singleAssignSubmitDisabled}
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
                        onValueChange={(value: string) => {
                          setBulkAssignment((prev) => {
                            const next = { ...prev, cycleId: value };
                            const base = getCycleBaseAmount(cycles, value);
                            if (prev.status === 'reduced' && base != null && base > 0) {
                              next.useCustomAmount = true;
                              next.customAmount = suggestedReducedAmount(base);
                            } else if (prev.useCustomAmount && base != null && base > 0) {
                              next.customAmount = base;
                            }
                            return next;
                          });
                        }}
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

                    {bulkAssignment.cycleId.trim() ? (
                      <div className="rounded-md bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-800">
                        <span className="font-medium text-gray-700">Cycle amount: </span>
                        {(() => {
                          const b = getCycleBaseAmount(cycles, bulkAssignment.cycleId);
                          return b != null && b >= 0
                            ? `$${b.toFixed(2)} (default per member)`
                            : '—';
                        })()}
                      </div>
                    ) : null}

                    {(bulkAssignment.status === 'exempt' || bulkAssignment.status === 'waived') && (
                      <p className="text-sm text-gray-600">
                        Each assignment will be <span className="font-medium">$0.00</span>.
                      </p>
                    )}

                    {bulkAssignment.status === 'reduced' && (
                      <div>
                        <Label htmlFor="bulk-reduced-amount" className="block text-sm font-medium text-gray-700 mb-1">
                          Reduced amount ($) — applies to all selected members
                        </Label>
                        <p className="text-xs text-gray-500 mb-1">
                          Must be greater than $0 and less than the cycle base.
                        </p>
                        <Input
                          id="bulk-reduced-amount"
                          type="number"
                          step="0.01"
                          min="0"
                          value={bulkAssignment.customAmount || ''}
                          onChange={(e) =>
                            setBulkAssignment({
                              ...bulkAssignment,
                              useCustomAmount: true,
                              customAmount: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-brand-primary focus:ring-brand-primary text-sm h-9"
                        />
                      </div>
                    )}

                    {(bulkAssignment.status === 'required') && (
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="bulk-adjust-amount"
                            checked={bulkAssignment.useCustomAmount}
                            onCheckedChange={(checked) => {
                              const on = Boolean(checked);
                              setBulkAssignment((prev) => {
                                const base = getCycleBaseAmount(cycles, prev.cycleId);
                                return {
                                  ...prev,
                                  useCustomAmount: on,
                                  customAmount:
                                    on && base != null && base > 0 ? base : prev.customAmount,
                                };
                              });
                            }}
                          />
                          <Label htmlFor="bulk-adjust-amount" className="text-sm font-medium text-gray-700 cursor-pointer">
                            Apply custom amount to all selected members
                          </Label>
                        </div>
                        {bulkAssignment.useCustomAmount && (
                          <div>
                            <Label htmlFor="bulk-custom-amount" className="block text-sm font-medium text-gray-700 mb-1">
                              Custom amount ($)
                            </Label>
                            <Input
                              id="bulk-custom-amount"
                              type="number"
                              step="0.01"
                              min="0"
                              value={bulkAssignment.customAmount || ''}
                              onChange={(e) =>
                                setBulkAssignment({
                                  ...bulkAssignment,
                                  customAmount: parseFloat(e.target.value) || 0,
                                })
                              }
                              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-brand-primary focus:ring-brand-primary text-sm h-9"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    <div>
                      <Label htmlFor="bulkStatus" className="block text-sm font-medium text-gray-700 mb-1">
                        Status
                      </Label>
                      <Select 
                        value={bulkAssignment.status} 
                        onValueChange={(value: string) => {
                          const st = value as typeof bulkAssignment.status;
                          setBulkAssignment((prev) => {
                            const base = getCycleBaseAmount(cycles, prev.cycleId);
                            if (st === 'exempt' || st === 'waived') {
                              return { ...prev, status: st, useCustomAmount: false, customAmount: 0 };
                            }
                            if (st === 'reduced') {
                              const sug =
                                base != null && base > 0 ? suggestedReducedAmount(base) : 0;
                              return { ...prev, status: st, useCustomAmount: true, customAmount: sug };
                            }
                            return { ...prev, status: st, useCustomAmount: false, customAmount: 0 };
                          });
                        }}
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
                      disabled={bulkAssignSubmitDisabled}
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