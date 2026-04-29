/**
 * Canonical space / org taxonomy (Section 7) — aligned with
 * `data/seeds/space_type_taxonomy_reference.csv` and
 * `data/seeds/sources/TRAILBLAIZE_MASTER_REFERENCE_DATASET.md`.
 * Stored value on `spaces.space_type` is the **slug**; labels are for UI only.
 */

export type SpaceTypeTaxonomyEntry = {
  slug: string;
  label: string;
  description: string;
};

export const SPACE_TYPE_TAXONOMY: SpaceTypeTaxonomyEntry[] = [
  { slug: 'university_college', label: 'University / College', description: '4-year accredited institution' },
  { slug: 'community_college', label: 'Community College', description: '2-year institution' },
  { slug: 'high_school', label: 'High School', description: 'Secondary school (public or private)' },
  { slug: 'ifc_fraternity', label: 'IFC Fraternity', description: 'NIC member fraternity' },
  { slug: 'panhellenic_sorority', label: 'Panhellenic Sorority', description: 'NPC member sorority' },
  { slug: 'nphc_organization', label: 'NPHC Organization', description: 'Divine Nine fraternity or sorority' },
  {
    slug: 'multicultural_greek_organization',
    label: 'Multicultural Greek Organization',
    description: 'MGC member organization',
  },
  {
    slug: 'professional_fraternity_sorority',
    label: 'Professional Fraternity / Sorority',
    description: 'Business, law, engineering, service, etc.',
  },
  {
    slug: 'local_fraternity_sorority',
    label: 'Local Fraternity / Sorority',
    description: 'Non-affiliated Greek organization',
  },
  { slug: 'ncaa_athletic_team', label: 'NCAA Athletic Team', description: 'Varsity sport at NCAA member school' },
  { slug: 'club_sport', label: 'Club Sport', description: 'Recreational/competitive club team' },
  { slug: 'intramural_sport', label: 'Intramural Sport', description: 'Intra-school competition league' },
  {
    slug: 'professional_sports_team',
    label: 'Professional Sports Team',
    description: 'NFL/NBA/MLB/NHL/MLS/NWSL or minor league',
  },
  { slug: 'military_branch', label: 'Military Branch', description: 'One of the 6 U.S. military branches' },
  {
    slug: 'military_unit_base',
    label: 'Military Unit / Base',
    description: 'Specific installation, command, or unit',
  },
  { slug: 'rotc_program', label: 'ROTC Program', description: 'Army/Navy/Air Force ROTC' },
  {
    slug: 'professional_association',
    label: 'Professional Association',
    description: 'Industry org (IEEE, AMA, ABA, etc.)',
  },
  { slug: 'honor_society', label: 'Honor Society', description: 'Academic honor/recognition organization' },
  {
    slug: 'business_school_club',
    label: 'Business School Club',
    description: 'Org under a business/b-school umbrella',
  },
  { slug: 'student_government', label: 'Student Government', description: 'SGA or equivalent' },
  {
    slug: 'student_organization',
    label: 'Student Organization',
    description: 'General campus club/org (catch-all)',
  },
  {
    slug: 'alumni_association',
    label: 'Alumni Association',
    description: 'Formal alumni body of a school/org',
  },
  { slug: 'country_club', label: 'Country Club', description: 'Private social/athletic club' },
  {
    slug: 'athletic_fitness_program',
    label: 'Athletic / Fitness Program',
    description: 'Gym, CrossFit, league, etc.',
  },
  {
    slug: 'investor_founder_network',
    label: 'Investor / Founder Network',
    description: 'VC network, angel group, founder community',
  },
  {
    slug: 'philanthropic_advisory_board',
    label: 'Philanthropic / Advisory Board',
    description: 'Board, foundation, nonprofit advisory',
  },
  {
    slug: 'young_professionals_organization',
    label: 'Young Professionals Organization',
    description: 'YPO, Rotary Young Professionals, city-specific',
  },
  {
    slug: 'religious_organization',
    label: 'Religious Organization',
    description: 'Campus ministry, faith community, church',
  },
  {
    slug: 'cultural_organization',
    label: 'Cultural Organization',
    description: 'International/cultural student org',
  },
  {
    slug: 'graduate_professional_school',
    label: 'Graduate / Professional School',
    description: 'MBA, law, med, or other grad program',
  },
  {
    slug: 'study_abroad_program',
    label: 'Study Abroad Program',
    description: 'Program or destination-based cohort',
  },
  {
    slug: 'residence_hall_housing',
    label: 'Residence Hall / Housing',
    description: 'Dorm, Greek house, living-learning community',
  },
  {
    slug: 'performing_arts',
    label: 'Performing Arts',
    description: 'Theater, band, orchestra, dance, choir',
  },
  {
    slug: 'media_publication',
    label: 'Media / Publication',
    description: 'Campus newspaper, magazine, radio, TV',
  },
  {
    slug: 'political_organization',
    label: 'Political Organization',
    description: 'College Dems/Republicans, advocacy groups',
  },
  {
    slug: 'debate_academic_competition',
    label: 'Debate / Academic Competition',
    description: 'Mock trial, debate, Model UN',
  },
  { slug: 'other', label: 'Other', description: 'Catch-all for unlisted org types' },
];

const LABEL_BY_SLUG = new Map(SPACE_TYPE_TAXONOMY.map((e) => [e.slug, e.label]));

/** Options for `SearchableSelect` (value = DB slug). */
export const SPACE_TYPE_SEARCHABLE_OPTIONS = SPACE_TYPE_TAXONOMY.map((e) => ({
  value: e.slug,
  label: e.label,
}));

/** Human label for a stored `spaces.space_type` slug; legacy free-text values pass through. */
export function getSpaceTypeLabel(stored: string | null | undefined): string {
  if (stored == null) return '';
  const s = String(stored).trim();
  if (!s) return '';
  return LABEL_BY_SLUG.get(s) ?? s;
}

/** Trim and cap length for API; empty → null. */
export function normalizeSpaceTypeInput(raw: string | null | undefined, maxLen = 200): string | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  return t.slice(0, maxLen);
}
