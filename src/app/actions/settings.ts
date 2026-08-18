"use server";

import { requireWorkspace } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface SettingsActionState {
  error: string | null;
  message?: string | null;
  success?: boolean;
}

const HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

export async function updateWidgetSettingsAction(
  _prevState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const { workspace, membership } = await requireWorkspace();

  if (membership.role !== "owner" && membership.role !== "admin") {
    return { error: "Forbidden: Only workspace owners and admins can modify widget settings." };
  }

  const brandName = (formData.get("brand_name") as string | null)?.trim();
  const brandColor = (formData.get("brand_color") as string | null)?.trim() || "#0F172A";
  const welcomeMessage = (formData.get("welcome_message") as string | null)?.trim();
  const rawLogoUrl = (formData.get("logo_url") as string | null)?.trim() || "";
  const position = (formData.get("position") as string | null)?.trim() || "bottom-right";

  // Validate Brand Name
  if (!brandName || brandName.length < 1 || brandName.length > 60) {
    return { error: "Brand name must be between 1 and 60 characters." };
  }

  // Validate Brand Color
  if (!HEX_COLOR_REGEX.test(brandColor)) {
    return { error: "Brand color must be a valid 3-digit or 6-digit hex code (e.g. #0F172A)." };
  }

  // Validate Welcome Message
  if (!welcomeMessage || welcomeMessage.length < 1 || welcomeMessage.length > 500) {
    return { error: "Welcome message must be between 1 and 500 characters." };
  }

  // Validate Position
  if (position !== "bottom-right" && position !== "bottom-left") {
    return { error: "Position must be either 'bottom-right' or 'bottom-left'." };
  }

  // Validate Logo URL if provided
  let logoUrl: string | null = null;
  if (rawLogoUrl.length > 0) {
    try {
      const parsed = new URL(rawLogoUrl);
      if (parsed.protocol !== "https:") {
        return { error: "Logo URL must use a secure HTTPS address (e.g. https://...)." };
      }
      logoUrl = rawLogoUrl;
    } catch {
      return { error: "Please enter a valid URL for the logo." };
    }
  }

  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("widget_settings")
    .update({
      brand_name: brandName,
      brand_color: brandColor,
      welcome_message: welcomeMessage,
      logo_url: logoUrl,
      position,
    })
    .eq("workspace_id", workspace.id);

  if (updateError) {
    return { error: `Failed to update settings: ${updateError.message}` };
  }

  revalidatePath("/dashboard");
  return {
    error: null,
    message: "Widget settings saved successfully.",
    success: true,
  };
}
