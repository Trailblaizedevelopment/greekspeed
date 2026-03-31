export interface NetworkKpis {
  chapterCount: number;
  totalActiveMembers: number;
  totalAlumni: number;
  avgEngagementPercent: number;
}

export interface ChapterHealthRow {
  chapterId: string;
  chapterName: string;
  school: string;
  activeMembers: number;
  alumniCount: number;
  engagementPercent: number;
  lastActivityAt: string | null;
  status: 'active' | 'at_risk';
}
