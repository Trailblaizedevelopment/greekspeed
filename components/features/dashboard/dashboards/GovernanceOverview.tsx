'use client';

import { useRouter } from 'next/navigation';
import {
  Building2,
  BarChart3,
  Users,
  ArrowRight,
  GraduationCap,
  Percent,
} from 'lucide-react';
import { AlumniIntelligence } from '@/components/features/governance/AlumniIntelligence';
import { ChapterHealthTable } from '@/components/features/governance/ChapterHealthTable';
import { GovernanceBroadcastHub } from '@/components/features/governance/GovernanceBroadcastHub';
import { useNetworkKpis } from '@/lib/hooks/useNetworkKpis';
import { MobileBottomNavigation } from '@/components/features/dashboard/dashboards/ui/MobileBottomNavigation';
import { cn } from '@/lib/utils';

function formatKpiValue(
  value: string | number | undefined,
  isLoading: boolean
): string {
  if (isLoading) return '—';
  if (value === undefined || value === null) return '—';
  return value.toLocaleString();
}

export function GovernanceOverview() {
  const router = useRouter();
  const { data: kpis, isLoading: kpisLoading } = useNetworkKpis();

  const kpiItems = [
    {
      label: 'Total Chapters',
      value: formatKpiValue(kpis?.chapterCount, kpisLoading),
      icon: <Building2 className="h-5 w-5" />,
    },
    {
      label: 'Active Members',
      value: formatKpiValue(kpis?.totalActiveMembers, kpisLoading),
      icon: <Users className="h-5 w-5" />,
    },
    {
      label: 'Alumni in Network',
      value: formatKpiValue(kpis?.totalAlumni, kpisLoading),
      icon: <GraduationCap className="h-5 w-5" />,
    },
    {
      label: 'Avg Engagement',
      value:
        kpisLoading || kpis === undefined
          ? '—'
          : `${kpis.avgEngagementPercent.toLocaleString(undefined, {
              maximumFractionDigits: 1,
              minimumFractionDigits: 0,
            })}%`,
      icon: <Percent className="h-5 w-5" />,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-6 pb-24 sm:px-6 sm:pb-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">
            Governance Dashboard
          </h1>
          <button
            type="button"
            onClick={() => router.push('/dashboard/admin')}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 self-end rounded-full bg-brand-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-primary/90 sm:self-auto"
          >
            <Building2 className="h-4 w-4" />
            Chapter Admin
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Network KPI strip (Zone 1) — beige bar, dividers, top-rounded only */}
        <div className="mb-6 overflow-hidden rounded-t-xl border border-stone-300/80 bg-slate-100/20 shadow-sm">
          <div className="grid grid-cols-2 sm:grid-cols-4">
            {kpiItems.map((kpi, index) => (
              <div
                key={kpi.label}
                className={cn(
                  'px-4 py-3 text-left sm:px-5 sm:py-3.5',
                  index % 2 === 0 && 'border-r border-stone-300/80 sm:border-r-0',
                  index < 2 && 'border-b border-stone-300/80 sm:border-b-0',
                  index > 0 && 'sm:border-l sm:border-stone-300/80'
                )}
              >
                <p className="text-xs font-bold text-gray-900">{kpi.label}</p>
                <p className="mt-0.5 text-xl font-normal tabular-nums leading-snug text-gray-900 sm:text-2xl sm:font-medium">
                  {kpi.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Alumni Intelligence */}
        <div className="mb-6">
          <AlumniIntelligence />
        </div>

        {/* Main Grid */}
        {/* Chapter Health Table */}
        <div className="mb-6">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
              <BarChart3 className="h-4 w-4" />
            </div>
            <h2 className="text-base font-semibold text-gray-900">
              Chapter Health
            </h2>
          </div>
          <ChapterHealthTable />
        </div>

        <GovernanceBroadcastHub />
      </div>

      <MobileBottomNavigation />
    </div>
  );
}
