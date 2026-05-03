'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, ChevronLeft, HeartHandshake, Loader2, Megaphone, Upload } from 'lucide-react';
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
import type {
  CreateDonationCampaignPayload,
  UpdateDonationCampaignDetailsPayload,
} from '@/lib/hooks/useDonationCampaigns';
import type { DonationCampaign } from '@/types/donationCampaigns';
import type { DonationCampaignCreateKind } from '@/types/donationCampaigns';
import { STRIPE_OPEN_DONATION_MIN_CENTS } from '@/lib/services/donations/createStripeDonationCampaignOnConnect';
import { ImageCropper } from '@/components/features/common/ImageCropper';
import { DONATION_HERO_CONSTRAINTS } from '@/lib/constants/imageConstants';
import { DONATION_HERO_UPLOAD_ALLOWED_TYPES } from '@/lib/constants/donationHeroImageConstants';

const TOTAL_STEPS = 4;

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export interface CreateDonationCampaignWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chapter id for hero image upload API. */
  chapterId: string;
  /** When set, wizard edits this campaign (type and goal are read-only). */
  editingCampaign?: DonationCampaign | null;
  createMutateAsync: (payload: CreateDonationCampaignPayload) => Promise<DonationCampaign>;
  updateMutateAsync: (vars: {
    campaignId: string;
    payload: UpdateDonationCampaignDetailsPayload;
  }) => Promise<DonationCampaign>;
  isCreatePending: boolean;
  isUpdatePending: boolean;
}

function validateHeroImageFile(file: File): string | null {
  const allowed = DONATION_HERO_UPLOAD_ALLOWED_TYPES as readonly string[];
  if (!allowed.includes(file.type)) {
    return 'Please choose a JPEG, PNG, WebP, or GIF image.';
  }
  if (file.size > DONATION_HERO_CONSTRAINTS.MAX_SIZE) {
    return `Image must be ${Math.floor(DONATION_HERO_CONSTRAINTS.MAX_SIZE / (1024 * 1024))} MB or smaller.`;
  }
  return null;
}

function wizardKindFromCampaign(c: DonationCampaign): DonationCampaignCreateKind {
  if (c.kind === 'open') return 'open';
  return 'fundraiser';
}

export function CreateDonationCampaignWizard({
  open,
  onOpenChange,
  chapterId,
  editingCampaign = null,
  createMutateAsync,
  updateMutateAsync,
  isCreatePending,
  isUpdatePending,
}: CreateDonationCampaignWizardProps) {
  const isEditMode = Boolean(editingCampaign);
  const isPending = isCreatePending || isUpdatePending;
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<DonationCampaignCreateKind>('open');
  const [title, setTitle] = useState('');
  const [goalUsd, setGoalUsd] = useState('');
  const [publicFundraising, setPublicFundraising] = useState(true);
  const [description, setDescription] = useState('');
  const [heroImageUrl, setHeroImageUrl] = useState('');
  const [cropperOpen, setCropperOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState('');
  const [heroUploading, setHeroUploading] = useState(false);
  const [isHeroDragging, setIsHeroDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const cropObjectUrlRef = useRef<string | null>(null);

  const revokeCropObjectUrl = useCallback(() => {
    if (cropObjectUrlRef.current) {
      URL.revokeObjectURL(cropObjectUrlRef.current);
      cropObjectUrlRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    setStep(0);
    setKind('open');
    setTitle('');
    setGoalUsd('');
    setPublicFundraising(true);
    setDescription('');
    setHeroImageUrl('');
    setCropperOpen(false);
    setCropImageSrc('');
    setHeroUploading(false);
    setIsHeroDragging(false);
    revokeCropObjectUrl();
  }, [revokeCropObjectUrl]);

  useEffect(() => {
    if (!open) {
      revokeCropObjectUrl();
      setCropImageSrc('');
      setCropperOpen(false);
    }
  }, [open, revokeCropObjectUrl]);

  const wizardSessionKeyRef = useRef<string | null>(null);
  const editingCampaignRef = useRef(editingCampaign);
  editingCampaignRef.current = editingCampaign;

  useEffect(() => {
    if (!open) {
      wizardSessionKeyRef.current = null;
      return;
    }
    const sessionKey = editingCampaign?.id ?? '__create__';
    if (wizardSessionKeyRef.current === sessionKey) {
      return;
    }
    wizardSessionKeyRef.current = sessionKey;

    const c = editingCampaignRef.current;
    if (c) {
      revokeCropObjectUrl();
      setCropImageSrc('');
      setCropperOpen(false);
      setHeroUploading(false);
      setIsHeroDragging(false);
      setKind(wizardKindFromCampaign(c));
      const cents = c.goal_amount_cents;
      setGoalUsd(cents != null && Number.isFinite(Number(cents)) ? (Number(cents) / 100).toFixed(2) : '');
      setTitle(c.title ?? '');
      setDescription((c.description ?? '').toString());
      setHeroImageUrl((c.hero_image_url ?? '').toString());
      const meta = c.metadata as Record<string, unknown> | undefined;
      const pub = meta?.showOnPublicFundraisingChannels;
      const isFund = c.kind === 'fundraiser' || c.kind === 'fixed';
      setPublicFundraising(pub === true || pub === 'true' || (pub === undefined && isFund));
      setStep(1);
    } else {
      reset();
    }
  }, [open, editingCampaign?.id, reset, revokeCropObjectUrl]);

  const beginHeroCropFromFile = useCallback(
    (file: File) => {
      const err = validateHeroImageFile(file);
      if (err) {
        toast.error(err);
        return;
      }
      revokeCropObjectUrl();
      const url = URL.createObjectURL(file);
      cropObjectUrlRef.current = url;
      setCropImageSrc(url);
      setCropperOpen(true);
    },
    [revokeCropObjectUrl]
  );

  const uploadCroppedHeroBlob = useCallback(
    async (blob: Blob) => {
      const cid = chapterId.trim();
      if (!cid) {
        toast.error('Missing chapter');
        return;
      }
      const formData = new FormData();
      formData.append('file', blob, 'donation-hero.jpg');
      const res = await fetch(`/api/chapters/${cid}/donations/upload-hero-image`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const json = (await res.json()) as { data?: { publicUrl: string }; error?: string };
      if (!res.ok) {
        throw new Error(typeof json.error === 'string' ? json.error : 'Upload failed');
      }
      const url = json.data?.publicUrl?.trim();
      if (!url) {
        throw new Error('Invalid upload response');
      }
      setHeroImageUrl(url);
    },
    [chapterId]
  );

  const handleHeroCropComplete = useCallback(
    (blob: Blob) => {
      void (async () => {
        setHeroUploading(true);
        try {
          await uploadCroppedHeroBlob(blob);
          toast.success('Image saved');
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Could not upload image');
        } finally {
          setHeroUploading(false);
        }
      })();
    },
    [uploadCroppedHeroBlob]
  );

  const handleCropperClose = useCallback(() => {
    setCropperOpen(false);
    setCropImageSrc('');
    revokeCropObjectUrl();
  }, [revokeCropObjectUrl]);

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
    if (step === 0) return 'Donation type';
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
      if (kind === 'open' && goalAmountCents <= STRIPE_OPEN_DONATION_MIN_CENTS) {
        return false;
      }
      return true;
    }
    if (step === 2) {
      return true;
    }
    return false;
  }, [step, title, goalAmountCents, kind]);

  const nextDisabled = (step === 1 || step === 2) && !canGoNext;

  const canSubmit = useMemo(() => {
    const t = title.trim();
    if (!t || goalAmountCents == null) return false;
    if (kind === 'open' && goalAmountCents <= STRIPE_OPEN_DONATION_MIN_CENTS) {
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
  }, [title, goalAmountCents, kind, heroImageUrl]);

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
    if (kind === 'open' && goalAmountCents <= STRIPE_OPEN_DONATION_MIN_CENTS) {
      toast.error(
        `Open Stripe donations need a goal above $${(STRIPE_OPEN_DONATION_MIN_CENTS / 100).toFixed(2)} (that goal is the maximum donors can pay).`
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
        toast.error('Hero image must be a valid https URL from upload, or leave it blank');
        return;
      }
    }

    if (isEditMode && editingCampaign) {
      const payload: UpdateDonationCampaignDetailsPayload = {
        title: t,
        description: description.trim() ? description.trim() : null,
        heroImageUrl: heroTrim || null,
        ...(kind === 'fundraiser'
          ? { showOnPublicFundraisingChannels: publicFundraising }
          : {}),
      };
      try {
        await updateMutateAsync({ campaignId: editingCampaign.id, payload });
        toast.success('Changes saved');
        handleClose(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not save changes');
      }
      return;
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
      await createMutateAsync(payload);
      toast.success('Donation created');
      handleClose(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create donation');
    }
  };

  return (
    <>
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
            <DialogTitle className="text-lg text-primary-900">
              {isEditMode ? 'Edit donation' : 'Create donation'}
            </DialogTitle>
          </div>
          <p className="text-xs text-gray-500 font-normal">{stepTitle()}</p>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {step === 0 && (
            <div className="space-y-3">
              {isEditMode ? (
                <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 text-sm text-gray-700">
                  <p className="font-medium text-gray-900">Donation type</p>
                  <p className="mt-2 capitalize">{kind}</p>
                  <p className="mt-3 text-xs text-gray-500">
                    Type and goal cannot be changed after creation because they are tied to your Stripe Price and
                    Payment Link.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-600">
                    Open donations let donors choose an amount up to your goal. Fundraisers use one fixed amount (your
                    goal).
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
                          Donors pick an amount within limits — goal is the cap (Stripe custom amount).
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
                          Fixed donation amount equal to your goal; optional public fundraising visibility (metadata).
                        </p>
                      </div>
                    </div>
                  </button>
                </>
              )}
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
                  placeholder="e.g. Spring philanthropy fundraiser"
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
                  disabled={isPending || isEditMode}
                  className="tabular-nums"
                />
                <p className="text-xs text-gray-500">
                  {kind === 'open' ? (
                    <>
                      Donors choose any amount from ${(STRIPE_OPEN_DONATION_MIN_CENTS / 100).toFixed(2)} up to this
                      goal (Stripe <span className="font-medium text-gray-700">custom amount</span> cap).
                    </>
                  ) : (
                    'Becomes the fixed donation amount (Stripe Price).'
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
                  <span>Show on public fundraising channels (stored in campaign metadata)</span>
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
                <Label>Hero image (optional)</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={DONATION_HERO_UPLOAD_ALLOWED_TYPES.join(',')}
                  className="sr-only"
                  aria-hidden
                  tabIndex={-1}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) beginHeroCropFromFile(f);
                  }}
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  aria-hidden
                  tabIndex={-1}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) beginHeroCropFromFile(f);
                  }}
                />
                {heroUploading ? (
                  <div
                    className="rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-14 flex flex-col items-center justify-center gap-3 text-center"
                    aria-busy
                    aria-live="polite"
                  >
                    <Loader2 className="h-8 w-8 animate-spin text-gray-400" aria-hidden />
                    <p className="text-sm text-gray-700 font-medium">Uploading image…</p>
                    <p className="text-xs text-gray-500">This may take a few seconds.</p>
                  </div>
                ) : heroImageUrl.trim() ? (
                  <div className="rounded-xl border border-gray-200 bg-white p-6 flex flex-col items-center gap-4">
                    {/* eslint-disable-next-line @next/next/no-img-element -- treasurer-uploaded public URL */}
                    <img
                      src={heroImageUrl.trim()}
                      alt=""
                      className="h-44 w-44 rounded-xl object-cover border border-gray-200 shadow-sm"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9 px-3 text-red-600 hover:text-red-700 hover:bg-red-50"
                      disabled={isPending}
                      onClick={() => setHeroImageUrl('')}
                    >
                      Remove image
                    </Button>
                  </div>
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (!isPending && !heroUploading) fileInputRef.current?.click();
                      }
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (!isPending && !heroUploading) setIsHeroDragging(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      setIsHeroDragging(false);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsHeroDragging(false);
                      if (isPending || heroUploading) return;
                      const f = e.dataTransfer.files?.[0];
                      if (f) beginHeroCropFromFile(f);
                    }}
                    onClick={() => {
                      if (!isPending && !heroUploading) fileInputRef.current?.click();
                    }}
                    className={cn(
                      'rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors cursor-pointer',
                      isHeroDragging ? 'border-brand-primary bg-brand-primary/5' : 'border-gray-200 bg-gray-50/80',
                      (isPending || heroUploading) && 'pointer-events-none opacity-60'
                    )}
                  >
                    <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" aria-hidden />
                    <p className="text-sm text-gray-700 font-medium">
                      Drag and drop an image here, or click to choose from your device
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Square 1:1 crop · JPEG, PNG, WebP, or GIF · max 5 MB</p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-full"
                        disabled={isPending || heroUploading}
                        onClick={(e) => {
                          e.stopPropagation();
                          fileInputRef.current?.click();
                        }}
                      >
                        Choose image
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-full gap-1.5"
                        disabled={isPending || heroUploading}
                        onClick={(e) => {
                          e.stopPropagation();
                          cameraInputRef.current?.click();
                        }}
                      >
                        <Camera className="h-4 w-4 shrink-0" aria-hidden />
                        Take photo
                      </Button>
                    </div>
                  </div>
                )}
                <p className="text-xs text-gray-500">
                  Used on the Stripe Product and in Trailblaize wherever we show this donation. Images are stored on
                  Trailblaize and must be public https URLs for Stripe.
                </p>
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
                  <div className="flex justify-between gap-4 items-start pt-1 border-t border-gray-200/80">
                    <dt className="text-gray-500 shrink-0">Hero image</dt>
                    <dd className="text-right">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={heroImageUrl.trim()}
                        alt=""
                        className="ml-auto h-16 w-16 rounded-md object-cover border border-gray-200"
                      />
                    </dd>
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
            {step === 0 && !isEditMode ? null : step < TOTAL_STEPS - 1 ? (
              <Button
                type="button"
                className="bg-brand-primary hover:bg-brand-primary-hover rounded-full"
                disabled={nextDisabled || isPending || (step === 2 && heroUploading)}
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
                    {isEditMode ? 'Saving…' : 'Creating…'}
                  </>
                ) : isEditMode ? (
                  'Save changes'
                ) : (
                  'Create donation'
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
    <ImageCropper
      imageSrc={cropImageSrc}
      isOpen={cropperOpen}
      onClose={handleCropperClose}
      onCropComplete={handleHeroCropComplete}
      cropType="donation_hero"
      elevatedZIndex
    />
    </>
  );
}
