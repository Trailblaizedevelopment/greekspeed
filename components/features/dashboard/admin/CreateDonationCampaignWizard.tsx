'use client';

import { useCallback, useMemo, useState } from 'react';
import { ChevronLeft, HeartHandshake, Loader2, Megaphone } from 'lucide-react';
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
import type { CreateDonationCampaignPayload } from '@/lib/hooks/useDonationCampaigns';
import type { DonationCampaign } from '@/types/donationCampaigns';
import type { DonationCampaignCreateKind } from '@/types/donationCampaigns';
import { STRIPE_OPEN_DONATION_MIN_CENTS } from '@/lib/services/donations/createStripeDonationCampaignOnConnect';

const TOTAL_STEPS = 4;

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export interface CreateDonationCampaignWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stripeDonationsPrimary: boolean;
  isPending: boolean;
  mutateAsync: (payload: CreateDonationCampaignPayload) => Promise<DonationCampaign>;
}

export function CreateDonationCampaignWizard({
  open,
  onOpenChange,
  stripeDonationsPrimary,
  isPending,
  mutateAsync,
}: CreateDonationCampaignWizardProps) {
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<DonationCampaignCreateKind>('open');
  const [title, setTitle] = useState('');
  const [goalUsd, setGoalUsd] = useState('');
  const [publicFundraising, setPublicFundraising] = useState(true);
  const [description, setDescription] = useState('');
  const [heroImageUrl, setHeroImageUrl] = useState('');

  const reset = useCallback(() => {
    setStep(0);
    setKind('open');
    setTitle('');
    setGoalUsd('');
    setPublicFundraising(true);
    setDescription('');
    setHeroImageUrl('');
  }, []);

  const handleClose = useCallback(
    (next: boolean) => {
      if (!next) reset();
      onOpenChange(next);
    },
    [onOpenChange, reset]
  );

  const goalAmountCents = useMemo(() => {
    const g = Number(goalUsd);
    if (!Number.isFinite(g) || g <= 0) return null;
    const cents = Math.round(g * 100);
    return cents >= 1 ? cents : null;
  }, [goalUsd]);

  const stepTitle = () => {
    if (step === 0) return 'Drive type';
    if (step === 1) return 'Title & goal';
    if (step === 2) return 'Story & image';
    return 'Review';
  };

  const canGoNext = useMemo(() => {
    if (step === 0) return true;
    if (step === 1) {
      const t = title.trim();
      if (!t) return false;
      if (goalAmountCents == null) return false;
      if (stripeDonationsPrimary && kind === 'open' && goalAmountCents <= STRIPE_OPEN_DONATION_MIN_CENTS) {
        return false;
      }
      return true;
    }
    if (step === 2) {
      const heroTrim = heroImageUrl.trim();
      if (!heroTrim) return true;
      try {
        return new URL(heroTrim).protocol === 'https:';
      } catch {
        return false;
      }
    }
    return false;
  }, [step, title, goalAmountCents, kind, stripeDonationsPrimary, heroImageUrl]);

  const nextDisabled = (step === 1 || step === 2) && !canGoNext;

  const canSubmit = useMemo(() => {
    const t = title.trim();
    if (!t || goalAmountCents == null) return false;
    if (stripeDonationsPrimary && kind === 'open' && goalAmountCents <= STRIPE_OPEN_DONATION_MIN_CENTS) {
      return false;
    }
    const heroTrim = heroImageUrl.trim();
    if (heroTrim) {
      try {
        if (new URL(heroTrim).protocol !== 'https:') return false;
      } catch {
        return false;
      }
    }
    return true;
  }, [title, goalAmountCents, kind, stripeDonationsPrimary, heroImageUrl]);

  const submit = async () => {
    const t = title.trim();
    if (!t) {
      toast.error('Enter a title');
      return;
    }
    if (goalAmountCents == null) {
      toast.error('Enter a valid goal greater than zero');
      return;
    }
    if (stripeDonationsPrimary && kind === 'open' && goalAmountCents <= STRIPE_OPEN_DONATION_MIN_CENTS) {
      toast.error(
        `Open Stripe drives need a goal above $${(STRIPE_OPEN_DONATION_MIN_CENTS / 100).toFixed(2)} (that goal is the maximum donors can pay).`
      );
      return;
    }
    const heroTrim = heroImageUrl.trim();
    if (heroTrim) {
      try {
        const u = new URL(heroTrim);
        if (u.protocol !== 'https:') {
          toast.error('Hero image URL must start with https://');
          return;
        }
      } catch {
        toast.error('Enter a valid https URL for the hero image, or leave it blank');
        return;
      }
    }

    const payload: CreateDonationCampaignPayload = {
      title: t,
      kind,
      goalAmountCents,
      ...(kind === 'fundraiser' ? { showOnPublicFundraisingChannels: publicFundraising } : {}),
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(heroTrim ? { heroImageUrl: heroTrim } : {}),
    };

    try {
      await mutateAsync(payload);
      toast.success('Donation drive created');
      handleClose(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create drive');
    }
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
                disabled={isPending}
                aria-label="Back"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            ) : null}
            <DialogTitle className="text-lg text-primary-900">Create donation drive</DialogTitle>
          </div>
          <p className="text-xs text-gray-500 font-normal">{stepTitle()}</p>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {step === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Open drives let donors choose an amount up to your goal. Fundraiser drives use one fixed amount
                (your goal).
              </p>
              <button
                type="button"
                onClick={() => {
                  setKind('open');
                  setStep(1);
                }}
                disabled={isPending}
                className={cn(
                  'w-full rounded-xl border-2 border-brand-primary/40 bg-brand-primary/5 p-4 text-left transition hover:bg-brand-primary/10'
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-brand-primary/15 p-2 text-brand-primary">
                    <HeartHandshake className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Open amount</p>
                    <p className="text-sm text-gray-600 mt-0.5">
                      Donors pick an amount within limits — goal is the cap (Stripe custom amount) or Crowded Payment
                      style.
                    </p>
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setKind('fundraiser');
                  setStep(1);
                }}
                disabled={isPending}
                className={cn(
                  'w-full rounded-xl border-2 border-brand-primary/40 bg-brand-primary/5 p-4 text-left transition hover:bg-brand-primary/10'
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-brand-primary/15 p-2 text-brand-primary">
                    <Megaphone className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Fundraiser</p>
                    <p className="text-sm text-gray-600 mt-0.5">
                      Fixed donation amount equal to your goal; optional public fundraising visibility for Crowded.
                    </p>
                  </div>
                </div>
              </button>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="wizard-donation-title">Donation title</Label>
                <Input
                  id="wizard-donation-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Spring philanthropy drive"
                  maxLength={500}
                  disabled={isPending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wizard-donation-goal">Goal (USD)</Label>
                <Input
                  id="wizard-donation-goal"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={0.01}
                  value={goalUsd}
                  onChange={(e) => setGoalUsd(e.target.value)}
                  placeholder="0.00"
                  disabled={isPending}
                  className="tabular-nums"
                />
                <p className="text-xs text-gray-500">
                  {stripeDonationsPrimary ? (
                    kind === 'open' ? (
                      <>
                        Donors choose any amount from ${(STRIPE_OPEN_DONATION_MIN_CENTS / 100).toFixed(2)} up to this
                        goal (Stripe <span className="font-medium text-gray-700">custom amount</span> cap).
                      </>
                    ) : (
                      'Becomes the fixed donation amount (Stripe Price).'
                    )
                  ) : (
                    <>
                      Sent to Crowded as <code className="text-xs">goalAmount</code> in cents.
                    </>
                  )}
                </p>
              </div>
              {kind === 'fundraiser' ? (
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer rounded-lg border border-gray-100 bg-gray-50/80 p-3">
                  <Checkbox
                    id="wizard-donation-public"
                    checked={publicFundraising}
                    onCheckedChange={(c) => setPublicFundraising(Boolean(c))}
                    disabled={isPending}
                  />
                  <span>
                    {stripeDonationsPrimary
                      ? 'Show on public fundraising channels (metadata for Stripe; Crowded uses its own type when applicable)'
                      : 'Show on public fundraising channels (Crowded)'}
                  </span>
                </label>
              ) : null}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="wizard-donation-description">Description (optional)</Label>
                <Textarea
                  id="wizard-donation-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Shown to members and on Stripe Checkout when using Connect."
                  maxLength={2000}
                  rows={3}
                  disabled={isPending}
                  className="resize-y min-h-[5rem]"
                />
                <p className="text-xs text-gray-500">{description.length}/2000</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="wizard-donation-hero">Hero image URL (optional)</Label>
                <Input
                  id="wizard-donation-hero"
                  type="url"
                  inputMode="url"
                  value={heroImageUrl}
                  onChange={(e) => setHeroImageUrl(e.target.value)}
                  placeholder="https://… (public image; Stripe uses https only)"
                  maxLength={2048}
                  disabled={isPending}
                />
                <p className="text-xs text-gray-500">
                  {stripeDonationsPrimary
                    ? 'Used on the Stripe Product and in Trailblaize wherever we show this drive.'
                    : 'Stored for chapter UI; Crowded does not receive this field from Trailblaize today.'}
                </p>
                {heroImageUrl.trim() && !canGoNext ? (
                  <p className="text-xs text-amber-700">Enter a valid https URL or clear the field.</p>
                ) : null}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/80 p-4 text-sm">
              <p className="font-medium text-gray-900">Summary</p>
              <dl className="space-y-2 text-gray-700">
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500 shrink-0">Title</dt>
                  <dd className="text-right font-medium text-gray-900">{title.trim() || '—'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500 shrink-0">Type</dt>
                  <dd className="text-right capitalize">{kind}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500 shrink-0">Goal</dt>
                  <dd className="text-right tabular-nums font-medium">
                    {goalAmountCents != null ? money.format(goalAmountCents / 100) : '—'}
                  </dd>
                </div>
                {kind === 'fundraiser' ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500 shrink-0">Public channels</dt>
                    <dd className="text-right">{publicFundraising ? 'Yes' : 'No'}</dd>
                  </div>
                ) : null}
                {description.trim() ? (
                  <div className="pt-1 border-t border-gray-200/80">
                    <dt className="text-gray-500 mb-1">Description</dt>
                    <dd className="text-gray-800 whitespace-pre-wrap text-xs leading-relaxed">{description.trim()}</dd>
                  </div>
                ) : null}
                {heroImageUrl.trim() ? (
                  <div className="flex justify-between gap-4 items-start">
                    <dt className="text-gray-500 shrink-0">Hero image</dt>
                    <dd className="text-right break-all text-xs text-gray-800">{heroImageUrl.trim()}</dd>
                  </div>
                ) : null}
              </dl>
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
            <Button
              type="button"
              variant="outline"
              onClick={() => handleClose(false)}
              disabled={isPending}
              className="rounded-full"
            >
              Cancel
            </Button>
            {step === 0 ? null : step < TOTAL_STEPS - 1 ? (
              <Button
                type="button"
                className="bg-brand-primary hover:bg-brand-primary-hover rounded-full"
                disabled={nextDisabled || isPending}
                onClick={() => setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1))}
              >
                Next
              </Button>
            ) : (
              <Button
                type="button"
                className="bg-brand-primary hover:bg-brand-primary-hover rounded-full"
                disabled={!canSubmit || isPending}
                onClick={() => void submit()}
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />
                    Creating…
                  </>
                ) : (
                  'Create drive'
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
