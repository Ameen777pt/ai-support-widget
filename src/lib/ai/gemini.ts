import { GoogleGenAI } from "@google/genai";

const SYSTEM_INSTRUCTION = `You are a helpful, professional, and friendly customer support assistant.
Your goal is to assist users clearly, accurately, and concisely.
If you do not know the answer or cannot perform a requested action, politely let the user know and advise them to reach out to the support team directly.`;

/**
 * Creates or retrieves a GoogleGenAI instance.
 * Returns null if GEMINI_API_KEY is not configured.
 */
export function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({ apiKey });
}

export interface ConversationHistoryItem {
  sender_type: string;
  content: string;
}

/**
 * Generates an AI response from Gemini given conversation history.
 * Uses gemini-3.6-flash on the free tier.
 * Handles rate limits, timeouts, and errors safely without exposing secrets.
 */
export async function generateSupportResponse(
  history: ConversationHistoryItem[],
): Promise<string | null> {
  const ai = getGeminiClient();
  if (!ai) {
    return null;
  }

  try {
    // Filter out messages with empty content
    const validHistory = history.filter(
      (m) => m.content && m.content.trim().length > 0,
    );

    // Limit to the most recent 20 messages for prompt efficiency
    const recentMessages = validHistory.slice(-20);

    const contents = recentMessages.map((msg) => ({
      role: msg.sender_type === "user" ? "user" : "model",
      parts: [{ text: msg.content.trim() }],
    }));

    if (contents.length === 0) {
      return null;
    }

    // Ensure the conversation starts with a user message for Gemini multi-turn format
    const firstUserIndex = contents.findIndex((c) => c.role === "user");
    const sanitizedContents =
      firstUserIndex >= 0 ? contents.slice(firstUserIndex) : contents;

    if (sanitizedContents.length === 0) {
      return null;
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: sanitizedContents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
      },
    });

    const reply = response.text?.trim();
    return reply || null;
  } catch (error) {
    console.error(
      "Gemini generation error:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return null;
  }
}
