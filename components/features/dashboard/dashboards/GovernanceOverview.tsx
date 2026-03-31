'use client';

import { useRouter } from 'next/navigation';
import {
  Building2,
  BarChart3,
  Shield,
  AlertTriangle,
  Users,
  DollarSign,
  FileCheck,
  ArrowRight,
  GraduationCap,
  Percent,
} from 'lucide-react';
import { AlumniIntelligence } from '@/components/features/governance/AlumniIntelligence';
import { ChapterHealthTable } from '@/components/features/governance/ChapterHealthTable';
import { useNetworkKpis } from '@/lib/hooks/useNetworkKpis';

interface PlaceholderCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  comingSoon?: boolean;
}

function PlaceholderCard({ title, description, icon, comingSoon = true }: PlaceholderCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
            {comingSoon && (
              <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                Coming soon
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        </div>
      </div>
    </div>
  );
}

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
      {/* Page Header */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Governance Command Center
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Multi-chapter oversight, compliance monitoring, and organizational health at a glance.
              </p>
            </div>
            <button
              onClick={() => router.push('/dashboard/admin')}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-primary/90 sm:mt-0"
            >
              <Building2 className="h-4 w-4" />
              Chapter Admin
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
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

        {/* Placeholder Cards Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <PlaceholderCard
            title="Compliance Overview"
            description="Track document submissions, insurance certificates, and policy acknowledgements for each chapter."
            icon={<FileCheck className="h-5 w-5" />}
          />
          <PlaceholderCard
            title="Risk & Alerts"
            description="Surface chapters with overdue dues, low engagement, or pending compliance items that need attention."
            icon={<AlertTriangle className="h-5 w-5" />}
          />
          <PlaceholderCard
            title="Financial Summary"
            description="Aggregate dues collection rates, outstanding balances, and payment trends across chapters."
            icon={<DollarSign className="h-5 w-5" />}
          />
          <PlaceholderCard
            title="Member Analytics"
            description="Organization-wide membership statistics, retention rates, and growth trends."
            icon={<Users className="h-5 w-5" />}
          />
          <PlaceholderCard
            title="Governance Settings"
            description="Manage your governance preferences, notification settings, and chapter assignments."
            icon={<Shield className="h-5 w-5" />}
          />
        </div>
      </div>
    </div>
  );
}
