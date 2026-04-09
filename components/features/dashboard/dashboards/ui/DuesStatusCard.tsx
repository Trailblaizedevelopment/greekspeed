'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DollarSign, AlertTriangle, Lock, CheckCircle, Calendar } from 'lucide-react';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { supabase } from '@/lib/supabase/client';
import {
  formatDuesDueDateLabel,
  unwrapDuesCycleEmbed,
  type DuesCycleEmbed,
} from '@/lib/utils/duesEmbeds';

interface DuesAssignment {
  id: string;
  status: 'required' | 'exempt' | 'reduced' | 'waived' | 'paid' | 'overdue';
  amount_assessed: number;
  amount_due: number;
  amount_paid: number;
  cycle: DuesCycleEmbed | null;
}

export function DuesStatusCard() {
  const { profile } = useProfile();
  const [assignments, setAssignments] = useState<DuesAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.id) {
      loadDuesAssignments();
    }
  }, [profile?.id]);

  const loadDuesAssignments = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { data, error } = await supabase
        .from('dues_assignments')
        .select(`
          *,
          cycle:dues_cycles!dues_assignments_dues_cycle_id_fkey(
            name,
            due_date,
            allow_payment_plans,
            plan_options
          )
        `)
        .eq('user_id', profile?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows = (data || []) as Record<string, unknown>[];
      setAssignments(
        rows.map((row) => ({
          ...(row as unknown as DuesAssignment),
          cycle: unwrapDuesCycleEmbed(row.cycle),
        }))
      );
    } catch (error) {
      console.error('Error loading dues assignments:', error);
      setError('Failed to load dues data');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-green-100 text-green-800';
      case 'required': return 'bg-yellow-100 text-yellow-800';
      case 'overdue': return 'bg-red-100 text-red-800';
      case 'exempt': return 'bg-gray-100 text-gray-800';
      case 'waived': return 'bg-accent-100 text-accent-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'paid': return 'Paid';
      case 'required': return 'Unpaid';
      case 'overdue': return 'Overdue';
      case 'exempt': return 'Exempt';
      case 'waived': return 'Waived';
      default: return 'Unpaid';
    }
  };

  const handlePayNow = () => {
    // Navigate to the dues page
    window.location.href = '/dashboard/dues';
  };

  // Calculate current assignment and outstanding balance
  const currentAssignment = assignments.find(a => a.status !== 'paid' && a.status !== 'exempt' && a.status !== 'waived');
  const totalOutstanding = assignments.reduce((sum, a) => {
    if (a.status !== 'paid' && a.status !== 'exempt' && a.status !== 'waived') {
      return sum + (a.amount_due - a.amount_paid);
    }
    return sum;
  }, 0);

  const isPaidUp = totalOutstanding === 0 && assignments.length > 0;
  const hasNoDues = assignments.length === 0;

  if (loading) {
    return (
      <Card className="bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center space-x-2">
            <DollarSign className="h-5 w-5 text-brand-primary" />
            <span>Dues Status</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="text-center py-4">
            <p className="text-gray-500 text-sm">Loading dues status...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center space-x-2">
            <DollarSign className="h-5 w-5 text-brand-primary" />
            <span>Dues Status</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="text-center py-4">
            <p className="text-red-500 text-sm mb-2">Error loading dues</p>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={loadDuesAssignments}
              className="text-brand-primary border-brand-primary hover:bg-primary-50 h-8"
            >
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center space-x-2">
          <DollarSign className="h-5 w-5 text-brand-primary" />
          <span>Dues Status</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-4 sm:space-y-3">
          {/* No Dues Assigned */}
          {hasNoDues && (
            <div className="text-center py-4">
              <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
              <p className="text-green-600 font-medium text-sm">No dues assigned</p>
              <p className="text-gray-500 text-xs">You're all set!</p>
            </div>
          )}

          {/* All Dues Paid */}
          {isPaidUp && (
            <div className="text-center py-4">
              <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
              <p className="text-green-600 font-medium text-sm">All dues current</p>
              <p className="text-gray-500 text-xs">No outstanding payments</p>
            </div>
          )}

          {/* Outstanding Dues */}
          {currentAssignment && (
            <>
              <div className="flex justify-between items-center">
                <span className="text-base sm:text-sm text-gray-600 break-words">
                  {currentAssignment.cycle?.name || 'Chapter Dues'}
                </span>
                <Badge className={`${getStatusColor(currentAssignment.status)} text-sm sm:text-xs`}>
                  {getStatusText(currentAssignment.status)}
                </Badge>
              </div>
              
              <div className="text-center">
                <div className="text-3xl sm:text-2xl font-bold text-gray-900">
                  ${(currentAssignment.amount_due - currentAssignment.amount_paid).toFixed(2)}
                </div>
                <div className="text-base sm:text-sm text-gray-600 break-words">
                  {formatDuesDueDateLabel(currentAssignment.cycle)}
                </div>
              </div>
              
              {currentAssignment.status === 'overdue' && (
                <div className="flex items-center justify-center space-x-2 text-red-600 text-base sm:text-sm">
                  <AlertTriangle className="h-5 w-5 sm:h-4 sm:w-4" />
                  <span className="break-words">Payment is overdue</span>
                </div>
              )}
              
              <Button 
                onClick={handlePayNow}
                className="w-full bg-brand-primary hover:bg-brand-primary-hover h-12 sm:h-10"
              >
                <span className="text-base sm:text-sm">Pay Now</span>
                <Calendar className="h-4 w-4 sm:h-3 sm:w-3 ml-2" />
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
} 