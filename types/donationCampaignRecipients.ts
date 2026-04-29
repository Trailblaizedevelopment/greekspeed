/** Row in `public.donation_campaign_recipients`. */
export interface DonationCampaignRecipient {
  id: string;
  donation_campaign_id: string;
  profile_id: string;
  crowded_contact_id: string;
  created_at: string;
}

/** Member or eligible alumni for the donation share picker. */
export interface DonationShareCandidate {
  profileId: string;
  /** Crowded contact UUID when linked; `null` when eligible alumni pending create-on-share. */
  contactId: string | null;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  /** `true` when `profiles.role` is `alumni`. */
  isAlumni: boolean;
  /**
   * Alumni with email + E.164 phone + name, but no Crowded row yet — contact is created when treasurer confirms share.
   */
  pendingCrowdedContact: boolean;
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
