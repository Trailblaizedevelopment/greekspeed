'use client';

import { useState, useCallback } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  SOCIAL_PLATFORMS,
  PLATFORM_LABELS,
  type SocialPlatform,
  type SocialLinkFormItem,
} from '@/types/socialLink';
import { validateSocialUrl } from '@/lib/utils/socialLinkValidation';
import { SocialPlatformIcon } from './SocialPlatformIcon';

interface SocialLinksEditorProps {
  links: SocialLinkFormItem[];
  onChange: (links: SocialLinkFormItem[]) => void;
  isMobile?: boolean;
}

/**
 * Inline editor for managing social links within the EditProfileModal.
 * Supports add/remove/reorder with per-field validation.
 */
export function SocialLinksEditor({ links, onChange, isMobile = false }: SocialLinksEditorProps) {
  const [errors, setErrors] = useState<Record<number, string>>({});

  const addLink = useCallback(() => {
    const newLink: SocialLinkFormItem = {
      platform: 'instagram',
      url: '',
      sort_order: links.length,
      is_visible: true,
    };
    onChange([...links, newLink]);
  }, [links, onChange]);

  const removeLink = useCallback(
    (index: number) => {
      const updated = links.filter((_, i) => i !== index).map((l, i) => ({ ...l, sort_order: i }));
      onChange(updated);
      setErrors((prev) => {
        const next = { ...prev };
        delete next[index];
        return next;
      });
    },
    [links, onChange]
  );

  const updateLink = useCallback(
    (index: number, field: keyof SocialLinkFormItem, value: string | boolean) => {
      const updated = links.map((link, i) => {
        if (i !== index) return link;
        return { ...link, [field]: value };
      });
      onChange(updated);

      // Validate URL on change
      if (field === 'url' || field === 'platform') {
        const link = updated[index];
        if (link.url) {
          const result = validateSocialUrl(link.url, link.platform);
          setErrors((prev) => {
            const next = { ...prev };
            if (result.valid) {
              delete next[index];
            } else {
              next[index] = result.error || 'Invalid URL';
            }
            return next;
          });
        } else {
          setErrors((prev) => {
            const next = { ...prev };
            delete next[index];
            return next;
          });
        }
      }
    },
    [links, onChange]
  );

  const moveLink = useCallback(
    (index: number, direction: 'up' | 'down') => {
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= links.length) return;

      const updated = [...links];
      [updated[index], updated[targetIndex]] = [updated[targetIndex], updated[index]];
      onChange(updated.map((l, i) => ({ ...l, sort_order: i })));
    },
    [links, onChange]
  );

  return (
    <div className="space-y-3">
      {links.map((link, index) => (
        <div
          key={`social-link-${index}`}
          className="flex flex-col gap-2 p-3 rounded-lg border border-gray-200 bg-gray-50"
        >
          <div className="flex items-center gap-2">
            {/* Platform selector */}
            <div className="flex items-center gap-1.5 min-w-0">
              <SocialPlatformIcon platform={link.platform} className="h-4 w-4 flex-shrink-0 text-gray-500" />
              <select
                value={link.platform}
                onChange={(e) => updateLink(index, 'platform', e.target.value)}
                className="text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary min-w-[110px]"
                aria-label="Platform"
              >
                {SOCIAL_PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {PLATFORM_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>

            {/* Reorder + Delete controls */}
            <div className="flex items-center gap-0.5 ml-auto flex-shrink-0">
              <button
                type="button"
                onClick={() => moveLink(index, 'up')}
                disabled={index === 0}
                className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Move up"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => moveLink(index, 'down')}
                disabled={index === links.length - 1}
                className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Move down"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => removeLink(index)}
                className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
                aria-label="Remove link"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* URL input */}
          <div>
            <Input
              value={link.url}
              onChange={(e) => updateLink(index, 'url', e.target.value)}
              placeholder={`https://${link.platform === 'website' ? 'yoursite.com' : link.platform + '.com/...'}`}
              className={errors[index] ? 'border-red-500 focus:border-red-500' : ''}
              type="url"
            />
            {errors[index] && (
              <p className="text-xs text-red-500 mt-1">{errors[index]}</p>
            )}
          </div>

          {/* Optional label */}
          {(link.platform === 'website' || link.platform === 'other') && (
            <Input
              value={link.label || ''}
              onChange={(e) => updateLink(index, 'label', e.target.value)}
              placeholder="Label (optional)"
              className="text-sm"
            />
          )}
        </div>
      ))}

      {/* Add button */}
      {links.length < 10 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addLink}
          className="w-full border-dashed border-gray-300 text-gray-500 hover:text-gray-700 hover:border-gray-400"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Add social link
        </Button>
      )}
    </div>
  );
}
