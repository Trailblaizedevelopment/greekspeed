'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Landmark, Plus } from 'lucide-react';
import { useAuth } from '@/lib/supabase/auth-context';

export type NationalOrgRow = {
  id: string;
  name: string;
  short_name: string | null;
  type: string | null;
};

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function NationalOrganizationsDirectoryTab() {
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const [rows, setRows] = useState<NationalOrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize] = useState(50);
  const [createOpen, setCreateOpen] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    short_name: '',
    type: '',
    website_url: '',
    logo_url: '',
  });

  const debouncedSearch = useDebouncedValue(searchTerm.trim(), 400);
  const pendingSearchPageResetRef = useRef(false);

  useEffect(() => {
    pendingSearchPageResetRef.current = true;
    setCurrentPage(1);
  }, [debouncedSearch]);

  const fetchRows = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: String(pageSize),
      });
      if (debouncedSearch.length > 0) params.set('q', debouncedSearch);
      const headers: HeadersInit = {};
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      const res = await fetch(`/api/developer/directory/national-organizations?${params}`, { headers });
      if (!res.ok) {
        console.error('national orgs directory GET failed');
        return;
      }
      const data = await res.json();
      setRows(data.nationalOrganizations ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, debouncedSearch, accessToken]);

  useEffect(() => {
    if (pendingSearchPageResetRef.current && currentPage !== 1) return;
    pendingSearchPageResetRef.current = false;
    void fetchRows();
  }, [fetchRows, currentPage]);

  const resetCreateForm = () => {
    setForm({ name: '', short_name: '', type: '', website_url: '', logo_url: '' });
    setCreateError(null);
  };

  const handleCreate = async () => {
    const name = form.name.trim();
    if (!name) {
      setCreateError('Name is required.');
      return;
    }
    setCreateSubmitting(true);
    setCreateError(null);
    try {
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      const body = {
        name,
        short_name: form.short_name.trim() || null,
        type: form.type.trim() || null,
        website_url: form.website_url.trim() || null,
        logo_url: form.logo_url.trim() || null,
      };
      const res = await fetch('/api/developer/directory/national-organizations', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCreateError(typeof data.error === 'string' ? data.error : 'Create failed');
        return;
      }
      setCreateOpen(false);
      resetCreateForm();
      void fetchRows();
    } catch {
      setCreateError('Create failed');
    } finally {
      setCreateSubmitting(false);
    }
  };

  if (loading && rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading national organizations…</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">National organizations</h2>
          <p className="text-gray-600">
            Directory rows in <code className="text-xs bg-gray-100 px-1 rounded">national_organizations</code> — search and create for linking spaces.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="flex items-center gap-2 rounded-full">
          <Plus className="h-4 w-4" />
          <span>Create organization</span>
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <Input
            placeholder="Search name, short name, or type (server-side)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full"
          />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Landmark className="h-5 w-5" />
            <span>
              {debouncedSearch ? 'Matching organizations' : 'All organizations'} ({total.toLocaleString()})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="overflow-x-auto">
            <div className="max-h-[70vh] overflow-y-auto border border-gray-200 rounded-lg">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead className="sticky top-0 bg-gray-50 z-10">
                  <tr className="border-b">
                    <th className="text-left py-2.5 px-3 font-medium text-xs uppercase tracking-wide text-gray-600">Name</th>
                    <th className="text-left py-2.5 px-3 font-medium text-xs uppercase tracking-wide text-gray-600">Short name</th>
                    <th className="text-left py-2.5 px-3 font-medium text-xs uppercase tracking-wide text-gray-600">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-8 text-center text-sm text-gray-500">
                        {debouncedSearch ? `No organizations match “${debouncedSearch}”.` : 'No organizations found.'}
                      </td>
                    </tr>
                  ) : null}
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                      <td className="py-2 px-3 max-w-[320px] truncate" title={r.name}>
                        {r.name}
                      </td>
                      <td className="py-2 px-3 max-w-[160px] truncate text-gray-700">{r.short_name ?? '—'}</td>
                      <td className="py-2 px-3 max-w-[200px] truncate text-gray-700">{r.type ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-600">
                Showing {total === 0 ? 0 : (currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, total)} of{' '}
                {total.toLocaleString()}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1 || loading}
                >
                  Previous
                </Button>
                <span className="text-sm text-gray-600">
                  Page <span className="font-medium">{currentPage}</span> of{' '}
                  <span className="font-medium">{totalPages}</span>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages || loading}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) resetCreateForm();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create national organization</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="org-name">Name</Label>
              <Input
                id="org-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="National / HQ name"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="org-short">Short name</Label>
              <Input
                id="org-short"
                value={form.short_name}
                onChange={(e) => setForm((f) => ({ ...f, short_name: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="org-type">Type</Label>
              <Input
                id="org-type"
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                placeholder="e.g. fraternity, sorority"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="org-web">Website URL</Label>
              <Input
                id="org-web"
                value={form.website_url}
                onChange={(e) => setForm((f) => ({ ...f, website_url: e.target.value }))}
                placeholder="https://…"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="org-logo">Logo URL</Label>
              <Input
                id="org-logo"
                value={form.logo_url}
                onChange={(e) => setForm((f) => ({ ...f, logo_url: e.target.value }))}
                placeholder="Optional image URL"
              />
            </div>
            {createError ? <p className="text-sm text-red-600">{createError}</p> : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="rounded-full" onClick={() => setCreateOpen(false)} type="button">
              Cancel
            </Button>
            <Button className="rounded-full" onClick={() => void handleCreate()} disabled={createSubmitting} type="button">
              {createSubmitting ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
