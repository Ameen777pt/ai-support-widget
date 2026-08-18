"use client";

import { useActionState } from "react";
import { createWorkspaceAction, type WorkspaceActionState } from "@/app/actions/workspace";

const initialState: WorkspaceActionState = {
  error: null,
};

interface OnboardingFormProps {
  defaultName: string;
}

export function OnboardingForm({ defaultName }: OnboardingFormProps) {
  const [state, formAction, isPending] = useActionState(
    createWorkspaceAction,
    initialState,
  );

  return (
    <form action={formAction} className="mt-8 space-y-6">
      {state.error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300"
        >
          {state.error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Workspace / Company Name
          </label>
          <div className="mt-1">
            <input
              id="name"
              name="name"
              type="text"
              required
              minLength={2}
              maxLength={60}
              defaultValue={defaultName}
              disabled={isPending}
              className="block w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 placeholder-zinc-400 shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-400 dark:focus:ring-zinc-400 sm:text-sm"
              placeholder="e.g. Acme Corp"
            />
          </div>
          <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            This name will be displayed in your support widget and dashboard.
          </p>
        </div>
      </div>

      <div>
        <button
          type="submit"
          disabled={isPending}
          className="flex w-full justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {isPending ? "Creating workspace..." : "Launch Workspace"}
        </button>
      </div>
    </form>
  );
}
