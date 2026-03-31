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
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
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

        {/* Network KPI strip — GET /api/governance/network-kpis */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {kpiItems.map((kpi) => (
            <div
              key={kpi.label}
              className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
                {kpi.icon}
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500">{kpi.label}</p>
                <p className="text-lg font-semibold text-gray-900">{kpi.value}</p>
              </div>
            </div>
          ))}
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
    </div>
  );
}
