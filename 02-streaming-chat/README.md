# Day 2: Streaming Chat with Gemini API

A Next.js application that streams chat responses word-by-word in real-time from the Google Gemini API using the new `@google/genai` SDK.

## Key Learnings

1. **`sendMessageStream`**: Invoking streaming responses from a Gemini chat session.
2. **ReadableStream API**: Setting up a custom backend stream encoder to pipe text chunks to the client as they arrive from the Gemini model.
3. **Stream Reader (`getReader()`)**: Using a client-side stream reader to decode binary chunks into text and update state dynamically.

## How to Run

1. Navigate to the project directory:
   ```bash
   cd 02-streaming-chat
   ```

2. Run the Next.js development server:
   ```bash
   npm run dev
   ```

3. Open http://localhost:3000 to test the streaming interface.
