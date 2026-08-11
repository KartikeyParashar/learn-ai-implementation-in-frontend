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

    // 4. Call the streaming API instead of the standard sendMessage
    const responseStream = await chat.sendMessageStream({
      message: lastUserMessage,
    });

    // 5. Setup a ReadableStream that fetches chunks as they arrive from Gemini
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of responseStream) {
            const text = chunk.text;
            if (text) {
              // Convert text chunk to binary data and send it to the client
              controller.enqueue(encoder.encode(text));
            }
          }
          controller.close(); // Close stream when finished
        } catch (err) {
          controller.error(err);
        }
      },
    });

    // 6. Return the stream with proper event-stream headers
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
      },
    });
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate AI response." },
      { status: 500 }
    );
  }
}
