export interface NetworkKpis {
  chapterCount: number;
  totalActiveMembers: number;
  totalAlumni: number;
  avgEngagementPercent: number;
}

export interface IndustryAggregate {
  industry: string;
  count: number;
}

export interface LocationAggregate {
  state: string;
  stateCode: string;
  count: number;
  percent: number;
}

export interface AlumniIntelligence {
  industries: IndustryAggregate[];
  locations: LocationAggregate[];
  totalAlumni: number;
  alumniWithIndustry: number;
  alumniWithLocation: number;
  industryCompleteness: number;
  locationCompleteness: number;
}
