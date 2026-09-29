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
  launcher_text?: string;
  suggested_questions?: string[];
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

  // Form field state for real-time live preview
  const [brandName, setBrandName] = useState(initialSettings.brand_name || "");
  const [brandColor, setBrandColor] = useState(initialSettings.brand_color || "#0F172A");
  const [welcomeMessage, setWelcomeMessage] = useState(initialSettings.welcome_message || "");
  const [logoUrl, setLogoUrl] = useState(initialSettings.logo_url || "");
  const [position, setPosition] = useState(initialSettings.position || "bottom-right");
  const [launcherText, setLauncherText] = useState(initialSettings.launcher_text || "");
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>(
    initialSettings.suggested_questions || [],
  );

  // Suggested questions editor state
  const [newQuestion, setNewQuestion] = useState("");
  const [questionError, setQuestionError] = useState<string | null>(null);

  // Live preview interactive state
  const [isPreviewOpen, setIsPreviewOpen] = useState(true);
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);

  const handleAddQuestion = () => {
    const trimmed = newQuestion.replace(/[\x00-\x1F\x7F]/g, "").trim();
    if (suggestedQuestions.length >= 4) {
      setQuestionError("Maximum of 4 suggested questions allowed.");
      return;
    }
    if (trimmed.length < 2 || trimmed.length > 100) {
      setQuestionError("Each suggested question must be between 2 and 100 characters.");
      return;
    }
    if (suggestedQuestions.includes(trimmed)) {
      setQuestionError("This question has already been added.");
      return;
    }
    setSuggestedQuestions([...suggestedQuestions, trimmed]);
    setNewQuestion("");
    setQuestionError(null);
  };

  const handleRemoveQuestion = (indexToRemove: number) => {
    setSuggestedQuestions(suggestedQuestions.filter((_, idx) => idx !== indexToRemove));
    if (questionError) setQuestionError(null);
  };

  const safeBrandColor = brandColor.startsWith("#") ? brandColor : "#0F172A";

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Widget Settings & Branding
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Customize the appearance, welcome message, launcher, and suggested questions of your live customer chat widget.
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

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left Column: Settings Form */}
        <form action={formAction} className="space-y-5 lg:col-span-7">
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

          {/* Hidden input to pass suggested questions array to Server Action */}
          <input
            type="hidden"
            name="suggested_questions"
            value={JSON.stringify(suggestedQuestions)}
          />

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {/* Brand Name */}
            <div>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="brand_name"
                  className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
                >
                  Brand Name
                </label>
                <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                  {brandName.length}/60
                </span>
              </div>
              <input
                id="brand_name"
                name="brand_name"
                type="text"
                required
                minLength={1}
                maxLength={60}
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
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
                  value={safeBrandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  disabled={isReadOnly || isPending}
                  aria-label="Choose brand color"
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
            <div className="flex items-center justify-between">
              <label
                htmlFor="welcome_message"
                className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
              >
                Welcome Message
              </label>
              <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                {welcomeMessage.length}/500
              </span>
            </div>
            <textarea
              id="welcome_message"
              name="welcome_message"
              required
              rows={3}
              minLength={1}
              maxLength={500}
              value={welcomeMessage}
              onChange={(e) => setWelcomeMessage(e.target.value)}
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
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
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
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                disabled={isReadOnly || isPending}
                className="mt-1.5 block w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 disabled:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-400 dark:disabled:bg-zinc-800/50"
              >
                <option value="bottom-right">Bottom Right</option>
                <option value="bottom-left">Bottom Left</option>
              </select>
            </div>
          </div>

          {/* Launcher Text */}
          <div>
            <div className="flex items-center justify-between">
              <label
                htmlFor="launcher_text"
                className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
              >
                Launcher Text (Optional)
              </label>
              <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                {launcherText.length}/30
              </span>
            </div>
            <input
              id="launcher_text"
              name="launcher_text"
              type="text"
              maxLength={30}
              value={launcherText}
              onChange={(e) => setLauncherText(e.target.value)}
              disabled={isReadOnly || isPending}
              className="mt-1.5 block w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 disabled:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-400 dark:disabled:bg-zinc-800/50"
              placeholder="e.g. Chat with us"
            />
            <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
              Optional button label displayed next to the chat launcher icon (up to 30 characters).
            </p>
          </div>

          {/* Suggested Questions Section */}
          <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                  Suggested Questions
                </h3>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Quick prompts shown to visitors in the widget (up to 4 questions, 2–100 characters each).
                </p>
              </div>
              <span className="inline-flex items-center rounded-md bg-zinc-200/80 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {suggestedQuestions.length}/4
              </span>
            </div>

            {/* Existing Questions List */}
            {suggestedQuestions.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-300 p-3 text-center text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                No suggested questions added yet. Add questions below to help visitors get quick answers.
              </div>
            ) : (
              <div className="space-y-2">
                {suggestedQuestions.map((question, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-2xs dark:border-zinc-700 dark:bg-zinc-800"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[10px] font-bold text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                        {idx + 1}
                      </span>
                      <span className="truncate font-medium text-zinc-800 dark:text-zinc-200">
                        {question}
                      </span>
                    </div>

                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() => handleRemoveQuestion(idx)}
                        disabled={isPending}
                        aria-label={`Remove question ${idx + 1}`}
                        className="shrink-0 rounded p-2 sm:p-1 min-h-[40px] min-w-[40px] sm:min-h-0 sm:min-w-0 inline-flex items-center justify-center text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Add Question Control */}
            {!isReadOnly && (
              <div className="space-y-1.5 pt-1">
                {suggestedQuestions.length < 4 ? (
                  <>
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="new_question_input"
                        className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400"
                      >
                        Add a Question
                      </label>
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                        {newQuestion.length}/100
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <input
                        id="new_question_input"
                        type="text"
                        maxLength={100}
                        value={newQuestion}
                        onChange={(e) => {
                          setNewQuestion(e.target.value);
                          if (questionError) setQuestionError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddQuestion();
                          }
                        }}
                        disabled={isPending}
                        placeholder="e.g. How does your pricing work?"
                        className="flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-400"
                      />
                      <button
                        type="button"
                        onClick={handleAddQuestion}
                        disabled={isPending || newQuestion.trim().length < 2}
                        className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-3.5 py-2 min-h-[40px] sm:min-h-0 text-xs font-medium text-white shadow-2xs hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                      >
                        Add
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Maximum limit of 4 suggested questions reached. Remove a question to add a new one.
                  </p>
                )}

                {questionError && (
                  <p className="text-xs font-medium text-red-600 dark:text-red-400">
                    {questionError}
                  </p>
                )}
              </div>
            )}
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

        {/* Right Column: Live Client-Side Preview */}
        <div className="lg:col-span-5">
          <div className="sticky top-6 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                  Live Preview
                </h3>
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                  Real-time
                </span>
              </div>

              {/* Toggle view mode */}
              <div className="flex items-center rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 text-[11px] font-medium dark:border-zinc-700 dark:bg-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(true)}
                  className={`rounded-md px-2.5 py-1.5 sm:px-2 sm:py-1 min-h-[36px] sm:min-h-0 inline-flex items-center justify-center transition-colors ${
                    isPreviewOpen
                      ? "bg-white text-zinc-900 shadow-2xs dark:bg-zinc-700 dark:text-zinc-100"
                      : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                  }`}
                >
                  Chat View
                </button>
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(false)}
                  className={`rounded-md px-2.5 py-1.5 sm:px-2 sm:py-1 min-h-[36px] sm:min-h-0 inline-flex items-center justify-center transition-colors ${
                    !isPreviewOpen
                      ? "bg-white text-zinc-900 shadow-2xs dark:bg-zinc-700 dark:text-zinc-100"
                      : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                  }`}
                >
                  Launcher Only
                </button>
              </div>
            </div>

            {/* Preview Viewport Canvas */}
            <div
              className={`relative flex min-h-[460px] flex-col justify-end overflow-hidden rounded-2xl border border-zinc-200 bg-gradient-to-b from-zinc-100/70 via-zinc-50 to-zinc-100 p-4 shadow-inner dark:border-zinc-800 dark:from-zinc-900/50 dark:via-zinc-950 dark:to-zinc-900/70 ${
                position === "bottom-left" ? "items-start" : "items-end"
              }`}
            >
              {/* Canvas Watermark / Info */}
              <div className="pointer-events-none absolute left-3 top-3 select-none text-[10px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-600">
                Visitor Screen • {position}
              </div>

              {/* Chat Window Mockup */}
              {isPreviewOpen && (
                <div className="mb-3 flex w-full max-w-[310px] flex-col overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-xl transition-all duration-200 dark:border-zinc-800 dark:bg-zinc-900">
                  {/* Mock Header */}
                  <div
                    style={{ backgroundColor: safeBrandColor }}
                    className="flex items-center justify-between px-3.5 py-3 text-white shadow-xs"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      {logoUrl.trim() && failedLogoUrl !== logoUrl ? (
                        <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full border border-white/30 bg-white">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={logoUrl}
                            alt={brandName || "Brand Logo"}
                            onError={() => setFailedLogoUrl(logoUrl)}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-bold text-white uppercase">
                          {(brandName.trim() || "A").charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <h4 className="truncate text-xs font-semibold leading-tight text-white">
                          {brandName.trim() || "Support"}
                        </h4>
                        <span className="flex items-center gap-1 text-[10px] text-white/80">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                          Online
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsPreviewOpen(false)}
                      aria-label="Close preview chat"
                      className="rounded-lg p-2 sm:p-1 min-h-[40px] min-w-[40px] sm:min-h-0 sm:min-w-0 inline-flex items-center justify-center text-white/80 hover:bg-white/10 hover:text-white"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Mock Messages Stream */}
                  <div className="space-y-3 bg-zinc-50/50 p-3 text-left dark:bg-zinc-950/40">
                    <div className="flex flex-col items-start">
                      <div className="mb-1 flex items-center gap-1 px-1 text-[10px] text-zinc-400 dark:text-zinc-500">
                        <span className="font-medium">
                          {(brandName.trim() || "AI Support") + " AI"}
                        </span>
                        <span>•</span>
                        <span>Just now</span>
                      </div>

                      <div className="max-w-[90%] rounded-2xl rounded-tl-xs border border-zinc-200/80 bg-white p-2.5 text-xs leading-relaxed text-zinc-800 shadow-2xs break-words [overflow-wrap:anywhere] dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">
                        <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                          {welcomeMessage.trim() || "Hi! How can we help you today?"}
                        </p>
                      </div>
                    </div>

                    {/* Suggested Questions Pills */}
                    {suggestedQuestions.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                          Suggested Questions
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {suggestedQuestions.map((q, idx) => (
                            <div
                              key={idx}
                              className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 shadow-2xs transition-colors dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                            >
                              {q}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Mock Input Bar */}
                  <div className="flex items-center gap-2 border-t border-zinc-200 bg-white p-2.5 dark:border-zinc-800 dark:bg-zinc-900">
                    <input
                      type="text"
                      disabled
                      placeholder="Type a message..."
                      className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-400 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500"
                    />
                    <div
                      style={{ backgroundColor: safeBrandColor }}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-white shadow-2xs opacity-80"
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </div>
              )}

              {/* Mock Launcher Button */}
              <button
                type="button"
                onClick={() => setIsPreviewOpen(!isPreviewOpen)}
                style={{ backgroundColor: safeBrandColor }}
                aria-label={isPreviewOpen ? "Close preview chat" : "Open preview chat"}
                className={`transition-all duration-200 text-white shadow-xl hover:scale-105 active:scale-95 focus:outline-none ${
                  !isPreviewOpen && launcherText.trim()
                    ? "inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-semibold"
                    : "flex h-12 w-12 items-center justify-center rounded-full"
                }`}
              >
                {isPreviewOpen ? (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <>
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                      />
                    </svg>
                    {launcherText.trim() && <span>{launcherText.trim()}</span>}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

