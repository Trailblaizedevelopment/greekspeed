/** Row in `public.donation_campaign_recipients`. */
export interface DonationCampaignRecipient {
  id: string;
  donation_campaign_id: string;
  profile_id: string;
  crowded_contact_id: string;
  created_at: string;
}

/** Member matched to Crowded — eligible for share picker. */
export interface DonationShareCandidate {
  profileId: string;
  contactId: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
}

/** Recipient row with profile fields for treasurer UI. */
export interface DonationCampaignRecipientRow extends DonationCampaignRecipient {
  profile: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
  };
}
