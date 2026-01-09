import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data: transactions, error } = await supabase
      .from("transaction_history")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching transaction history:", error);
      return NextResponse.json(
        { message: "Error fetching transaction history" },
        { status: 500 }
      );
    }

    return NextResponse.json(transactions);
  } catch (error) {
    console.error("Error fetching transaction history:", error);
    return NextResponse.json(
      { message: "Error fetching transaction history" },
      { status: 500 }
    );
  }
}
