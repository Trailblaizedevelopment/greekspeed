"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  CreditCard,
  Calendar,
  CheckCircle,
  Shield,
  Users,
  Wifi,
  Coffee,
  Award,
  DollarSign,
  Clock,
  AlertTriangle,
  Download,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { Progress } from "../../../components/ui/progress";
import { Checkbox } from "../../../components/ui/checkbox";
import { Label } from "../../../components/ui/label";
import { useProfile } from "@/lib/contexts/ProfileContext";
import { createClient } from '@supabase/supabase-js';
import { MobileBottomNavigation } from '@/components/features/dashboard/dashboards/ui/MobileBottomNavigation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const duesCoverage = [
  {
    icon: Users,
    title: "Alumni Network Access",
    description: "Connect with thousands of alumni across industries",
    included: true,
  },
  {
    icon: Wifi,
    title: "Digital Platform Access",
    description: "Full access to Trailblaize networking platform",
    included: true,
  },
  {
    icon: Coffee,
    title: "Chapter Events",
    description: "Access to networking events, mixers, and meetups",
    included: true,
  },
  {
    icon: Award,
    title: "Professional Development",
    description: "Career workshops, mentorship programs, and resources",
    included: true,
  },
  {
    icon: Shield,
    title: "Premium Support",
    description: "Priority customer support and account management",
    included: true,
  },
];

interface DuesAssignment {
  id: string;
  status: 'required' | 'exempt' | 'reduced' | 'waived' | 'paid';
  amount_assessed: number;
  amount_due: number;
  amount_paid: number;
  cycle: {
    id?: string;
    name: string;
    due_date: string;
    allow_payment_plans: boolean;
    plan_options: any[];
    crowded_collection_id?: string | null;
  };
}

export default function DuesClient() {
  const { profile } = useProfile();
  const [assignments, setAssignments] = useState<DuesAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingPayment, setProcessingPayment] = useState(false);
  // Add payment history state
  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
  const [totalPaymentCount, setTotalPaymentCount] = useState(0);

  // Add success state
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [crowdedPayConsent, setCrowdedPayConsent] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.id) {
      loadDuesAssignments();
      loadPaymentHistory();
    }
  }, [profile?.id]);

  // Update the success effect
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get('success');
    const canceled = urlParams.get('canceled');
    
    if (success === 'true') {
      // Payment successful! Refreshing data...
      setShowSuccessMessage(true);
      loadDuesAssignments();
      loadPaymentHistory(); // Refresh payment history
      // Clean up the URL
      window.history.replaceState({}, '', '/dashboard/dues');
      
      // Hide success message after 5 seconds
      setTimeout(() => setShowSuccessMessage(false), 5000);
    } else if (canceled === 'true') {
      // Payment canceled
      window.history.replaceState({}, '', '/dashboard/dues');
    }
  }, []);

  const loadDuesAssignments = async () => {
    try {
      setLoading(true);
      // Loading dues assignments for user
      
      const { data, error } = await supabase
        .from('dues_assignments')
        .select(`
          *,
          cycle:dues_cycles!dues_assignments_dues_cycle_id_fkey(
            id,
            name,
            due_date,
            allow_payment_plans,
            plan_options,
            crowded_collection_id
          )
        `)
        .eq('user_id', profile?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Loaded assignments
      setAssignments(data || []);
    } catch (error) {
      console.error('Error loading dues assignments:', error);
    } finally {
      setLoading(false);
    }
  };

  // Add function to load payment history
  const loadPaymentHistory = async () => {
    try {
      // Get total count first
      const { count, error: countError } = await supabase
        .from('payments_ledger')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', profile?.id)
        .eq('type', 'dues')
        .eq('status', 'succeeded');

      if (countError) throw countError;
      setTotalPaymentCount(count || 0);

      // Get limited results based on screen size
      const limit = window.innerWidth < 640 ? 3 : 5; // 3 for mobile, 5 for desktop
      
      const { data, error } = await supabase
        .from('payments_ledger')
        .select(`
          *,
          cycle:dues_cycles!payments_ledger_dues_cycle_id_fkey(
            name,
            due_date
          )
        `)
        .eq('user_id', profile?.id)
        .eq('type', 'dues')
        .eq('status', 'succeeded')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      setPaymentHistory(data || []);
    } catch (error) {
      console.error('Error loading payment history:', error);
    }
  };

  const handleCrowdedPay = async (assignmentId: string) => {
    setPayError(null);
    if (!crowdedPayConsent) {
      setPayError('Please confirm payment authorization below.');
      return;
    }
    setProcessingPayment(true);
    try {
      const res = await fetch('/api/dues/pay', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duesAssignmentId: assignmentId, userConsented: true }),
      });
      const body = (await res.json()) as { paymentUrl?: string; error?: string };
      if (!res.ok || !body.paymentUrl) {
        setPayError(body.error || 'Could not start checkout. Try again or contact your treasurer.');
        return;
      }
      window.location.href = body.paymentUrl;
    } catch (e) {
      console.error(e);
      setPayError('Network error. Try again.');
    } finally {
      setProcessingPayment(false);
    }
  };

  // Update the outstanding balance calculation
  const currentAssignment = assignments.find(a => a.status !== 'paid' && a.status !== 'exempt' && a.status !== 'waived');
  const totalOutstanding = assignments.reduce((sum, a) => {
    // Only count outstanding dues (not paid, exempt, or waived)
    if (a.status !== 'paid' && a.status !== 'exempt' && a.status !== 'waived') {
      return sum + (a.amount_due - a.amount_paid);
    }
    return sum;
  }, 0);

  // Add this to ensure the header reflects the correct status
  const isPaidUp = totalOutstanding === 0 && assignments.length > 0;

  // Add payment summary calculation
  const totalPaid = paymentHistory.reduce((sum, payment) => sum + payment.amount, 0);
  const recentPayment = paymentHistory[0]; // Most recent payment

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20 sm:pb-0"> {/* Add pb-20 sm:pb-0 for mobile bottom padding */}
      {/* Header Section */}
      <div className="bg-white border-b border-gray-200 px-6 py-8">
        <div className="max-w-7xl mx-auto">
          {/* Desktop Layout */}
          <div className="hidden sm:flex items-center justify-between">
            <div>
              <h1 className="text-primary-900 font-semibold mb-2">Membership Dues</h1>
              <p className="text-gray-600 hidden sm:block">
                Manage your membership payments and view benefits
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm text-gray-500">Outstanding Balance</p>
                <p
                  className={`font-semibold ${
                    totalOutstanding === 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  ${totalOutstanding.toFixed(2)}
                </p>
                {totalPaid > 0 && (
                  <p className="text-xs text-gray-500">
                    Total paid: ${totalPaid.toFixed(2)}
                  </p>
                )}
              </div>
              <Badge
                variant={totalOutstanding === 0 ? "default" : "secondary"}
                className={totalOutstanding === 0 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}
              >
                {totalOutstanding === 0 ? "Paid Up" : "Outstanding"}
              </Badge>
            </div>
          </div>

          {/* Mobile Layout */}
          <div className="sm:hidden">
            <div className="mb-4">
              <h1 className="text-primary-900 font-semibold mb-2 text-2xl">Membership Dues</h1>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Outstanding Balance</p>
                <p
                  className={`font-semibold ${
                    totalOutstanding === 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  ${totalOutstanding.toFixed(2)}
                </p>
                {totalPaid > 0 && (
                  <p className="text-xs text-gray-500">
                    Total paid: ${totalPaid.toFixed(2)}
                  </p>
                )}
              </div>
              <Badge
                variant={totalOutstanding === 0 ? "default" : "secondary"}
                className={totalOutstanding === 0 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}
              >
                {totalOutstanding === 0 ? "Paid Up" : "Outstanding"}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {showSuccessMessage && (
        <div className="fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50">
          <div className="flex items-center space-x-2">
            <CheckCircle className="h-5 w-5" />
            <span>Payment successful! Your dues have been updated.</span>
          </div>
        </div>
      )}

      {/* Desktop Layout */}
      <div className="hidden sm:block max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Reorder the cards */}
          <div className="lg:col-span-2 space-y-6">
            {/* Current Status Card - Keep at top */}
            <Card className="bg-gradient-to-br from-primary-50 to-accent-50 border-primary-200">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center space-x-2">
                    <Calendar className="h-5 w-5 text-brand-primary" />
                    <span>Current Dues Status</span>
                  </CardTitle>
                  <Clock className="h-5 w-5 text-brand-primary" />
                </div>
              </CardHeader>
              <CardContent>
                {currentAssignment ? (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-2xl font-semibold text-primary-900">
                          ${(currentAssignment.amount_due - currentAssignment.amount_paid).toFixed(2)}
                        </p>
                        <p className="text-brand-primary">Due on {new Date(currentAssignment.cycle.due_date).toLocaleDateString()}</p>
                        {currentAssignment.cycle.allow_payment_plans && (
                          <p className="text-sm text-gray-600">Payment plans available</p>
                        )}
                      </div>
                    </div>
                    {currentAssignment.amount_due - currentAssignment.amount_paid > 0 && (
                      <div className="border-t border-primary-200/60 pt-4 space-y-3">
                        {payError ? <p className="text-sm text-red-600">{payError}</p> : null}
                        {currentAssignment.cycle.crowded_collection_id ? (
                          <>
                            <div className="flex items-start gap-3">
                              <Checkbox
                                id="crowded-pay-consent-desktop"
                                checked={crowdedPayConsent}
                                onCheckedChange={(c) => setCrowdedPayConsent(Boolean(c))}
                                aria-labelledby="crowded-pay-consent-label-desktop"
                              />
                              <Label
                                id="crowded-pay-consent-label-desktop"
                                htmlFor="crowded-pay-consent-desktop"
                                className="text-sm text-gray-700 font-normal leading-snug cursor-pointer"
                              >
                                I authorize payment for this chapter dues balance and agree to proceed to our
                                payment partner (Crowded) to complete checkout.
                              </Label>
                            </div>
                            <Button
                              className="w-full sm:w-auto"
                              disabled={processingPayment}
                              onClick={() => handleCrowdedPay(currentAssignment.id)}
                            >
                              {processingPayment ? 'Starting checkout…' : 'Pay online'}
                            </Button>
                          </>
                        ) : (
                          <p className="text-sm text-gray-600">
                            Online payment will be available once your treasurer links this dues cycle to Crowded.
                          </p>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center text-green-600">
                    <CheckCircle className="h-12 w-12 mx-auto mb-2" />
                    <p className="text-lg font-semibold">All dues are current!</p>
                    <p className="text-sm text-gray-600">No outstanding payments required.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Payment History - Move to second position */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <CreditCard className="h-5 w-5 text-brand-primary" />
                    <span>Payment History</span>
                  </div>
                  <Button variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Receipts
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {paymentHistory.length > 0 ? (
                    paymentHistory.map((payment) => (
                      <div
                        key={payment.id}
                        className="flex items-center justify-between py-3 border-b border-gray-100 last:border-b-0"
                      >
                        <div className="flex items-center space-x-3">
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          <div>
                            <p className="font-medium">{payment.cycle?.name || 'Chapter Dues'}</p>
                            <p className="text-sm text-gray-600">
                              {new Date(payment.created_at).toLocaleDateString()} • Credit Card
                            </p>
                            {payment.id && (
                              <p className="text-xs text-gray-500">
                                Payment #{payment.id.slice(0, 8)}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">${payment.amount.toFixed(2)}</p>
                          <Badge
                            variant="secondary"
                            className="bg-green-100 text-green-800"
                          >
                            Paid
                          </Badge>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8">
                      <CreditCard className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                      <p className="text-gray-500">No payment history available</p>
                      <p className="text-sm text-gray-400">Your completed payments will appear here</p>
                    </div>
                  )}
                </div>
                {totalPaymentCount > 5 && (
                  <div className="mt-4 pt-3 border-t border-gray-100">
                    <p className="text-sm text-gray-500 text-center">
                      Showing 5 of {totalPaymentCount} payments. Contact admin for complete payment history.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Payment Information - Move to third position */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <DollarSign className="h-5 w-5 text-brand-primary" />
                  <span>Payment Information</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium">Payment Methods</p>
                      <p className="text-sm text-gray-600">Credit/Debit Cards</p>
                    </div>
                    <CreditCard className="h-5 w-5 text-brand-primary" />
                  </div>
                  
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium">Security</p>
                      <p className="text-sm text-gray-600">PCI compliant, encrypted payments</p>
                    </div>
                    <Shield className="h-5 w-5 text-green-600" />
                  </div>
                  
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium">Receipts</p>
                      <p className="text-sm text-gray-600">Automatically sent to your email</p>
                    </div>
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Remove Quick Actions */}
          <div className="space-y-6">
            {/* Your Membership Includes - Keep this */}
            <Card>
              <CardHeader>
                <CardTitle>Your Membership Includes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {duesCoverage.map((benefit, index) => (
                    <motion.div
                      key={index}
                      className="flex items-start space-x-3"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                    >
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center">
                          <benefit.icon className="h-4 w-4 text-brand-primary" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <h4 className="text-sm font-medium">{benefit.title}</h4>
                          {benefit.included && (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          )}
                        </div>
                        <p className="text-sm text-gray-600">
                          {benefit.description}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Support - Keep this */}
            <Card className="bg-gradient-to-br from-accent-50 to-primary-50">
              <CardContent className="pt-6">
                <div className="text-center">
                  <h3 className="font-medium mb-2">Need Help?</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Contact our support team for payment assistance
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => window.location.href = 'mailto:devin@trailblaize.net?subject=Dues Support Request&body=Hello,%0D%0A%0D%0AI need assistance with my dues payment.%0D%0A%0D%0APlease provide details about your issue below:%0D%0A%0D%0A'}
                  >
                    Contact Support
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Mobile Layout - Cardless */}
      <div className="sm:hidden px-4 py-6">
        {/* Current Dues Status Card - Keep as card */}
        <Card className="bg-gradient-to-br from-primary-50 to-accent-50 border-primary-200 mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center space-x-2">
                <Calendar className="h-5 w-5 text-brand-primary" />
                <span>Current Dues Status</span>
              </CardTitle>
              <Clock className="h-5 w-5 text-brand-primary" />
            </div>
          </CardHeader>
          <CardContent>
            {currentAssignment ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-2xl font-semibold text-primary-900">
                      ${(currentAssignment.amount_due - currentAssignment.amount_paid).toFixed(2)}
                    </p>
                    <p className="text-brand-primary">Due on {new Date(currentAssignment.cycle.due_date).toLocaleDateString()}</p>
                    {currentAssignment.cycle.allow_payment_plans && (
                      <p className="text-sm text-gray-600">Payment plans available</p>
                    )}
                  </div>
                </div>
                {currentAssignment.amount_due - currentAssignment.amount_paid > 0 && (
                  <div className="border-t border-primary-200/60 pt-4 space-y-3">
                    {payError ? <p className="text-sm text-red-600">{payError}</p> : null}
                    {currentAssignment.cycle.crowded_collection_id ? (
                      <>
                        <div className="flex items-start gap-3">
                          <Checkbox
                            id="crowded-pay-consent-mobile"
                            checked={crowdedPayConsent}
                            onCheckedChange={(c) => setCrowdedPayConsent(Boolean(c))}
                            aria-labelledby="crowded-pay-consent-label-mobile"
                          />
                          <Label
                            id="crowded-pay-consent-label-mobile"
                            htmlFor="crowded-pay-consent-mobile"
                            className="text-sm text-gray-700 font-normal leading-snug cursor-pointer"
                          >
                            I authorize payment for this chapter dues balance and agree to proceed to our
                            payment partner (Crowded) to complete checkout.
                          </Label>
                        </div>
                        <Button
                          className="w-full"
                          disabled={processingPayment}
                          onClick={() => handleCrowdedPay(currentAssignment.id)}
                        >
                          {processingPayment ? 'Starting checkout…' : 'Pay online'}
                        </Button>
                      </>
                    ) : (
                      <p className="text-sm text-gray-600">
                        Online payment will be available once your treasurer links this dues cycle to Crowded.
                      </p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="text-center text-green-600">
                <CheckCircle className="h-12 w-12 mx-auto mb-2" />
                <p className="text-lg font-semibold">All dues are current!</p>
                <p className="text-sm text-gray-600">No outstanding payments required.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment History - Cardless */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <CreditCard className="h-5 w-5 text-brand-primary" />
              <h2 className="text-lg font-semibold text-gray-900">Payment History</h2>
            </div>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Receipts
            </Button>
          </div>
          
          <div className="space-y-0">
            {paymentHistory.length > 0 ? (
              paymentHistory.map((payment, index) => (
                <div
                  key={payment.id}
                  className={`px-4 py-4 ${index !== paymentHistory.length - 1 ? 'border-b border-gray-100' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <div>
                        <p className="font-medium">{payment.cycle?.name || 'Chapter Dues'}</p>
                        <p className="text-sm text-gray-600">
                          {new Date(payment.created_at).toLocaleDateString()} • Credit Card
                        </p>
                        {payment.id && (
                          <p className="text-xs text-gray-500">
                            Payment #{payment.id.slice(0, 8)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">${payment.amount.toFixed(2)}</p>
                      <Badge
                        variant="secondary"
                        className="bg-green-100 text-green-800"
                      >
                        Paid
                      </Badge>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <CreditCard className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                <p className="text-gray-500">No payment history available</p>
                <p className="text-sm text-gray-400">Your completed payments will appear here</p>
              </div>
            )}
          </div>
          
          {totalPaymentCount > 3 && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <p className="text-sm text-gray-500 text-center">
                Showing 3 of {totalPaymentCount} payments. Contact admin for complete payment history.
              </p>
            </div>
          )}
        </div>

        {/* Payment Information - Cardless */}
        <div className="mb-6">
          <div className="flex items-center space-x-2 mb-4">
            <DollarSign className="h-5 w-5 text-brand-primary" />
            <h2 className="text-lg font-semibold text-gray-900">Payment Information</h2>
          </div>
          
          <div className="space-y-0">
            <div className="px-4 py-4 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Payment Methods</p>
                  <p className="text-sm text-gray-600">Credit/Debit card</p>
                </div>
                <CreditCard className="h-5 w-5 text-brand-primary" />
              </div>
            </div>
            
            <div className="px-4 py-4 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Security</p>
                  <p className="text-sm text-gray-600">PCI compliant, encrypted payments</p>
                </div>
                <Shield className="h-5 w-5 text-green-600" />
              </div>
            </div>
            
            <div className="px-4 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Receipts</p>
                  <p className="text-sm text-gray-600">Automatically sent to your email</p>
                </div>
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Your Membership Includes - Cardless */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Membership Includes</h2>
          <div className="space-y-0">
            {duesCoverage.map((benefit, index) => (
              <div
                key={index}
                className={`px-4 py-4 ${index !== duesCoverage.length - 1 ? 'border-b border-gray-100' : ''}`}
              >
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center">
                      <benefit.icon className="h-4 w-4 text-brand-primary" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <h4 className="text-sm font-medium">{benefit.title}</h4>
                      {benefit.included && (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      )}
                    </div>
                    <p className="text-sm text-gray-600">
                      {benefit.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Support - Cardless */}
        <div className="text-center py-8">
          <h3 className="font-medium mb-2">Need Help?</h3>
          <p className="text-sm text-gray-600 mb-4">
            Contact our support team for payment assistance
          </p>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => window.location.href = 'mailto:devin@trailblaize.net?subject=Dues Support Request&body=Hello,%0D%0A%0D%0AI need assistance with my dues payment.%0D%0A%0D%0APlease provide details about your issue below:%0D%0A%0D%0A'}
          >
            Contact Support
          </Button>
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNavigation />
    </div>
  );
} 