import { NextRequest, NextResponse } from "next/server";
import { fetchGatewayInfo } from "@/lib/circle/gateway-sdk";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch Gateway info
    const info = await fetchGatewayInfo();

    return NextResponse.json({
      success: true,
      ...info,
    });
  } catch (error: any) {
    console.error("Error fetching Gateway info:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
