import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

// Initialize the Gemini client using the environment variable
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "Invalid messages format. Expected an array." },
        { status: 400 }
      );
    }

    // 1. We extract the latest message from the user
    const lastUserMessage = messages[messages.length - 1]?.content;

    if (!lastUserMessage) {
      return NextResponse.json(
        { error: "Message content cannot be empty." },
        { status: 400 }
      );
    }

    // 2. Format history for Gemini (roles: 'user' and 'model')
    // We filter out the latest message because we pass it to system instruction or contents,
    // and format the rest as history context.
    const history = messages.slice(0, -1).map((msg: any) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

    // 3. Start a chat session or make a single call.
    // For a multi-turn chat, we can start a chat and pass history:
    const chat = ai.chats.create({
      model: "gemini-3.5-flash",
      history: history,
    });

    const response = await chat.sendMessage({
      message: lastUserMessage,
    });

    // 4. Return the generated text to the frontend client
    return NextResponse.json({
      role: "assistant",
      content: response.text || "I couldn't generate a response.",
    });
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate AI response." },
      { status: 500 }
    );
  }
}
