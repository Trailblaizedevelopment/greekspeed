"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  Clock,
  CreditCard,
  DollarSign,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { MobileBottomNavigation } from "@/components/features/dashboard/dashboards/ui/MobileBottomNavigation";
import { useProfile } from "@/lib/contexts/ProfileContext";
import { supabase } from "@/lib/supabase/client";
import {
  formatDuesDueDateLabel,
  unwrapDuesCycleEmbed,
  type DuesCycleEmbed,
} from "@/lib/utils/duesEmbeds";

type DuesAssignmentStatus = "required" | "exempt" | "reduced" | "waived" | "paid";

interface DuesAssignment {
  id: string;
  status: DuesAssignmentStatus;
  amount_assessed: number;
  amount_due: number;
  amount_paid: number;
  cycle: DuesCycleEmbed | null;
}

interface PaymentHistoryItem {
  id: string;
  amount: number;
  created_at: string;
  cycle: DuesCycleEmbed | null;
}

type ReadinessTone = "green" | "amber" | "red" | "blue";
type ReadinessCode =
  | "READY"
  | "NO_DUES_ASSIGNED"
  | "NO_OUTSTANDING_BALANCE"
  | "CROWDED_CYCLE_NOT_LINKED"
  | "CROWDED_CHAPTER_NOT_CONFIGURED"
  | "CROWDED_CONTACT_NOT_FOUND"
  | "CROWDED_CONTACT_AMBIGUOUS"
  | "DUES_ASSIGNMENT_NOT_PAYABLE"
  | "UNKNOWN";

interface PayReadinessState {
  code: ReadinessCode;
  title: string;
  description: string;
  tone: ReadinessTone;
  canPay: boolean;
}

interface DuesPayApiBody {
  ready?: boolean;
  code?: string;
  error?: string;
}

const NON_OUTSTANDING_STATUSES = new Set<DuesAssignmentStatus>(["paid", "exempt", "waived"]);

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function getRemainingBalance(assignment: DuesAssignment): number {
  const due = Number(assignment.amount_due) || 0;
  const paid = Number(assignment.amount_paid) || 0;
  return Math.max(0, due - paid);
}

function getTimestamp(value: string | undefined | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
}

function sortAssignmentsForDisplay(assignments: DuesAssignment[]): DuesAssignment[] {
  return [...assignments].sort((a, b) => {
    const remainingDiff = getRemainingBalance(b) - getRemainingBalance(a);
    if (remainingDiff !== 0) return remainingDiff;

    const dueDiff = getTimestamp(a.cycle?.due_date) - getTimestamp(b.cycle?.due_date);
    if (dueDiff !== 0) return dueDiff;

    return (a.cycle?.name || "").localeCompare(b.cycle?.name || "");
  });
}

function getAssignmentBadge(assignment: DuesAssignment): {
  label: string;
  className: string;
} {
  const remaining = getRemainingBalance(assignment);
  if (assignment.status === "waived") {
    return { label: "Waived", className: "bg-gray-100 text-gray-800" };
  }
  if (assignment.status === "exempt") {
    return { label: "Exempt", className: "bg-gray-100 text-gray-800" };
  }
  if (assignment.status === "paid" || remaining === 0) {
    return { label: "Paid", className: "bg-green-100 text-green-800" };
  }
  if (assignment.status === "reduced") {
    return { label: "Reduced", className: "bg-orange-100 text-orange-800" };
  }
  return { label: "Unpaid", className: "bg-amber-100 text-amber-800" };
}

function getReadinessStyles(tone: ReadinessTone) {
  switch (tone) {
    case "green":
      return {
        card: "border-green-200 bg-green-50/80",
        badge: "bg-green-100 text-green-800",
        icon: "text-green-600",
      };
    case "amber":
      return {
        card: "border-amber-200 bg-amber-50/80",
        badge: "bg-amber-100 text-amber-800",
        icon: "text-amber-600",
      };
    case "red":
      return {
        card: "border-red-200 bg-red-50/80",
        badge: "bg-red-100 text-red-800",
        icon: "text-red-600",
      };
    default:
      return {
        card: "border-blue-200 bg-blue-50/80",
        badge: "bg-blue-100 text-blue-800",
        icon: "text-blue-600",
      };
  }
}

function mapPayReadiness(
  body: DuesPayApiBody | null | undefined,
  fallback: PayReadinessState
): PayReadinessState {
  switch (body?.code) {
    case "READY":
      return {
        code: "READY",
        title: "Ready for online payment",
        description:
          "Your current dues assignment is fully configured for Crowded checkout.",
        tone: "blue",
        canPay: true,
      };
    case "CROWDED_CYCLE_NOT_LINKED":
      return {
        code: "CROWDED_CYCLE_NOT_LINKED",
        title: "Dues cycle not linked yet",
        description:
          "Your treasurer still needs to link this dues cycle to Crowded before you can pay online.",
        tone: "amber",
        canPay: false,
      };
    case "CROWDED_CHAPTER_NOT_CONFIGURED":
      return {
        code: "CROWDED_CHAPTER_NOT_CONFIGURED",
        title: "Chapter Crowded setup incomplete",
        description:
          "Your chapter is not fully configured for Crowded checkout yet. Contact your treasurer for next steps.",
        tone: "red",
        canPay: false,
      };
    case "CROWDED_CONTACT_NOT_FOUND":
      return {
        code: "CROWDED_CONTACT_NOT_FOUND",
        title: "You are not matched in Crowded",
        description:
          body.error ||
          "No Crowded contact matches your profile yet. Your treasurer needs to add or sync you in Crowded.",
        tone: "amber",
        canPay: false,
      };
    case "CROWDED_CONTACT_AMBIGUOUS":
      return {
        code: "CROWDED_CONTACT_AMBIGUOUS",
        title: "Your Crowded match needs review",
        description:
          body.error ||
          "Multiple Crowded contacts match your profile email. Your treasurer needs to resolve the duplicate before checkout will work.",
        tone: "red",
        canPay: false,
      };
    case "NO_OUTSTANDING_BALANCE":
    case "DUES_ASSIGNMENT_NOT_PAYABLE":
      return {
        code: "NO_OUTSTANDING_BALANCE",
        title: "No outstanding balance",
        description:
          body.error || "This assignment no longer has a payable online balance.",
        tone: "green",
        canPay: false,
      };
    default:
      break;
  }

  if (body?.error?.includes("Add an email to your profile")) {
    return {
      code: "UNKNOWN",
      title: "Profile email required",
      description: body.error,
      tone: "amber",
      canPay: false,
    };
  }

  if (body?.error) {
    return {
      code: "UNKNOWN",
      title: "Checkout readiness could not be confirmed",
      description: body.error,
      tone: "red",
      canPay: false,
    };
  }

  return fallback;
}

export default function DuesClient() {
  const { profile } = useProfile();
  const [assignments, setAssignments] = useState<DuesAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState<PaymentHistoryItem[]>([]);
  const [totalPaymentCount, setTotalPaymentCount] = useState(0);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [crowdedPayConsent, setCrowdedPayConsent] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [serverReadiness, setServerReadiness] = useState<PayReadinessState | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);

  useEffect(() => {
    if (!profile?.id) return;
    void loadDuesAssignments();
    void loadPaymentHistory();
  }, [profile?.id]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get("success");
    const canceled = urlParams.get("canceled");

    if (success === "true") {
      setShowSuccessMessage(true);
      void loadDuesAssignments();
      void loadPaymentHistory();
      window.history.replaceState({}, "", "/dashboard/dues");

      const timeout = window.setTimeout(() => setShowSuccessMessage(false), 5000);
      return () => window.clearTimeout(timeout);
    }

    if (canceled === "true") {
      setPayError("Checkout was canceled before payment completed.");
      window.history.replaceState({}, "", "/dashboard/dues");
    }
  }, []);

  const loadDuesAssignments = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("dues_assignments")
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
        .eq("user_id", profile?.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = (data || []) as Record<string, unknown>[];
      setAssignments(
        rows.map((row) => ({
          ...(row as unknown as DuesAssignment),
          cycle: unwrapDuesCycleEmbed(row.cycle),
        }))
      );
    } catch (error) {
      console.error("Error loading dues assignments:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadPaymentHistory = async () => {
    try {
      const { count, error: countError } = await supabase
        .from("payments_ledger")
        .select("*", { count: "exact", head: true })
        .eq("user_id", profile?.id)
        .eq("type", "dues")
        .eq("status", "succeeded");

      if (countError) throw countError;
      setTotalPaymentCount(count || 0);

      const limit = window.innerWidth < 640 ? 4 : 6;

      const { data, error } = await supabase
        .from("payments_ledger")
        .select(`
          id,
          amount,
          created_at,
          cycle:dues_cycles!payments_ledger_dues_cycle_id_fkey(
            name,
            due_date
          )
        `)
        .eq("user_id", profile?.id)
        .eq("type", "dues")
        .eq("status", "succeeded")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;

      const payments = (data || []) as Record<string, unknown>[];
      setPaymentHistory(
        payments.map((row) => ({
          id: String(row.id ?? ""),
          amount: Number(row.amount) || 0,
          created_at: String(row.created_at ?? ""),
          cycle: unwrapDuesCycleEmbed(row.cycle),
        }))
      );
    } catch (error) {
      console.error("Error loading payment history:", error);
    }
  };

  const handleCrowdedPay = async (assignmentId: string) => {
    setPayError(null);
    if (!crowdedPayConsent) {
      setPayError("Please confirm payment authorization below.");
      return;
    }

    setProcessingPayment(true);
    try {
      const res = await fetch("/api/dues/pay", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duesAssignmentId: assignmentId, userConsented: true }),
      });
      const body = (await res.json()) as DuesPayApiBody & { paymentUrl?: string };

      if (!res.ok || !body.paymentUrl) {
        setServerReadiness((prev) => mapPayReadiness(body, prev ?? fallbackReadiness));
        setPayError(body.error || "Could not start checkout. Try again or contact your treasurer.");
        return;
      }

      window.location.href = body.paymentUrl;
    } catch (error) {
      console.error(error);
      setPayError("Network error. Try again.");
    } finally {
      setProcessingPayment(false);
    }
  };

  const sortedAssignments = useMemo(
    () => sortAssignmentsForDisplay(assignments),
    [assignments]
  );

  const outstandingAssignments = useMemo(
    () =>
      sortedAssignments.filter(
        (assignment) =>
          getRemainingBalance(assignment) > 0 && !NON_OUTSTANDING_STATUSES.has(assignment.status)
      ),
    [sortedAssignments]
  );

  const currentAssignment = outstandingAssignments[0] ?? null;
  const totalOutstanding = useMemo(
    () => outstandingAssignments.reduce((sum, assignment) => sum + getRemainingBalance(assignment), 0),
    [outstandingAssignments]
  );
  const totalPaid = useMemo(
    () => paymentHistory.reduce((sum, payment) => sum + payment.amount, 0),
    [paymentHistory]
  );

  const fallbackReadiness = useMemo<PayReadinessState>(() => {
    if (assignments.length === 0) {
      return {
        code: "NO_DUES_ASSIGNED",
        title: "No dues assigned",
        description: "Your chapter has not assigned dues to you yet.",
        tone: "green",
        canPay: false,
      };
    }

    if (!currentAssignment) {
      return {
        code: "NO_OUTSTANDING_BALANCE",
        title: "Nothing due right now",
        description: "All assigned dues are already paid, waived, or exempt.",
        tone: "green",
        canPay: false,
      };
    }

    if (!currentAssignment.cycle?.crowded_collection_id) {
      return {
        code: "CROWDED_CYCLE_NOT_LINKED",
        title: "Dues cycle not linked yet",
        description:
          "Your treasurer still needs to link this dues cycle to Crowded before you can pay online.",
        tone: "amber",
        canPay: false,
      };
    }

    return {
      code: "READY",
      title: "Ready for online payment",
      description:
        "Your next unpaid dues assignment is linked to Crowded and can be paid online now.",
      tone: "blue",
      canPay: true,
    };
  }, [assignments.length, currentAssignment]);

  useEffect(() => {
    if (!currentAssignment) {
      setServerReadiness(null);
      setReadinessLoading(false);
      return;
    }

    if (!currentAssignment.cycle?.crowded_collection_id) {
      setServerReadiness(null);
      setReadinessLoading(false);
      return;
    }

    let canceled = false;
    setReadinessLoading(true);

    void (async () => {
      try {
        const res = await fetch("/api/dues/pay", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ duesAssignmentId: currentAssignment.id, readinessOnly: true }),
        });
        const body = (await res.json().catch(() => null)) as DuesPayApiBody | null;

        if (canceled) return;

        setServerReadiness(mapPayReadiness(body, fallbackReadiness));
      } catch (error) {
        console.error("Error checking dues readiness:", error);
        if (!canceled) {
          setServerReadiness({
            code: "UNKNOWN",
            title: "Checkout readiness could not be confirmed",
            description: "Try again in a moment or contact your treasurer if this continues.",
            tone: "red",
            canPay: false,
          });
        }
      } finally {
        if (!canceled) {
          setReadinessLoading(false);
        }
      }
    })();

    return () => {
      canceled = true;
    };
  }, [currentAssignment, fallbackReadiness]);

  const payReadiness = serverReadiness ?? fallbackReadiness;

  if (loading) {
    return <div className="flex h-64 items-center justify-center">Loading...</div>;
  }

  const readinessStyles = getReadinessStyles(payReadiness.tone);
  const isPaidUp = assignments.length > 0 && totalOutstanding === 0;
  const additionalOutstandingCount = Math.max(0, outstandingAssignments.length - 1);

  return (
    <div className="min-h-screen bg-gray-50 pb-20 sm:pb-8">
      <div className="border-b border-gray-200 bg-white px-4 py-6 sm:px-6 sm:py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-primary-900 sm:text-3xl">Membership Dues</h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-600 sm:text-base">
              Review what you owe, why online payment is or is not available, and your recent
              dues activity.
            </p>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 sm:min-w-[260px] sm:justify-end">
            <div className="text-left sm:text-right">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Outstanding</p>
              <p
                className={`text-2xl font-semibold ${
                  totalOutstanding === 0 ? "text-green-600" : "text-primary-900"
                }`}
              >
                {currencyFormatter.format(totalOutstanding)}
              </p>
              {totalPaid > 0 ? (
                <p className="text-xs text-gray-500">Paid to date: {currencyFormatter.format(totalPaid)}</p>
              ) : null}
            </div>
            <Badge className={isPaidUp ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}>
              {isPaidUp ? "Current" : "Action needed"}
            </Badge>
          </div>
        </div>
      </div>

      {showSuccessMessage ? (
        <div className="fixed right-4 top-4 z-50 rounded-lg bg-green-500 px-4 py-3 text-white shadow-lg">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            <span>Payment submitted. Your dues status will refresh after Crowded confirms it.</span>
          </div>
        </div>
      ) : null}

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
          <Card className="border-primary-200 bg-gradient-to-br from-primary-50 to-accent-50">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-brand-primary" />
                What You Owe
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total outstanding across all active assignments</p>
                  <p className="mt-1 text-4xl font-semibold text-primary-900">
                    {currencyFormatter.format(totalOutstanding)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/70 bg-white/70 px-4 py-3 text-sm text-gray-700">
                  <p className="font-medium text-gray-900">
                    {outstandingAssignments.length} unpaid assignment
                    {outstandingAssignments.length === 1 ? "" : "s"}
                  </p>
                  <p className="mt-1 text-gray-600">
                    {currentAssignment?.cycle?.name || "No active dues cycle selected"}
                  </p>
                </div>
              </div>

              {currentAssignment ? (
                <div className="space-y-4 rounded-xl border border-primary-200/60 bg-white/80 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-semibold text-primary-900">
                          {currentAssignment.cycle?.name || "Chapter dues"}
                        </p>
                        <Badge className={getAssignmentBadge(currentAssignment).className}>
                          {getAssignmentBadge(currentAssignment).label}
                        </Badge>
                      </div>
                      <p className="mt-2 flex items-center gap-2 text-sm text-gray-600">
                        <Calendar className="h-4 w-4 text-brand-primary" />
                        {formatDuesDueDateLabel(currentAssignment.cycle)}
                      </p>
                      {currentAssignment.status === "reduced" ? (
                        <p className="mt-2 text-sm text-gray-600">
                          Your chapter has reduced this assignment from the standard cycle amount.
                        </p>
                      ) : null}
                      {currentAssignment.cycle?.allow_payment_plans ? (
                        <p className="mt-2 text-sm text-gray-600">Payment plans are enabled for this cycle.</p>
                      ) : null}
                    </div>

                    <div className="text-left sm:text-right">
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Next payment</p>
                      <p className="mt-1 text-2xl font-semibold text-primary-900">
                        {currencyFormatter.format(getRemainingBalance(currentAssignment))}
                      </p>
                    </div>
                  </div>

                  {additionalOutstandingCount > 0 ? (
                    <p className="text-sm text-gray-600">
                      Start with this assignment first. {additionalOutstandingCount} other balance
                      {additionalOutstandingCount === 1 ? "" : "s"} appear below.
                    </p>
                  ) : null}

                  {payError ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {payError}
                    </div>
                  ) : null}

                  {payReadiness.canPay && !readinessLoading ? (
                    <div className="space-y-3 border-t border-primary-200/60 pt-4">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id="crowded-pay-consent"
                          checked={crowdedPayConsent}
                          onCheckedChange={(checked) => setCrowdedPayConsent(Boolean(checked))}
                          aria-labelledby="crowded-pay-consent-label"
                        />
                        <Label
                          id="crowded-pay-consent-label"
                          htmlFor="crowded-pay-consent"
                          className="cursor-pointer text-sm font-normal leading-snug text-gray-700"
                        >
                          I authorize payment for this dues balance and agree to continue to Crowded
                          to complete checkout.
                        </Label>
                      </div>

                      <Button
                        className="w-full sm:w-auto"
                        disabled={processingPayment || readinessLoading}
                        onClick={() => handleCrowdedPay(currentAssignment.id)}
                      >
                        {processingPayment ? "Starting checkout..." : "Pay online"}
                      </Button>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-700">
                      Review the readiness panel for the next step before online payment is available.
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-green-200 bg-white/80 p-6 text-center text-green-700">
                  <CheckCircle className="mx-auto mb-3 h-10 w-10" />
                  <p className="text-lg font-semibold">
                    {assignments.length === 0 ? "No dues assigned" : "All dues are current"}
                  </p>
                  <p className="mt-2 text-sm text-gray-600">
                    {assignments.length === 0
                      ? "Nothing is due right now."
                      : "You do not have an outstanding balance at the moment."}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className={`${readinessStyles.card} border`}>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                {payReadiness.canPay ? (
                  <CheckCircle className={`h-5 w-5 ${readinessStyles.icon}`} />
                ) : (
                  <AlertTriangle className={`h-5 w-5 ${readinessStyles.icon}`} />
                )}
                Why You Can&apos;t or Can Pay Now
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Badge className={readinessStyles.badge}>{payReadiness.title}</Badge>
              {readinessLoading ? (
                <p className="text-sm text-gray-500">Checking current Crowded readiness...</p>
              ) : null}
              <p className="text-sm leading-6 text-gray-700">{payReadiness.description}</p>

              {currentAssignment ? (
                <div className="rounded-lg border border-white/70 bg-white/70 p-4 text-sm text-gray-700">
                  <div className="flex items-start gap-2">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary" />
                    <div>
                      <p className="font-medium text-gray-900">Current cycle</p>
                      <p className="mt-1">{currentAssignment.cycle?.name || "Chapter dues"}</p>
                      <p className="mt-1 text-gray-600">
                        {formatDuesDueDateLabel(currentAssignment.cycle)}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="text-sm text-gray-600">
                <p className="font-medium text-gray-900">Need help?</p>
                <p className="mt-1">
                  Contact your chapter treasurer if the wrong amount is shown or online payment is not
                  ready yet.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,1fr)]">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-brand-primary" />
                Other Assignments
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sortedAssignments.length > 0 ? (
                <div className="space-y-3">
                  {sortedAssignments.map((assignment, index) => {
                    const remaining = getRemainingBalance(assignment);
                    const badge = getAssignmentBadge(assignment);
                    const isPrimaryAssignment = currentAssignment?.id === assignment.id;

                    return (
                      <div
                        key={assignment.id}
                        className={`rounded-xl border p-4 ${
                          isPrimaryAssignment
                            ? "border-primary-200 bg-primary-50/60"
                            : "border-gray-200 bg-white"
                        }`}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium text-gray-900">
                                {assignment.cycle?.name || "Chapter dues"}
                              </p>
                              <Badge className={badge.className}>{badge.label}</Badge>
                              {isPrimaryAssignment ? (
                                <Badge variant="outline" className="border-primary-200 text-primary-700">
                                  Next checkout
                                </Badge>
                              ) : null}
                            </div>
                            <p className="mt-2 text-sm text-gray-600">
                              {formatDuesDueDateLabel(assignment.cycle)}
                            </p>
                            <p className="mt-2 text-sm text-gray-600">
                              Paid {currencyFormatter.format(Number(assignment.amount_paid) || 0)} of{" "}
                              {currencyFormatter.format(Number(assignment.amount_due) || 0)}
                            </p>
                          </div>

                          <div className="text-left sm:text-right">
                            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                              Remaining
                            </p>
                            <p className="mt-1 text-lg font-semibold text-primary-900">
                              {currencyFormatter.format(remaining)}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <Calendar className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                  <p className="font-medium text-gray-700">No dues assignments yet</p>
                  <p className="mt-1 text-sm text-gray-500">When your chapter assigns dues, they will appear here.</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-brand-primary" />
                Payment History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {paymentHistory.length > 0 ? (
                <div className="space-y-4">
                  {paymentHistory.map((payment) => (
                    <div
                      key={payment.id}
                      className="flex items-start justify-between gap-3 border-b border-gray-100 pb-4 last:border-b-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900">
                          {payment.cycle?.name || "Chapter dues"}
                        </p>
                        <p className="mt-1 text-sm text-gray-600">
                          {new Date(payment.created_at).toLocaleDateString()}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="font-medium text-gray-900">
                          {currencyFormatter.format(payment.amount)}
                        </p>
                        <Badge className="mt-1 bg-green-100 text-green-800">Paid</Badge>
                      </div>
                    </div>
                  ))}

                  {totalPaymentCount > paymentHistory.length ? (
                    <p className="border-t border-gray-100 pt-3 text-sm text-gray-500">
                      Showing {paymentHistory.length} of {totalPaymentCount} successful payments.
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <CreditCard className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                  <p className="font-medium text-gray-700">No payment history yet</p>
                  <p className="mt-1 text-sm text-gray-500">
                    Completed dues payments will appear here once they are recorded.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <MobileBottomNavigation />
    </div>
  );
}