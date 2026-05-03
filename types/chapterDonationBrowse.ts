import type { MyDonationCampaignShare } from '@/types/myDonationCampaignShares';

/** How this row appeared in the chapter donation hub. */
export type ChapterDonationListingSource = 'shared_with_you' | 'chapter_public';

/**
 * One drive in `GET …/donations/browse`: either explicitly shared with the member,
 * or listed for the whole chapter (`metadata.chapter_hub_visible`, or legacy fundraiser public channel).
 */
export interface ChapterDonationBrowseEntry {
  listingSource: ChapterDonationListingSource;
  /** Same shape as “Donations for you” rows; `chapter_public` rows use a synthetic `recipientId`. */
  share: MyDonationCampaignShare;
  /** Campaign `created_at` for sorting. */
  campaignCreatedAt: string;
}
