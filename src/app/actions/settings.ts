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

  // Validate Launcher Text if provided
  let launcherText = "";
  const hasLauncherText = formData.has("launcher_text");
  if (hasLauncherText) {
    const rawLauncherText = (formData.get("launcher_text") as string | null) ?? "";
    launcherText = rawLauncherText.replace(/[\x00-\x1F\x7F]/g, "").trim();
    if (launcherText.length > 30) {
      return { error: "Launcher text must be at most 30 characters." };
    }
  }

  // Validate Suggested Questions if provided
  const suggestedQuestions: string[] = [];
  const hasSuggestedQuestions =
    formData.has("suggested_questions") || formData.has("suggested_questions[]");

  if (hasSuggestedQuestions) {
    const rawEntries = [
      ...formData.getAll("suggested_questions"),
      ...formData.getAll("suggested_questions[]"),
    ];

    const candidates: string[] = [];
    for (const entry of rawEntries) {
      if (typeof entry !== "string") continue;
      const trimmed = entry.trim();
      if (!trimmed) continue;

      // Support stringified JSON array format e.g. '["Q1", "Q2"]'
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              if (typeof item === "string") {
                candidates.push(item);
              }
            }
            continue;
          }
        } catch {
          // Fall back to literal string
        }
      }

      // Support newline-separated entries
      if (trimmed.includes("\n")) {
        for (const line of trimmed.split("\n")) {
          if (line.trim().length > 0) {
            candidates.push(line);
          }
        }
        continue;
      }

      candidates.push(trimmed);
    }

    if (candidates.length > 4) {
      return { error: "You can specify a maximum of 4 suggested questions." };
    }

    for (const rawQ of candidates) {
      const cleaned = rawQ.replace(/[\x00-\x1F\x7F]/g, "").trim();
      if (cleaned.length < 2 || cleaned.length > 100) {
        return {
          error: "Each suggested question must be between 2 and 100 characters.",
        };
      }
      suggestedQuestions.push(cleaned);
    }
  }

  const updatePayload: {
    brand_name: string;
    brand_color: string;
    welcome_message: string;
    logo_url: string | null;
    position: string;
    launcher_text?: string;
    suggested_questions?: string[];
  } = {
    brand_name: brandName,
    brand_color: brandColor,
    welcome_message: welcomeMessage,
    logo_url: logoUrl,
    position,
  };

  if (hasLauncherText) {
    updatePayload.launcher_text = launcherText;
  }

  if (hasSuggestedQuestions) {
    updatePayload.suggested_questions = suggestedQuestions;
  }

  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("widget_settings")
    .update(updatePayload)
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
