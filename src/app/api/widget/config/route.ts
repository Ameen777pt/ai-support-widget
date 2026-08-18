import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const key = searchParams.get("key") || searchParams.get("public_widget_key");

  if (!key || key.trim().length === 0) {
    return NextResponse.json(
      { error: "Missing required parameter: key" },
      { status: 400 },
    );
  }

  const cleanKey = key.trim();

  // Basic format validation: public widget keys start with 'pk_live_'
  if (!cleanKey.startsWith("pk_live_") || cleanKey.length < 16) {
    return NextResponse.json(
      { error: "Invalid public widget key format" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_widget_config", {
    p_public_widget_key: cleanKey,
  });

  if (error || !data || data.length === 0) {
    return NextResponse.json(
      { error: "Widget configuration not found" },
      { status: 404 },
    );
  }

  const config = data[0];

  return NextResponse.json({
    brand_name: config.brand_name,
    brand_color: config.brand_color,
    welcome_message: config.welcome_message,
    logo_url: config.logo_url,
    position: config.position,
  });
}
