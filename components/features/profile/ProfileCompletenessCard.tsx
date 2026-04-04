'use client';

import { CheckCircle2, Circle, Camera, FileText, Briefcase, GraduationCap, Linkedin } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UnifiedUserProfile } from '@/types/user-profile';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface ProfileCompletenessCardProps {
  profile: UnifiedUserProfile;
}

interface ChecklistItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  completed: boolean;
}

function getChecklist(profile: UnifiedUserProfile): ChecklistItem[] {
  return [
    {
      key: 'avatar',
      label: 'Add a profile photo',
      icon: <Camera className="w-4 h-4" />,
      completed: !!profile.avatar_url,
    },
    {
      key: 'bio',
      label: 'Write a bio',
      icon: <FileText className="w-4 h-4" />,
      completed: !!profile.bio && profile.bio.length > 0,
    },
    {
      key: 'industry',
      label: 'Add your industry',
      icon: <Briefcase className="w-4 h-4" />,
      completed: !!(profile.alumni?.industry || profile.user?.major),
    },
    {
      key: 'grad_year',
      label: 'Set graduation year',
      icon: <GraduationCap className="w-4 h-4" />,
      completed: !!(profile.alumni?.graduationYear || profile.user?.grad_year),
    },
    {
      key: 'linkedin',
      label: 'Connect LinkedIn',
      icon: <Linkedin className="w-4 h-4" />,
      completed: !!profile.user?.linkedin_url,
    },
  ];
}

export function ProfileCompletenessCard({ profile }: ProfileCompletenessCardProps) {
  const checklist = getChecklist(profile);
  const completedCount = checklist.filter((item) => item.completed).length;
  const percentage = Math.round((completedCount / checklist.length) * 100);

  if (percentage === 100) return null;

  return (
    <Card className="bg-white rounded-xl shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-gray-900">
          Complete Your Profile
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
            <span>{completedCount} of {checklist.length} completed</span>
            <span className="font-medium text-brand-primary">{percentage}%</span>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-primary rounded-full transition-all duration-500"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>

        <div className="space-y-2">
          {checklist.map((item) => (
            <div
              key={item.key}
              className={`flex items-center gap-2.5 text-sm ${
                item.completed ? 'text-gray-400' : 'text-gray-700'
              }`}
            >
              {item.completed ? (
                <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-gray-300 flex-shrink-0" />
              )}
              <span className="flex items-center gap-1.5">
                {item.icon}
                <span className={item.completed ? 'line-through' : ''}>
                  {item.label}
                </span>
              </span>
            </div>
          ))}
        </div>

        <Link href="/dashboard/profile" className="block mt-3">
          <Button
            variant="outline"
            size="sm"
            className="w-full rounded-full text-brand-primary border-brand-primary hover:bg-primary-50 text-xs"
          >
            Edit Profile
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
