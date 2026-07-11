"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { getSiteUrl, isHijuelasEmail, HIJUELAS_DOMAIN } from "@/lib/site-url";
import { AuthCard, AuthField } from "@/components/auth/auth-card";

type Mode = "password" | "magic";
type Status = "idle" | "loading" | "sent" | "error";

// useSearchParams() requiere Suspense boundary en build estático de Next 16.
export default function LoginPage() {
  return (
    <React.Suspense fallback={null}>
      <LoginPageInner />
    </React.Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = params.get("next") ?? "/apps";
  const oauthError = params.get("error");

  const [mode, setMode] = React.useState<Mode>("password");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [status, setStatus] = React.useState<Status>("idle");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(
    oauthError === "auth_callback"
      ? "No pudimos completar el inicio de sesión. Intenta nuevamente."
      : oauthError === "domain_blocked"
        ? `Solo se permite el dominio @${HIJUELAS_DOMAIN}.`
        : null,
  );

  const configured = isSupabaseConfigured();
  const loading = status === "loading";

  const callbackUrl = (next: string) =>
    `${getSiteUrl()}/auth/callback?next=${encodeURIComponent(next)}`;

  const signInWithMicrosoft = async () => {
    setStatus("loading");
    setErrorMessage(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "azure",
        options: {
          scopes: "email profile openid",
          redirectTo: callbackUrl(nextPath),
          queryParams: {
            prompt: "select_account",
            domain_hint: HIJUELAS_DOMAIN,
          },
        },
      });
      if (error) throw error;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Error desconocido";
      setStatus("error");
      setErrorMessage(message);
    }
  };

  const onPasswordSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("loading");
    setErrorMessage(null);

    if (!isHijuelasEmail(email)) {
      setStatus("error");
      setErrorMessage(`Solo se permite el dominio @${HIJUELAS_DOMAIN}.`);
      return;
    }

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) throw error;
      toast.success("Sesión iniciada");
      router.push(nextPath);
      router.refresh();
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Error desconocido";
      setStatus("error");
      setErrorMessage(
        raw === "Invalid login credentials"
          ? "Email o contraseña incorrectos. Si nunca configuraste una, usa Microsoft o enlace mágico."
          : raw,
      );
    }
  };

  const onMagicSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("loading");
    setErrorMessage(null);

    if (!isHijuelasEmail(email)) {
      setStatus("error");
      setErrorMessage(`Solo se permite el dominio @${HIJUELAS_DOMAIN}.`);
      return;
    }

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo: callbackUrl(nextPath) },
      });
      if (error) throw error;
      setStatus("sent");
      toast.success("Te enviamos un enlace mágico");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Error desconocido";
      setStatus("error");
      setErrorMessage(message);
      toast.error("No pudimos enviar el enlace.");
    }
  };

  if (mode === "magic" && status === "sent") {
    return (
      <AuthCard
        title="Revisa tu correo"
        description={
          <>
            Te enviamos un enlace mágico a{" "}
            <span className="font-medium text-foreground">{email}</span>. Hacé
            clic en el enlace para iniciar sesión.
          </>
        }
      >
        <div className="flex flex-col items-center gap-6 pt-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <button
            type="button"
            className="h-[52px] w-full rounded-2xl border border-border/70 bg-background/50 text-[15px] font-medium transition-colors hover:bg-muted/50 active:scale-[0.99]"
            onClick={() => {
              setStatus("idle");
              setEmail("");
              setMode("password");
            }}
          >
            Volver al login
          </button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Bienvenido"
      description={
        <>
          Inicia sesión con tu cuenta de{" "}
          <code className="rounded-md bg-muted/60 px-1.5 py-0.5 font-mono text-[12px]">
            @{HIJUELAS_DOMAIN}
          </code>
        </>
      }
      footer={
        <>
          ¿Sin cuenta?{" "}
          <Link
            href="/signup"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Crear cuenta
          </Link>
        </>
      }
    >
      {!configured ? (
        <div className="mb-5 rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-4 text-[12px] leading-relaxed text-yellow-700 dark:text-yellow-300">
          <p className="font-medium">Supabase no está configurado.</p>
          <p className="mt-1">
            Pegá <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> en{" "}
            <code>.env.local</code> y reiniciá <code>pnpm dev</code>.
          </p>
        </div>
      ) : null}

      <div className="space-y-3">
        {/* Microsoft OAuth — primary action */}
        <button
          type="button"
          onClick={signInWithMicrosoft}
          disabled={loading || !configured}
          className="flex h-[60px] w-full items-center justify-center gap-3 rounded-2xl border border-border/70 bg-card text-[15px] font-medium transition-all hover:border-border hover:bg-muted/40 hover:shadow-sm active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <MicrosoftIcon className="h-5 w-5" />
          )}
          <span>Continuar con Microsoft</span>
        </button>

        <Divider label="o continúa con email" />

        {mode === "password" ? (
          <form onSubmit={onPasswordSubmit} className="space-y-4">
            <AuthField label="Correo" htmlFor="email">
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

            <AuthField
              label="Contraseña"
              htmlFor="password"
              trailing={
                <button
                  type="button"
                  onClick={() => {
                    setMode("magic");
                    setStatus("idle");
                    setErrorMessage(null);
                  }}
                  className="text-[12px] font-medium text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
                >
                  ¿Olvidaste? Enviar enlace mágico
                </button>
              }
            >
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoComplete="current-password"
                disabled={loading || !configured}
                className="h-[56px] rounded-2xl border-border/70 bg-card/50 px-4 text-[15px] placeholder:text-muted-foreground/60 focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30"
              />
            </AuthField>

            <ErrorBanner message={errorMessage} />

            <button
              type="submit"
              disabled={loading || !configured}
              className="flex h-[60px] w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground shadow-sm shadow-primary/30 transition-all hover:bg-primary/90 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Entrando...
                </>
              ) : (
                "Iniciar sesión"
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={onMagicSubmit} className="space-y-4">
            <div className="rounded-2xl border border-border/70 bg-card/30 p-3 text-[12px] leading-relaxed text-muted-foreground">
              Ingresá tu correo{" "}
              <code className="rounded bg-muted/60 px-1 py-0.5 font-mono text-[11px]">
                @{HIJUELAS_DOMAIN}
              </code>{" "}
              y te enviamos un enlace para iniciar sesión sin contraseña.
            </div>

            <AuthField label="Correo" htmlFor="email-magic">
              <Input
                id="email-magic"
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

            <ErrorBanner message={errorMessage} />

            <button
              type="submit"
              disabled={loading || !configured}
              className="flex h-[60px] w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground shadow-sm shadow-primary/30 transition-all hover:bg-primary/90 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Mail className="h-5 w-5" />
                  Enviar enlace mágico
                </>
              )}
            </button>
          </form>
        )}

        {mode === "magic" ? (
          <div className="pt-1 text-center">
            <button
              type="button"
              className="text-[13px] text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
              onClick={() => {
                setMode("password");
                setStatus("idle");
                setErrorMessage(null);
              }}
            >
              ← Volver a contraseña
            </button>
          </div>
        ) : null}
      </div>
    </AuthCard>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="relative py-1">
      <div className="absolute inset-0 flex items-center">
        <span className="w-full border-t border-border/60" />
      </div>
      <div className="relative flex justify-center">
        <span className="bg-card px-3 text-[11px] uppercase tracking-wider text-muted-foreground/70">
          {label}
        </span>
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-[13px] leading-relaxed text-destructive">
      {message}
    </div>
  );
}

function MicrosoftIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 21 21" className={className} aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}
