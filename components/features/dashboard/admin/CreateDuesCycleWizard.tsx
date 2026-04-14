'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Loader2, Lock } from 'lucide-react';
import { toast } from 'react-toastify';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const TOTAL_STEPS = 5;

export interface CreateDuesCycleWizardMember {
  id: string;
  full_name: string | null;
  email: string | null;
}

export interface CreateDuesCycleWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chapterId: string;
  /** When true, “Link Crowded collection” defaults on and Crowded is required for that option. */
  crowdedIntegrationEnabled: boolean;
  members: CreateDuesCycleWizardMember[];
  onSuccess: () => void | Promise<void>;
}

export function CreateDuesCycleWizard({
  open,
  onOpenChange,
  chapterId,
  crowdedIntegrationEnabled,
  members,
  onSuccess,
}: CreateDuesCycleWizardProps) {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [baseAmount, setBaseAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [allowPaymentPlans, setAllowPaymentPlans] = useState(false);
  const [linkCrowded, setLinkCrowded] = useState(crowdedIntegrationEnabled);
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!crowdedIntegrationEnabled) {
      setLinkCrowded(false);
    }
  }, [crowdedIntegrationEnabled]);

  const reset = useCallback(() => {
    setStep(0);
    setBaseAmount('');
    setDueDate('');
    setName('');
    setDescription('');
    setAllowPaymentPlans(false);
    setLinkCrowded(crowdedIntegrationEnabled);
    setMemberSearch('');
    setSelectedMemberIds(new Set());
  }, [crowdedIntegrationEnabled]);

  const handleClose = useCallback(
    (next: boolean) => {
      if (!next) reset();
      onOpenChange(next);
    },
    [onOpenChange, reset]
  );

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        (m.full_name ?? '').toLowerCase().includes(q) ||
        (m.email ?? '').toLowerCase().includes(q)
    );
  }, [members, memberSearch]);

  const toggleMember = (id: string) => {
    setSelectedMemberIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const selectAllFiltered = () => {
    setSelectedMemberIds((prev) => {
      const n = new Set(prev);
      for (const m of filteredMembers) {
        n.add(m.id);
      }
      return n;
    });
  };

  const canGoNext = useMemo(() => {
    if (step === 0) return true;
    if (step === 1) {
      const amt = parseFloat(baseAmount);
      return Number.isFinite(amt) && amt >= 0 && dueDate.trim().length > 0;
    }
    if (step === 2) return name.trim().length > 0;
    if (step === 3) return true;
    if (step === 4) {
      if (linkCrowded && !crowdedIntegrationEnabled) return false;
      return true;
    }
    return false;
  }, [step, baseAmount, dueDate, name, linkCrowded, crowdedIntegrationEnabled]);

  const submit = async () => {
    const amt = parseFloat(baseAmount);
    if (!Number.isFinite(amt) || amt < 0 || !dueDate.trim() || !name.trim()) {
      toast.error('Please complete amount, due date, and name.');
      return;
    }
    if (linkCrowded && !crowdedIntegrationEnabled) {
      toast.error('Crowded is not enabled for this chapter.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/dues/cycles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          chapterId,
          name: name.trim(),
          base_amount: amt,
          due_date: dueDate,
          description: description.trim() || undefined,
          allow_payment_plans: allowPaymentPlans,
          linkCrowded,
          assignMemberIds: Array.from(selectedMemberIds),
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        error?: string;
        details?: string;
        cycle?: { id: string };
        crowdedLinked?: boolean;
        assignmentSummary?: { created: number; skipped: number; errors: string[] };
      } | null;

      if (!res.ok) {
        toast.error(json?.error || json?.details || `Could not create cycle (${res.status})`);
        return;
      }

      const sum = json?.assignmentSummary;
      if (sum && sum.errors.length > 0 && sum.created === 0) {
        toast.warn(`Cycle created; assignments: ${sum.errors.slice(0, 2).join(' ')}`);
      } else {
        toast.success(
          json?.crowdedLinked
            ? 'Dues cycle created and linked to Crowded.'
            : 'Dues cycle created.'
        );
      }
      if (sum && sum.created > 0) {
        toast.info(`Assigned ${sum.created} member${sum.created === 1 ? '' : 's'}.`);
      }

      handleClose(false);
      await onSuccess();
    } catch (e) {
      console.error(e);
      toast.error('Network error creating dues cycle.');
    } finally {
      setSubmitting(false);
    }
  };

  const stepTitle = () => {
    if (step === 0) return 'Collection type';
    if (step === 1) return 'Amount & due date';
    if (step === 2) return 'Name';
    if (step === 3) return 'Description';
    return 'Assign & Crowded';
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto bg-white border border-gray-200 shadow-xl">
        <DialogHeader className="space-y-1 border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2">
            {step > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 shrink-0"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                aria-label="Back"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            ) : null}
            <DialogTitle className="text-lg text-primary-900">Create dues cycle</DialogTitle>
          </div>
          <p className="text-xs text-gray-500 font-normal">{stepTitle()}</p>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {step === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Fixed-amount collections match standard chapter dues. Other Crowded types can be
                added later.
              </p>
              <button
                type="button"
                onClick={() => setStep(1)}
                className={cn(
                  'w-full rounded-xl border-2 border-brand-primary/40 bg-brand-primary/5 p-4 text-left transition hover:bg-brand-primary/10'
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-brand-primary/15 p-2 text-brand-primary">
                    <Lock className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Fixed amount</p>
                    <p className="text-sm text-gray-600 mt-0.5">
                      Set an amount — same model as Crowded dues and tickets.
                    </p>
                  </div>
                </div>
              </button>
              <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 text-left opacity-60">
                <p className="font-medium text-gray-700">Open amount & fundraiser</p>
                <p className="text-sm text-gray-500 mt-0.5">Coming soon</p>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="wizard-amt">How much should each person pay? ($)</Label>
                <Input
                  id="wizard-amt"
                  type="number"
                  min={0}
                  step="0.01"
                  value={baseAmount}
                  onChange={(e) => setBaseAmount(e.target.value)}
                  className="mt-1 text-lg tabular-nums"
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label htmlFor="wizard-due">Due date</Label>
                <Input
                  id="wizard-due"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50/80 p-3">
                <Checkbox
                  id="wizard-plans"
                  checked={allowPaymentPlans}
                  onCheckedChange={(c) => setAllowPaymentPlans(Boolean(c))}
                />
                <Label htmlFor="wizard-plans" className="text-sm font-normal cursor-pointer">
                  Allow payment plans
                </Label>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <Label htmlFor="wizard-name">Name your cycle</Label>
              <Input
                id="wizard-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1"
                placeholder="e.g. Spring 2026 dues"
                maxLength={500}
              />
            </div>
          )}

          {step === 3 && (
            <div>
              <Label htmlFor="wizard-desc">Description (optional)</Label>
              <Textarea
                id="wizard-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 min-h-[120px]"
                placeholder="Shown internally and useful for member context."
                maxLength={5000}
              />
              <p className="text-xs text-gray-400 mt-1 text-right">{description.length} / 5000</p>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              {crowdedIntegrationEnabled ? (
                <div className="flex items-start gap-2 rounded-lg border border-emerald-100 bg-emerald-50/50 p-3">
                  <Checkbox
                    id="wizard-crowded"
                    checked={linkCrowded}
                    onCheckedChange={(c) => setLinkCrowded(Boolean(c))}
                  />
                  <div>
                    <Label htmlFor="wizard-crowded" className="text-sm font-medium cursor-pointer">
                      Link Crowded collection
                    </Label>
                    <p className="text-xs text-gray-600 mt-0.5">
                      Creates one Crowded collection for online checkout. This cannot be undone
                      from Trailblaize to avoid duplicate collections.
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-md p-2">
                  Crowded is not enabled for this chapter. The cycle will be created without a
                  Crowded link.
                </p>
              )}

              <div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                  <Label>Assign members</Label>
                  <Button type="button" variant="outline" size="sm" onClick={selectAllFiltered} className="rounded-full">
                    Select all
                  </Button>
                </div>
                <Input
                  placeholder="Search members…"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  className="mb-2"
                />
                <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
                  {filteredMembers.length === 0 ? (
                    <p className="p-3 text-sm text-gray-500">No members match.</p>
                  ) : (
                    filteredMembers.map((m) => (
                      <label
                        key={m.id}
                        className="flex items-center gap-3 p-2.5 hover:bg-gray-50 cursor-pointer"
                      >
                        <Checkbox
                          checked={selectedMemberIds.has(m.id)}
                          onCheckedChange={() => toggleMember(m.id)}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {m.full_name || 'Member'}
                          </p>
                          <p className="text-xs text-gray-500 truncate">{m.email || '—'}</p>
                        </div>
                      </label>
                    ))
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {selectedMemberIds.size} selected — creates required assignments for this cycle.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 pt-2 border-t border-gray-100">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 font-medium tabular-nums"
              aria-hidden
            >
              {step + 1}/{TOTAL_STEPS}
            </span>
            <span className="hidden sm:inline">{stepTitle()}</span>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={submitting} className="rounded-full">
              Cancel
            </Button>
            {step < TOTAL_STEPS - 1 ? (
              <Button
                type="button"
                className="bg-brand-primary hover:bg-brand-primary-hover rounded-full"
                disabled={!canGoNext}
                onClick={() => setStep((s) => s + 1)}
              >
                Next
              </Button>
            ) : (
              <Button
                type="button"
                className="bg-brand-primary hover:bg-brand-primary-hover rounded-full"
                disabled={!canGoNext || submitting}
                onClick={() => void submit()}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating…
                  </>
                ) : (
                  'Create cycle'
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
