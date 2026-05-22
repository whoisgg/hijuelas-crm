"use client";

import * as React from "react";
import { Mail, Sprout } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { APP_NAME } from "@/lib/constants";

type Status = "idle" | "loading" | "sent" | "error";

export default function LoginPage() {
  const [email, setEmail] = React.useState("");
  const [status, setStatus] = React.useState<Status>("idle");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("loading");
    setErrorMessage(null);

    try {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;
      setStatus("sent");
      toast.success("Te enviamos un enlace mágico a tu correo.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Error desconocido";
      setStatus("error");
      setErrorMessage(message);
      toast.error("No pudimos enviar el enlace.");
    }
  };

  if (status === "sent") {
    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Mail className="h-5 w-5" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">Revisa tu correo</h1>
          <p className="text-sm text-muted-foreground">
            Te enviamos un enlace mágico a <strong>{email}</strong>. Haz clic en
            el enlace para iniciar sesión.
          </p>
        </div>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            setStatus("idle");
            setEmail("");
          }}
        >
          Usar otro correo
        </Button>
      </div>
    );
  }

  const configured = isSupabaseConfigured();

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center lg:hidden">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Sprout className="h-5 w-5" />
        </div>
        <h1 className="text-xl font-semibold">{APP_NAME}</h1>
      </div>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Iniciar sesión</h1>
        <p className="text-sm text-muted-foreground">
          Ingresa tu correo corporativo y te enviaremos un enlace mágico.
        </p>
      </div>
      {!configured ? (
        <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-xs text-yellow-700 dark:text-yellow-300">
          <p className="font-medium">Supabase no está configurado.</p>
          <p className="mt-1">
            Pegá <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> en{" "}
            <code>.env.local</code> y reiniciá <code>pnpm dev</code>.
          </p>
        </div>
      ) : null}
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Correo</Label>
          <Input
            id="email"
            type="email"
            placeholder="nombre@empresa.cl"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
            disabled={status === "loading" || !configured}
          />
        </div>
        {errorMessage ? (
          <p className="text-sm text-destructive">{errorMessage}</p>
        ) : null}
        <Button
          type="submit"
          className="w-full"
          disabled={status === "loading" || !configured}
        >
          {status === "loading" ? "Enviando..." : "Enviar enlace mágico"}
        </Button>
      </form>
      <p className="text-center text-xs text-muted-foreground">
        Al iniciar sesión aceptas las políticas internas de uso del CRM.
      </p>
    </div>
  );
}
