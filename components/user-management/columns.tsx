import { Badge } from '@/components/ui/badge';
import { formatLocationLineForApp } from '@/types/canonicalPlace';
import { getRoleDisplayName } from '@/lib/permissions';
import type { UsersTableColumn } from './UsersTable';

export const execColumns: UsersTableColumn[] = [
  { key: 'full_name', header: 'Full Name', render: (u: any) => u.full_name || 'N/A' },
  { key: 'role', header: 'Role', render: (u: any) => u.role || 'N/A' },
  { key: 'chapter_role', header: 'Chapter Role', render: (u: any) => u.chapter_role ? getRoleDisplayName(u.chapter_role as any) : 'N/A' },
  { key: 'email', header: 'Email', render: (u: any) => u.email },
  { key: 'actions', header: 'Actions', className: 'w-40' }
];

export function buildDeveloperColumns(options: {
  getRoleBadgeVariant: (role: string | null) => 'default' | 'outline' | 'secondary' | 'destructive';
  formatDate: (dateString: string) => string;
  showDeveloperColumn: boolean;
}): UsersTableColumn[] {
  const { getRoleBadgeVariant, formatDate } = options;

  const cols: UsersTableColumn[] = [
    {
      key: 'user_info',
      header: 'User Info',
      className: 'w-auto',
      render: (u: any) => (
        <div>
          <p className="font-medium truncate">{u.full_name || 'N/A'}</p>
          <p className="text-sm text-gray-600 truncate">{u.email}</p>
        </div>
      )
    },
    {
      key: 'role',
      header: 'Role',
      render: (u: any) => {
        // Only show role badge - simplified
        const roleDisplay = u.role === 'active_member' ? 'active' : u.role;
        return (
          <div className="flex items-center">
            <Badge variant={getRoleBadgeVariant(u.role)}>
              {roleDisplay || 'N/A'}
            </Badge>
            {u.is_developer && (
              <Badge variant="secondary" className="ml-1">developer</Badge>
            )}
          </div>
        );
      }
    },
    { 
      key: 'chapter', 
      header: 'Chapter', 
      render: (u: any) => <p className="text-sm whitespace-nowrap">{u.chapter || 'N/A'}</p> 
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (u: any) => (
        <div>
          {u.phone ? (
            <p className="text-sm whitespace-nowrap">{u.phone}</p>
          ) : (
            <p className="text-xs text-gray-500">Not Specified</p>
          )}
        </div>
      )
    },
    {
      key: 'location',
      header: 'Location',
      render: (u: any) => (
        <div>
          {u.location ? (
            <p className="text-sm">{formatLocationLineForApp(u.location)}</p>
          ) : (
            <p className="text-xs text-gray-500">Not Specified</p>
          )}
        </div>
      )
    },
  ];

  cols.push(
    { 
      key: 'created', 
      header: 'Created', 
      render: (u: any) => (
        <div>
          <p className="text-sm">{formatDate(u.created_at)}</p>
          <p className="text-xs text-gray-500">Updated: {formatDate(u.updated_at)}</p>
        </div>
      ) 
    },
    { key: 'actions', header: 'Actions', className: 'w-40' }
  );
  return cols;
}


