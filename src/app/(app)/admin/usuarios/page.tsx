import { Suspense } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminUsersTable } from "@/components/admin/admin-users-table";
import { listAdminUsers } from "@/lib/actions/admin-users";

export const metadata = { title: "Usuarios" };
export const dynamic = "force-dynamic";

export default function AdminUsersPage() {
  return (
    <AppShell>
      <PageHeader title="Usuarios" />
      <Suspense fallback={<Skeleton className="h-[400px] w-full" />}>
        <AdminUsersBody />
      </Suspense>
    </AppShell>
  );
}

async function AdminUsersBody() {
  const users = await listAdminUsers();
  return <AdminUsersTable users={users} />;
}
