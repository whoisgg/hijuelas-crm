import { notFound } from "next/navigation";

import { isCurrentUserAdmin } from "@/lib/actions/admin-users";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isAdmin = await isCurrentUserAdmin();
  // 404 (no 403) para no revelar que la ruta existe a no-admins.
  if (!isAdmin) notFound();
  return <>{children}</>;
}
