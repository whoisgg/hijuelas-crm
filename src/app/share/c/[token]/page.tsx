import { notFound } from "next/navigation";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { Building2, Mail, MapPin, Phone, UserRound } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export const dynamic = "force-dynamic";
export const metadata = { title: "Compartido — Hijuelas Growth" };

type SharedClient = {
  id: string;
  name: string;
  legal_name: string | null;
  giro: string | null;
  region: string | null;
  country_name: string | null;
  country_iso2: string | null;
  kam_name: string | null;
  kam_email: string | null;
  kam_phone: string | null;
  contacts: {
    name: string;
    role: string | null;
    email: string | null;
    phone: string | null;
    is_primary: boolean;
  }[];
};

async function fetchSharedClient(token: string): Promise<SharedClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  const supabase = createSupabaseClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await (supabase.rpc as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: SharedClient | null; error: { message: string } | null }>)(
    "public_get_shared_client",
    { p_token: token },
  );
  if (error || !data) return null;
  return data;
}

export default async function SharedClientPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const client = await fetchSharedClient(token);
  if (!client) notFound();

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 md:px-6 md:py-16">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Building2 className="h-5 w-5" />
          </div>
          <span className="text-sm font-semibold text-muted-foreground">
            Hijuelas Growth
          </span>
        </div>
        <Badge variant="outline">Ficha pública</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{client.name}</CardTitle>
          {client.legal_name ? (
            <CardDescription>{client.legal_name}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Info básica */}
          <section className="grid gap-3 text-sm md:grid-cols-2">
            {client.country_name ? (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>
                  {client.country_name}
                  {client.region ? ` · ${client.region}` : ""}
                </span>
              </div>
            ) : null}
            {client.giro ? (
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span>{client.giro}</span>
              </div>
            ) : null}
          </section>

          <Separator />

          {/* KAM */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">
              Tu contacto en Hijuelas
            </h3>
            {client.kam_name ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 font-medium">
                  <UserRound className="h-4 w-4 text-primary" />
                  {client.kam_name}
                </div>
                {client.kam_email ? (
                  <a
                    href={`mailto:${client.kam_email}`}
                    className="ml-6 flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <Mail className="h-3.5 w-3.5" /> {client.kam_email}
                  </a>
                ) : null}
                {client.kam_phone ? (
                  <a
                    href={`tel:${client.kam_phone}`}
                    className="ml-6 flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <Phone className="h-3.5 w-3.5" /> {client.kam_phone}
                  </a>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Sin KAM asignado.</p>
            )}
          </section>

          {client.contacts.length > 0 ? (
            <>
              <Separator />
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground">
                  Contactos del cliente
                </h3>
                <ul className="space-y-3">
                  {client.contacts.map((c, i) => (
                    <li key={i} className="rounded-md border bg-card/50 p-3">
                      <div className="flex items-center gap-2 font-medium">
                        {c.name}
                        {c.is_primary ? (
                          <Badge variant="secondary" className="text-[10px]">
                            Principal
                          </Badge>
                        ) : null}
                      </div>
                      {c.role ? (
                        <div className="text-xs text-muted-foreground">
                          {c.role}
                        </div>
                      ) : null}
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        {c.email ? (
                          <a
                            href={`mailto:${c.email}`}
                            className="flex items-center gap-1 text-primary hover:underline"
                          >
                            <Mail className="h-3 w-3" /> {c.email}
                          </a>
                        ) : null}
                        {c.phone ? (
                          <a
                            href={`tel:${c.phone}`}
                            className="flex items-center gap-1 text-primary hover:underline"
                          >
                            <Phone className="h-3 w-3" /> {c.phone}
                          </a>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          ) : null}
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Este link puede ser revocado o expirar. Si necesitas acceso permanente,
        contacta a tu KAM.
      </p>
    </main>
  );
}
