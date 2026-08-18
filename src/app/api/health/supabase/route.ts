import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();

  const { error } = await supabase
    .from("health_check")
    .select("*")
    .limit(1);

  if (error) {
    return NextResponse.json(
      {
        connected: false,
        error: error.message,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    connected: true,
  });
}