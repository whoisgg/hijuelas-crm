"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { getSiteUrl, isHijuelasEmail, HIJUELAS_DOMAIN } from "@/lib/site-url";
import { AuthCard, AuthField } from "@/components/auth/auth-card";

type Status = "idle" | "loading" | "sent" | "error";

export default function SignupPage() {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [status, setStatus] = React.useState<Status>("idle");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const configured = isSupabaseConfigured();
  const loading = status === "loading";

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("loading");
    setErrorMessage(null);

    if (!isHijuelasEmail(email)) {
      setStatus("error");
      setErrorMessage(`Solo se permite el dominio @${HIJUELAS_DOMAIN}.`);
      return;
    }
    if (password.length < 8) {
      setStatus("error");
      setErrorMessage("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: { full_name: name.trim() },
          emailRedirectTo: `${getSiteUrl()}/auth/callback?next=/dashboard`,
        },
      });
      if (error) throw error;
      setStatus("sent");
      toast.success("Te enviamos un correo de confirmación.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Error desconocido";
      setStatus("error");
      setErrorMessage(message);
      toast.error("No pudimos crear la cuenta.");
    }
  };

  if (status === "sent") {
    return (
      <AuthCard
        title="Confirma tu correo"
        description={
          <>
            Te enviamos un enlace de verificación a{" "}
            <span className="font-medium text-foreground">{email}</span>.
            Hacé clic en el enlace para activar tu cuenta.
          </>
        }
      >
        <div className="flex flex-col items-center gap-6 pt-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <Link href="/login" className="block w-full">
            <button
              type="button"
              className="h-[52px] w-full rounded-2xl border border-border/70 bg-background/50 text-[15px] font-medium transition-colors hover:bg-muted/50 active:scale-[0.99]"
            >
              Volver al login
            </button>
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Crear cuenta"
      description={
        <>
          Solo emails{" "}
          <code className="rounded-md bg-muted/60 px-1.5 py-0.5 font-mono text-[12px]">
            @{HIJUELAS_DOMAIN}
          </code>
        </>
      }
      footer={
        <>
          ¿Ya tienes cuenta?{" "}
          <Link
            href="/login"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Iniciar sesión
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <AuthField label="Nombre completo" htmlFor="name">
          <Input
            id="name"
            type="text"
            placeholder="Juan Pérez"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            autoComplete="name"
            disabled={loading || !configured}
            className="h-[56px] rounded-2xl border-border/70 bg-card/50 px-4 text-[15px] placeholder:text-muted-foreground/60 focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30"
          />
        </AuthField>

        <AuthField label="Correo corporativo" htmlFor="email">
          <Input
            id="email"
            type="email"
            inputMode="email"
            placeholder={`tu.nombre@${HIJUELAS_DOMAIN}`}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
            disabled={loading || !configured}
            className="h-[56px] rounded-2xl border-border/70 bg-card/50 px-4 text-[15px] placeholder:text-muted-foreground/60 focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30"
          />
        </AuthField>

        <AuthField label="Contraseña" htmlFor="password">
          <Input
            id="password"
            type="password"
            placeholder="Mínimo 8 caracteres"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="new-password"
            minLength={8}
            disabled={loading || !configured}
            className="h-[56px] rounded-2xl border-border/70 bg-card/50 px-4 text-[15px] placeholder:text-muted-foreground/60 focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30"
          />
        </AuthField>

        {errorMessage ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-[13px] leading-relaxed text-destructive">
            {errorMessage}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={loading || !configured}
          className="flex h-[60px] w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground shadow-sm shadow-primary/30 transition-all hover:bg-primary/90 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Creando...
            </>
          ) : (
            "Crear cuenta"
          )}
        </button>
      </form>
    </AuthCard>
  );
}
