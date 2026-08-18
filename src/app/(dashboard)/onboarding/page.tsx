import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  // Check if user is already a member of a workspace
  const { data: members } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1);

  if (members && members.length > 0) {
    redirect("/dashboard");
  }

  const defaultCompanyName = (user.user_metadata?.company_name as string) || "";

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-zinc-950 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="text-center">
          <span className="inline-flex items-center rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
            Step 2 of 2
          </span>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Set up your Workspace
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Every business has an isolated workspace. Let&apos;s create yours.
          </p>
        </div>

        <OnboardingForm defaultName={defaultCompanyName} />
      </div>
    </div>
  );
}
