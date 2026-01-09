import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TransactionHistory } from "@/components/transaction-history";

export default async function HistoryPage() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) {
    redirect("/auth/login");
  }

  return (
    <div className="flex-1 flex flex-col gap-6 max-w-7xl p-5 mx-auto w-full">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Transaction History</h1>
        <p className="text-muted-foreground">
          View and track all your deposit and transfer transactions
        </p>
      </div>
      <TransactionHistory />
    </div>
  );
}
