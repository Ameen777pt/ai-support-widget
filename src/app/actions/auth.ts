"use server";

import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export interface AuthActionState {
  error: string | null;
  message?: string | null;
  success?: boolean;
}

// Standard, non-restrictive email format validation (matches standard HTML5 / RFC email structure)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signInAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = (formData.get("email") as string | null)?.trim().toLowerCase();
  const password = formData.get("password") as string | null;
  const next = (formData.get("next") as string | null) || "/dashboard";

  if (!email || !password) {
    return { error: "Please enter both your email address and password." };
  }

  if (!EMAIL_REGEX.test(email)) {
    return { error: "Please enter a valid email address." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  redirect(next);
}

export async function signUpAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = (formData.get("email") as string | null)?.trim().toLowerCase();
  const password = formData.get("password") as string | null;
  const companyName = (formData.get("companyName") as string | null)?.trim();

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  if (!EMAIL_REGEX.test(email)) {
    return { error: "Please enter a valid email address." };
  }

  if (password.length < 6) {
    return { error: "Password must be at least 6 characters long." };
  }

  if (!companyName) {
    return { error: "Company or Workspace name is required." };
  }

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") || headerList.get("host") || "localhost:3000";
  const protocol = headerList.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      data: {
        company_name: companyName,
      },
    },
  });

  if (error) {
    return { error: error.message };
  }

  // If email confirmation is enabled in Supabase and no active session is returned immediately
  if (data?.user && !data.session) {
    return {
      error: null,
      message: "A verification link has been sent to your email. Please check your inbox to confirm your account.",
      success: true,
    };
  }

  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
