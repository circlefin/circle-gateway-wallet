import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { WalletDashboard } from "@/components/wallet-dashboard";

export default async function ProtectedPage() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) {
    redirect("/auth/login");
  }

  return (
    <div className="flex-1 flex flex-col gap-20 max-w-5xl p-5">
      <main className="flex-1 flex flex-col gap-6 px-4">
        <div className="flex flex-col items-center gap-4">
          <WalletDashboard />
        </div>
      </main>
    </div>
  );
}
