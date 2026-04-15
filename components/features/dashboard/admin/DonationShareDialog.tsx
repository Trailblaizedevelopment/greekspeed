'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { toast } from 'react-toastify';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useDonationShareCandidates, useShareDonationMutation } from '@/lib/hooks/useDonationCampaignShare';
import type { DonationShareCandidate } from '@/types/donationCampaignRecipients';

export interface DonationShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chapterId: string;
  campaignId: string;
  campaignTitle: string;
}

type TabId = 'contacts' | 'tags';

function initialsFor(c: DonationShareCandidate): string {
  const parts = c.displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
  }
  const one = parts[0] ?? '?';
  return one.slice(0, 2).toUpperCase();
}

export function DonationShareDialog({
  open,
  onOpenChange,
  chapterId,
  campaignId,
  campaignTitle,
}: DonationShareDialogProps) {
  const [tab, setTab] = useState<TabId>('contacts');
  const [step, setStep] = useState<'pick' | 'confirm'>('pick');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const candidatesQuery = useDonationShareCandidates(chapterId, campaignId, open);
  const shareMutation = useShareDonationMutation(chapterId);

  useEffect(() => {
    if (!open) {
      setStep('pick');
      setSearch('');
      setSelected(new Set());
      setTab('contacts');
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = candidatesQuery.data ?? [];
    if (!q) return list;
    return list.filter(
      (c) =>
        c.displayName.toLowerCase().includes(q) ||
        (c.email?.toLowerCase().includes(q) ?? false)
    );
  }, [candidatesQuery.data, search]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((c) => selected.has(c.profileId));

  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAllFiltered = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const c of filtered) next.delete(c.profileId);
      } else {
        for (const c of filtered) next.add(c.profileId);
      }
      return next;
    });
  }, [allFilteredSelected, filtered]);

  const selectedCount = selected.size;
  const selectedList = useMemo(() => {
    const map = new Map((candidatesQuery.data ?? []).map((c) => [c.profileId, c]));
    return Array.from(selected)
      .map((id) => map.get(id))
      .filter(Boolean) as DonationShareCandidate[];
  }, [candidatesQuery.data, selected]);

  const handlePrimaryPick = () => {
    if (selectedCount === 0) {
      toast.error('Select at least one member');
      return;
    }
    setStep('confirm');
  };

  const handleConfirm = () => {
    shareMutation.mutate(
      { campaignId, profileIds: Array.from(selected) },
      {
        onSuccess: (saved) => {
          toast.success(
            saved === selectedCount
              ? `Linked ${saved} member${saved === 1 ? '' : 's'} to this donation`
              : `Saved ${saved} recipient row(s)`
          );
          onOpenChange(false);
        },
        onError: (e: Error & { code?: string }) => {
          toast.error(e.message || 'Could not save');
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0 sm:max-w-lg">
        <div className="border-b border-gray-100 bg-white px-6 pt-6 pb-4">
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="text-xl font-semibold text-gray-900">
              {step === 'pick' ? 'Email contacts' : 'Share donation'}
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              {step === 'pick'
                ? `Choose chapter members who already have a Crowded contact for “${campaignTitle}”.`
                : `Send payment link to ${selectedCount} contact${selectedCount === 1 ? '' : 's'}?`}
            </DialogDescription>
          </DialogHeader>
        </div>

        {step === 'pick' ? (
          <>
            <div className="flex gap-0 border-b border-gray-100 px-6">
              <button
                type="button"
                className={cn(
                  '-mb-px flex-1 border-b-2 py-3 text-sm font-medium transition-colors',
                  tab === 'contacts'
                    ? 'border-brand-primary text-brand-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                )}
                onClick={() => setTab('contacts')}
              >
                Contacts
              </button>
              <button
                type="button"
                className={cn(
                  '-mb-px flex-1 border-b-2 py-3 text-sm font-medium transition-colors',
                  tab === 'tags'
                    ? 'border-brand-primary text-brand-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                )}
                onClick={() => setTab('tags')}
              >
                Tags
              </button>
            </div>

            {tab === 'contacts' ? (
              <div className="flex max-h-[min(420px,55vh)] flex-col bg-white">
                <div className="shrink-0 border-b border-gray-100 px-6 py-3">
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                      aria-hidden
                    />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search…"
                      className="pl-9"
                      aria-label="Search contacts"
                    />
                  </div>
                </div>
                {candidatesQuery.isLoading ? (
                  <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                    Loading contacts…
                  </div>
                ) : candidatesQuery.isError ? (
                  <p className="px-6 py-8 text-center text-sm text-red-600">
                    {candidatesQuery.error.message}
                  </p>
                ) : filtered.length === 0 ? (
                  <p className="px-6 py-10 text-center text-sm text-gray-500">
                    No chapter members with a matching Crowded contact. Sync contacts to Crowded or fix
                    profile emails, then try again.
                  </p>
                ) : (
                  <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
                    <label className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-gray-50">
                      <Checkbox
                        checked={allFilteredSelected}
                        onCheckedChange={() => toggleSelectAllFiltered()}
                        aria-label="Select all visible contacts"
                      />
                      <span className="text-sm font-medium text-gray-900">Select all</span>
                    </label>
                    <ul className="space-y-0.5 pb-2">
                      {filtered.map((c) => (
                        <li key={c.profileId}>
                          <label
                            className={cn(
                              'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-gray-50',
                              selected.has(c.profileId) && 'bg-gray-50/80'
                            )}
                          >
                            <Checkbox
                              checked={selected.has(c.profileId)}
                              onCheckedChange={() => toggleOne(c.profileId)}
                              aria-label={`Select ${c.displayName}`}
                            />
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-700">
                              {initialsFor(c)}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-gray-900">
                                {c.displayName}
                              </span>
                              {c.email ? (
                                <span className="block truncate text-xs text-gray-500">{c.email}</span>
                              ) : null}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white px-6 py-12 text-center text-sm text-gray-500">
                Tags are not available in Trailblaize yet.
              </div>
            )}

            <DialogFooter className="border-t border-gray-100 bg-gray-50/80 px-6 py-4 sm:justify-center">
              <Button
                type="button"
                className="w-full max-w-xs rounded-full bg-gray-900 text-white hover:bg-gray-800 sm:w-auto"
                disabled={selectedCount === 0 || candidatesQuery.isLoading}
                onClick={handlePrimaryPick}
              >
                Select
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="flex flex-col items-center bg-white px-6 py-10 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                <span className="text-2xl font-semibold">i</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Confirmation</h3>
              <p className="mt-2 max-w-sm text-sm text-gray-600">
                Link {selectedCount} member{selectedCount === 1 ? '' : 's'} to this donation in Trailblaize
                (Crowded contact ids stored). Payment emails can be wired in a follow-up.
              </p>
              <ul className="mt-4 max-h-28 w-full max-w-sm overflow-y-auto text-left text-xs text-gray-500">
                {selectedList.slice(0, 8).map((c) => (
                  <li key={c.profileId} className="truncate py-0.5">
                    • {c.displayName}
                  </li>
                ))}
                {selectedList.length > 8 ? (
                  <li className="py-0.5">…and {selectedList.length - 8} more</li>
                ) : null}
              </ul>
            </div>
            <DialogFooter className="flex flex-col gap-2 border-t border-gray-100 bg-white px-6 py-4 sm:flex-col">
              <Button
                type="button"
                className="w-full rounded-full bg-brand-primary hover:bg-brand-primary-hover"
                disabled={shareMutation.isPending}
                onClick={handleConfirm}
              >
                {shareMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                    Saving…
                  </>
                ) : (
                  'Confirm'
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full text-gray-600"
                disabled={shareMutation.isPending}
                onClick={() => setStep('pick')}
              >
                Go back
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
