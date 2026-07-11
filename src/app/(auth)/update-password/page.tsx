"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { AuthCard, AuthField } from "@/components/auth/auth-card";

type Status = "idle" | "loading" | "error";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [status, setStatus] = React.useState<Status>("idle");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const configured = isSupabaseConfigured();
  const loading = status === "loading";

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("loading");
    setErrorMessage(null);

    if (password.length < 8) {
      setStatus("error");
      setErrorMessage("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setStatus("error");
      setErrorMessage("Las contraseñas no coinciden.");
      return;
    }

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Contraseña actualizada");
      router.push("/apps");
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Error desconocido";
      setStatus("error");
      setErrorMessage(message);
    }
  };

  return (
    <AuthCard
      title="Nueva contraseña"
      description="Define una contraseña para tu cuenta."
    >
      <form onSubmit={onSubmit} className="space-y-4">
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

        <AuthField label="Confirmar contraseña" htmlFor="confirm">
          <Input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
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
              Guardando...
            </>
          ) : (
            "Guardar contraseña"
          )}
        </button>
      </form>
    </AuthCard>
  );
}
