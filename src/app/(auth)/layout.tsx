import { Sprout } from "lucide-react";
import { APP_NAME } from "@/lib/constants";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex">
        <div className="flex items-center gap-2 font-semibold">
          <Sprout className="h-5 w-5" />
          <span>{APP_NAME}</span>
        </div>
        <div className="space-y-3">
          <p className="text-xl leading-relaxed">
            &ldquo;Centralizamos pipeline comercial, contratos, entregas y
            royalties de Viveros Hijuelas en una sola plataforma.&rdquo;
          </p>
          <p className="text-sm text-primary-foreground/80">
            CRM interno — Sprint 0 Foundation
          </p>
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
