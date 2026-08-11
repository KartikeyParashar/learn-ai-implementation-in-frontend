"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hello! I am your AI assistant. How can I help you today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Automatically scroll to the bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input };
    const updatedMessages = [...messages, userMessage];

    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updatedMessages }),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch response");
      }

      // Check if we received a readable stream body
      if (!response.body) {
        throw new Error("No response body");
      }

      // 1. Initialize the reader and decoder
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;

      // 2. Add an empty assistant message to state that we will append to
      const assistantMessage: Message = { role: "assistant", content: "" };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsLoading(false); // Hide the bounce spinner since streaming started

      // 3. Read chunks from the stream until finished
      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        const chunkValue = decoder.decode(value);

        // Append the new chunk to the last assistant message in state
        setMessages((prev) => {
          const updated = [...prev];
          const lastMessage = updated[updated.length - 1];
          if (lastMessage && lastMessage.role === "assistant") {
            lastMessage.content += chunkValue;
          }
          return updated;
        });
      }
    } catch (error) {
      console.error(error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, something went wrong. Please try again.",
        },
      ]);
      setIsLoading(false);
    }

  };

  return (
    <div className="flex h-screen w-full flex-col bg-zinc-950 text-zinc-100 font-sans">
      {/* Header */}
      <header className="flex h-16 items-center justify-between border-b border-zinc-800 px-6 bg-zinc-900/50 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
          <h1 className="font-semibold text-lg tracking-wide bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            Gemini Streaming Assistant
          </h1>
        </div>
        <div className="text-xs text-zinc-500 font-mono">Model: gemini-3.5-flash</div>
      </header>

      {/* Messages Area */}
      <main className="flex-1 overflow-y-auto p-6 space-y-6 max-w-3xl w-full mx-auto">
        {messages.map((message, index) => {
          const isUser = message.role === "user";
          return (
            <div
              key={index}
              className={`flex w-full items-start gap-4 ${isUser ? "justify-end" : "justify-start"
                }`}
            >
              {/* AI Avatar */}
              {!isUser && (
                <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full bg-gradient-to-tr from-emerald-500 to-cyan-500 text-xs font-bold text-zinc-950 shadow-lg shadow-emerald-500/10">
                  AI
                </div>
              )}

              {/* Message Bubble */}
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm transition-all duration-200 ${isUser
                    ? "bg-zinc-800 text-zinc-100 rounded-tr-none hover:bg-zinc-700/90"
                    : "bg-zinc-900/80 border border-zinc-800/80 text-zinc-300 rounded-tl-none"
                  }`}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>

              {/* User Avatar */}
              {isUser && (
                <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full bg-zinc-700 text-xs font-semibold text-zinc-100">
                  ME
                </div>
              )}
            </div>
          );
        })}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex w-full items-start gap-4 justify-start">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-emerald-500 to-cyan-500 text-xs font-bold text-zinc-950 animate-pulse">
              AI
            </div>
            <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl rounded-tl-none px-4 py-3">
              <div className="flex items-center gap-1.5 py-1">
                <div className="h-2 w-2 rounded-full bg-zinc-500 animate-bounce [animation-delay:-0.3s]" />
                <div className="h-2 w-2 rounded-full bg-zinc-500 animate-bounce [animation-delay:-0.15s]" />
                <div className="h-2 w-2 rounded-full bg-zinc-500 animate-bounce" />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Input Form */}
      <footer className="border-t border-zinc-800/80 bg-zinc-900/30 p-4 backdrop-blur-md">
        <form
          onSubmit={handleSubmit}
          className="mx-auto max-w-3xl flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-full px-4 py-2 focus-within:border-emerald-500/50 focus-within:ring-1 focus-within:ring-emerald-500/30 transition-all duration-200"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Gemini anything..."
            disabled={isLoading}
            className="flex-1 bg-transparent py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-zinc-950 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-600 transition-colors duration-150 shadow-md shadow-emerald-500/10 cursor-pointer disabled:cursor-not-allowed"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
              stroke="currentColor"
              className="w-5 h-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
              />
            </svg>
          </button>
        </form>
      </footer>
    </div>
  );
}
