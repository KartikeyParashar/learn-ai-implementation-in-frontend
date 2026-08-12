"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
}

function generateId(): string {
  return Date.now().toString();
}

function getTimestamp(): number {
  return Date.now();
}

export default function Home() {
  // --- STATE MANAGEMENT ---
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get the active session object
  const activeSession = sessions.find((s) => s.id === activeSessionId);

  // Automatically scroll to the bottom when new messages arrive or streaming status changes
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [activeSession?.messages, isStreaming]);

  // ==========================================
  // TODO: Step 1 - Load sessions from LocalStorage on mount
  // ==========================================
  useEffect(() => {
    const saved = localStorage.getItem("gemini_sessions");
    let loadedSessions: ChatSession[] = [];
    let loadedActiveId = "";

    if (saved) {
      try {
        const parsed = JSON.parse(saved) as ChatSession[];
        if (parsed.length > 0) {
          loadedSessions = parsed;
          loadedActiveId = parsed[0].id;
        }
      } catch (e) {
        console.error("Failed to parse chat sessions: ", e);
      }
    }

    if (loadedSessions.length === 0) {
      const defaultId = generateId();
      loadedSessions = [
        {
          id: defaultId,
          title: "Welcome Chat",
          messages: [
            {
              role: "assistant",
              content: "Hello! I am your AI assistant with chat history. Ask me anything!",
            },
          ],
          createdAt: getTimestamp(),
        },
      ];
      loadedActiveId = defaultId;
    }

    // Defer the state updates to avoid synchronous cascading renders during mount
    const timer = setTimeout(() => {
      setSessions(loadedSessions);
      setActiveSessionId(loadedActiveId);
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  // ==========================================
  // TODO: Step 2 - Save sessions to LocalStorage on change
  // ==========================================
  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem("gemini_sessions", JSON.stringify(sessions));
    }
  }, [sessions]);

  // ==========================================
  // TODO: Step 3 - Create a New Chat Session
  // ==========================================
  const createNewSession = () => {
    const newId = generateId();
    const newSession: ChatSession = {
      id: newId,
      title: "New Chat",
      messages: [
        {
          role: "assistant",
          content: "Hello! Start a new topic here. How can I help you?",
        },
      ],
      createdAt: getTimestamp(),
    };

    // Put the new chat session at the top of the sidebar list
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newId);
  };

  // ==========================================
  // TODO: Step 4 - Delete a Chat Session
  // ==========================================
  const deleteSession = (idToDelete: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Stop clicking "delete" from also selecting the chat
    // 1. Remove the chat from our list
    const updatedSessions = sessions.filter((s) => s.id !== idToDelete);
    setSessions(updatedSessions);
    // 2. If the user deleted the chat they were currently looking at:
    if (activeSessionId === idToDelete) {
      if (updatedSessions.length > 0) {
        // Switch to the next available chat
        setActiveSessionId(updatedSessions[0].id);
      } else {
        // If there are no chats left, create a fresh welcome chat so the UI isn't empty
        const defaultId = generateId();
        const defaultSession: ChatSession = {
          id: defaultId,
          title: "Welcome Chat",
          messages: [
            {
              role: "assistant",
              content: "Hello! I am your AI assistant with chat history. Ask me anything!",
            },
          ],
          createdAt: getTimestamp(),
        };
        setSessions([defaultSession]);
        setActiveSessionId(defaultId);
      }
    }
  };

  // ==========================================
  // Step 5 - Send Message and Stream Response
  // ==========================================
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming || !activeSessionId) return;

    const userText = input.trim();
    setInput(""); // Clear input field

    // 1. Create the new user message object.
    const userMessage: Message = { role: "user", content: userText };

    // 2. Update the sessions state to add this user message to the active session.
    //    We also rename the session title if it was currently "New Chat" or "Welcome Chat".
    setSessions((prevSessions) =>
      prevSessions.map((session) => {
        if (session.id !== activeSessionId) return session;

        const isDefaultTitle = session.title === "New Chat" || session.title === "Welcome Chat";
        const newTitle = isDefaultTitle
          ? userText.length > 25
            ? userText.substring(0, 25) + "..."
            : userText
          : session.title;

        return {
          ...session,
          title: newTitle,
          messages: [...session.messages, userMessage],
        };
      })
    );

    // 3. Prepare the history to send to the backend.
    //    We must construct this in-memory because setSessions state is asynchronous.
    const currentMessages = activeSession?.messages || [];
    const updatedMessages = [...currentMessages, userMessage];

    setIsStreaming(true);

    try {
      // 4. Fetch the streaming response from '/api/chat' using POST.
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updatedMessages }),
      });

      if (!response.ok) throw new Error("Failed to get response");
      if (!response.body) throw new Error("No response body");

      // 5. Read the response body stream chunk-by-chunk using a Reader.
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let aiText = "";
      let hasAddedAiPlaceholder = false;

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (done) break;

        const chunkValue = decoder.decode(value);
        aiText += chunkValue;

        // 6. As each chunk arrives, append it to the AI's message in the active session.
        setSessions((prevSessions) =>
          prevSessions.map((session) => {
            if (session.id !== activeSessionId) return session;

            const newMessages = [...session.messages];

            if (!hasAddedAiPlaceholder) {
              // First chunk: add the AI message bubble with the first text chunk
              newMessages.push({ role: "assistant", content: chunkValue });
              hasAddedAiPlaceholder = true;
            } else {
              // Subsequence chunks: update the text content of the last AI bubble
              const lastIdx = newMessages.length - 1;
              newMessages[lastIdx] = {
                ...newMessages[lastIdx],
                content: aiText,
              };
            }

            return {
              ...session,
              messages: newMessages,
            };
          })
        );
      }
    } catch (error) {
      console.error("Error sending message:", error);
      // Append an error message bubble to the chat
      setSessions((prevSessions) =>
        prevSessions.map((session) => {
          if (session.id !== activeSessionId) return session;
          return {
            ...session,
            messages: [
              ...session.messages,
              {
                role: "assistant",
                content: "Sorry, I encountered an error. Please check your connection and try again.",
              },
            ],
          };
        })
      );
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="flex h-screen w-full bg-zinc-950 text-zinc-100 font-sans overflow-hidden">
      {/* SIDEBAR */}
      <aside className="w-80 border-r border-zinc-800 bg-zinc-900/50 flex flex-col h-full shrink-0">
        {/* Sidebar Header */}
        <div className="p-4 border-b border-zinc-800">
          <button
            onClick={createNewSession}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-cyan-500 text-zinc-950 font-medium py-2.5 px-4 rounded-xl hover:from-emerald-400 hover:to-cyan-400 transition-all duration-200 shadow-lg shadow-emerald-500/10 text-sm"
          >
            <svg
              className="w-4 h-4 stroke-[2.5]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Chat
          </button>
        </div>

        {/* Sidebar Chat List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {sessions.length === 0 ? (
            <div className="text-center text-zinc-500 text-xs py-8">
              No recent chats
            </div>
          ) : (
            sessions.map((session) => {
              const isActive = session.id === activeSessionId;
              return (
                <div
                  key={session.id}
                  onClick={() => setActiveSessionId(session.id)}
                  className={`group flex items-center justify-between gap-3 px-3.5 py-3 rounded-xl cursor-pointer transition-all duration-150 ${isActive
                    ? "bg-zinc-800 text-zinc-100 border border-zinc-700/50"
                    : "text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200"
                    }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Chat Bubble Icon */}
                    <svg
                      className={`w-4 h-4 shrink-0 ${isActive ? "text-emerald-400" : "text-zinc-500"
                        }`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z"
                      />
                    </svg>
                    <span className="text-sm font-medium truncate">
                      {session.title}
                    </span>
                  </div>

                  {/* Delete Button */}
                  <button
                    onClick={(e) => deleteSession(session.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-zinc-700 rounded-md text-zinc-500 hover:text-red-400 transition-all duration-150"
                    title="Delete Chat"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m14.74 9-.346 9m-4.788 0L9 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                      />
                    </svg>
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-zinc-800 text-xs text-zinc-500 text-center font-mono">
          Day 3: Chat History
        </div>
      </aside>

      {/* MAIN CHAT WINDOW */}
      <main className="flex-1 flex flex-col h-full bg-zinc-950 relative">
        {/* Chat Header */}
        <header className="flex h-16 items-center justify-between border-b border-zinc-800/80 px-6 bg-zinc-900/20 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className={`h-2.5 w-2.5 rounded-full ${isStreaming ? "bg-cyan-500 animate-pulse" : "bg-emerald-500"}`} />
            <h1 className="font-semibold text-sm tracking-wide text-zinc-200">
              {activeSession ? activeSession.title : "No Conversation Selected"}
            </h1>
          </div>
          <div className="text-xs text-zinc-500 font-mono">
            {activeSession ? `${activeSession.messages.length} messages` : ""}
          </div>
        </header>

        {/* Messages List Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {!activeSession ? (
              <div className="h-96 flex flex-col items-center justify-center text-center p-8">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-cyan-500 flex items-center justify-center text-zinc-950 font-bold text-lg mb-4 shadow-lg shadow-emerald-500/10">
                  AI
                </div>
                <h3 className="text-lg font-medium text-zinc-200 mb-1">Welcome to Day 3</h3>
                <p className="text-sm text-zinc-500 max-w-sm">
                  Create a new chat session in the sidebar to begin having a conversation with Gemini.
                </p>
              </div>
            ) : (
              activeSession.messages.map((message, index) => {
                const isUser = message.role === "user";
                return (
                  <div
                    key={index}
                    className={`flex w-full items-start gap-4 ${isUser ? "justify-end" : "justify-start"
                      }`}
                  >
                    {/* Assistant Avatar */}
                    {!isUser && (
                      <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full bg-gradient-to-tr from-emerald-500 to-cyan-500 text-xs font-bold text-zinc-950 shadow-lg shadow-emerald-500/10">
                        AI
                      </div>
                    )}

                    {/* Message Text Bubble */}
                    <div
                      className={`max-w-[80%] rounded-2xl px-4.5 py-3 text-sm leading-relaxed shadow-sm transition-all duration-200 ${isUser
                        ? "bg-zinc-800 text-zinc-100 rounded-tr-none hover:bg-zinc-700/80 border border-zinc-700/30"
                        : "bg-zinc-900/60 border border-zinc-800/80 text-zinc-300 rounded-tl-none"
                        }`}
                    >
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    </div>

                    {/* User Avatar */}
                    {isUser && (
                      <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full bg-zinc-700 text-xs font-semibold text-zinc-200 border border-zinc-600/30">
                        ME
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {/* Streaming Indicator */}
            {isStreaming && (
              <div className="flex w-full items-start gap-4 justify-start">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-emerald-500 to-cyan-500 text-xs font-bold text-zinc-950 animate-pulse">
                  AI
                </div>
                <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl rounded-tl-none px-4.5 py-3">
                  <div className="flex items-center gap-1.5 py-1">
                    <div className="h-2 w-2 rounded-full bg-zinc-500 animate-bounce [animation-delay:-0.3s]" />
                    <div className="h-2 w-2 rounded-full bg-zinc-500 animate-bounce [animation-delay:-0.15s]" />
                    <div className="h-2 w-2 rounded-full bg-zinc-500 animate-bounce" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Text Form */}
        <footer className="border-t border-zinc-800/80 bg-zinc-900/10 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSubmit}
            className="mx-auto max-w-3xl flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-2.5 focus-within:border-emerald-500/50 focus-within:ring-1 focus-within:ring-emerald-500/20 transition-all duration-200"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={activeSessionId ? "Ask Gemini anything..." : "Create or select a chat first..."}
              disabled={isStreaming || !activeSessionId}
              className="flex-1 bg-transparent py-1.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              disabled={isStreaming || !input.trim() || !activeSessionId}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 disabled:opacity-40 disabled:hover:bg-zinc-800 disabled:hover:text-zinc-400 transition-all duration-200"
            >
              <svg
                className="w-4 h-4 transform rotate-90"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
              </svg>
            </button>
          </form>
        </footer>
      </main>
    </div>
  );
}
