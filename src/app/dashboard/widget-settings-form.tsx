"use client";

import { useActionState, useState } from "react";
import { updateWidgetSettingsAction, type SettingsActionState } from "@/app/actions/settings";
import Link from "next/link";

interface WidgetSettingsData {
  brand_name: string;
  brand_color: string;
  welcome_message: string;
  logo_url: string | null;
  position: string;
}

interface WidgetSettingsFormProps {
  initialSettings: WidgetSettingsData;
  isReadOnly: boolean;
  publicWidgetKey: string;
}

const initialState: SettingsActionState = {
  error: null,
};

export function WidgetSettingsForm({
  initialSettings,
  isReadOnly,
  publicWidgetKey,
}: WidgetSettingsFormProps) {
  const [state, formAction, isPending] = useActionState(
    updateWidgetSettingsAction,
    initialState,
  );

  const [brandColor, setBrandColor] = useState(initialSettings.brand_color || "#0F172A");

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Widget Settings & Branding
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Customize the appearance and welcome message of your live customer chat widget.
          </p>
        </div>

        <Link
          href={`/widget?key=${encodeURIComponent(publicWidgetKey)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-2xs hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700/80"
        >
          <span>Open Live Widget</span>
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </Link>
      </div>

      {isReadOnly && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300"
        >
          You are viewing this workspace as a <strong>Member</strong>. Only workspace <strong>Owners</strong> and <strong>Admins</strong> can modify widget settings.
        </div>
      )}

      <form action={formAction} className="mt-6 space-y-5">
        {state.error && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300"
          >
            {state.error}
          </div>
        )}

        {state.success && state.message && (
          <div
            role="status"
            className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/50 dark:text-emerald-300"
          >
            {state.message}
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {/* Brand Name */}
          <div>
            <label
              htmlFor="brand_name"
              className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
            >
              Brand Name
            </label>
            <input
              id="brand_name"
              name="brand_name"
              type="text"
              required
              minLength={1}
              maxLength={60}
              defaultValue={initialSettings.brand_name}
              disabled={isReadOnly || isPending}
              className="mt-1.5 block w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 disabled:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-400 dark:disabled:bg-zinc-800/50"
              placeholder="e.g. Acme Support"
            />
          </div>

          {/* Brand Color */}
          <div>
            <label
              htmlFor="brand_color"
              className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
            >
              Brand Color
            </label>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                type="color"
                value={brandColor.startsWith("#") ? brandColor : "#0F172A"}
                onChange={(e) => setBrandColor(e.target.value)}
                disabled={isReadOnly || isPending}
                className="h-9 w-10 cursor-pointer rounded-lg border border-zinc-300 p-0.5 disabled:opacity-60 dark:border-zinc-700"
              />
              <input
                id="brand_color"
                name="brand_color"
                type="text"
                required
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                disabled={isReadOnly || isPending}
                className="block flex-1 rounded-xl border border-zinc-300 bg-white px-3.5 py-2 font-mono text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 disabled:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-400 dark:disabled:bg-zinc-800/50"
                placeholder="#0F172A"
              />
            </div>
          </div>
        </div>

        {/* Welcome Message */}
        <div>
          <label
            htmlFor="welcome_message"
            className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
          >
            Welcome Message
          </label>
          <textarea
            id="welcome_message"
            name="welcome_message"
            required
            rows={3}
            minLength={1}
            maxLength={500}
            defaultValue={initialSettings.welcome_message}
            disabled={isReadOnly || isPending}
            className="mt-1.5 block w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 disabled:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-400 dark:disabled:bg-zinc-800/50"
            placeholder="Hi! How can we help you today?"
          />
          <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
            The greeting message shown to visitors when they first open the chat widget.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {/* Logo URL */}
          <div>
            <label
              htmlFor="logo_url"
              className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
            >
              Logo URL (Optional)
            </label>
            <input
              id="logo_url"
              name="logo_url"
              type="url"
              defaultValue={initialSettings.logo_url || ""}
              disabled={isReadOnly || isPending}
              className="mt-1.5 block w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 disabled:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-400 dark:disabled:bg-zinc-800/50"
              placeholder="https://example.com/logo.png"
            />
          </div>

          {/* Position */}
          <div>
            <label
              htmlFor="position"
              className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
            >
              Widget Position
            </label>
            <select
              id="position"
              name="position"
              defaultValue={initialSettings.position || "bottom-right"}
              disabled={isReadOnly || isPending}
              className="mt-1.5 block w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 disabled:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-400 dark:disabled:bg-zinc-800/50"
            >
              <option value="bottom-right">Bottom Right</option>
              <option value="bottom-left">Bottom Left</option>
            </select>
          </div>
        </div>

        {!isReadOnly && (
          <div className="pt-2">
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex justify-center rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {isPending ? "Saving settings..." : "Save Settings"}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
