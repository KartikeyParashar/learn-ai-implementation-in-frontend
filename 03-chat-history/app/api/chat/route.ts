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

    // 1. Extract the latest message from the user
    const lastUserMessage = messages[messages.length - 1]?.content;

    if (!lastUserMessage) {
      return NextResponse.json(
        { error: "Message content cannot be empty." },
        { status: 400 }
      );
    }

    // 2. Format history for Gemini (roles: 'user' and 'model')
    // We slice(0, -1) to get everything *before* the latest user message.
    const rawHistory = messages.slice(0, -1).map((msg: any) => ({
      role: msg.role === "assistant" ? "model" : "user",
      content: msg.content,
    }));

    // Group consecutive messages of the same role (e.g. merge multiple user messages in a row)
    const groupedHistory: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];

    for (const msg of rawHistory) {
      if (groupedHistory.length > 0 && groupedHistory[groupedHistory.length - 1].role === msg.role) {
        // Merge text content with the previous message of the same role
        groupedHistory[groupedHistory.length - 1].parts[0].text += "\n" + msg.content;
      } else {
        groupedHistory.push({
          role: msg.role,
          parts: [{ text: msg.content }],
        });
      }
    }

    let history = groupedHistory;

    // Gemini API constraint: The chat history MUST start with a 'user' message.
    if (history.length > 0 && history[0].role === "model") {
      history = history.slice(1);
    }

    // 3. Start a chat session and seed it with the past history
    const chat = ai.chats.create({
      model: "gemini-3.5-flash",
      history: history,
    });

    // 4. Call the streaming API to send the latest message
    const responseStream = await chat.sendMessageStream({
      message: lastUserMessage,
    });

    // 5. Setup a ReadableStream that forwards chunks to the client in real-time
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of responseStream) {
            const text = chunk.text;
            if (text) {
              // Convert text chunk to UTF-8 binary data and send it
              controller.enqueue(encoder.encode(text));
            }
          }
          controller.close(); // Close stream when finished
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
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
