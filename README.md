<div align="center">
  <h1>🍿 LingoCinema</h1>
  <p><b>Learn English naturally from movies and TV shows.</b></p>
</div>

## Overview
LingoCinema is a full-stack web application that turns any movie or TV show subtitle file (`.srt` ) into a personalised English vocabulary study session.

Simply upload a subtitle, and the app uses **AI** to exhaustively analyse the text. It extracts a comprehensive library of words, idioms, phrases, slang, and grammar points—each annotated with bilingual definitions (English + Chinese), phonetics, CEFR levels, and usage examples. You can even click to hear pronunciations!

## 🔥 Features
* **Subtitle Analysis:** Upload `.srt` or `.vtt` files and automatically extract vocabulary.
* **CEFR Level Filtering:** Filter your extracted items by difficulty (A1, A2, B1, B2, C1, C2).
* **Rich Context:** Every extracted item includes English and Chinese meanings, phonetics, part-of-speech, and example sentences.
* **Pronunciation TTS:** Listen to any term in American or British English.
* **Search & Filter:** Real-time search across terms and definitions.

## 🛠 Tech Stack
* **Frontend:** React 19, TypeScript, Tailwind CSS 4, Motion, Vite
* **Backend:** Express, better-sqlite3
* **AI Providers:** Cloud APIs (Google Gemini, OpenAI) or Local Models (llama.cpp, Ollama)
* **TTS Providers:** Cloud APIs (Google Gemini, OpenAI) or Local Voice Rendering (Piper)

## 🚀 How to Run Locally

### Prerequisites
* **Node.js** v22 (LTS is recommended. *Note: Node v23 has known compatibility issues with `tsx`*)
* **npm**
* A **Cloud API Key** (Google Gemini or OpenAI) OR a local LLM setup (`llama.cpp` / `Ollama`)

### Setup Steps

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment Variables**
   Create a local environment configuration file: 
   ```bash
   cp .env.example .env.local
   ```
   Open `.env.local` and add your preferred configuration. You can use Cloud APIs (like Gemini/OpenAI) or local engines entirely:
   ```env
   # Option A: Cloud APIs
   GEMINI_API_KEY=your_gemini_api_key_here

   # Option B: Local LLMs (Ollama / llama.cpp)
   OLLAMA_BASE_URL=http://localhost:11434
   OLLAMA_TEXT_MODEL=qwen2.5:7b

   LLAMACPP_BASE_URL=http://localhost:8080
   LLAMACPP_TEXT_MODEL=default

   # Option C: Local Text-to-Speech (Piper)
   PIPER_BINARY_PATH=/absolute/path/to/piper
   PIPER_MODEL_PATH=/absolute/path/to/en_GB-alan-medium.onnx
   ```

3. **Start the Development Server**
   ```bash
   npm run dev
   ```

4. **Open the App**
   Navigate to [http://localhost:3000](http://localhost:3000) in your browser!
5. **Offline Local AI Deployment**
   Want to run models entirely offline without needing any cloud API keys? Read our [Local Deployment Guide](docs/LOCAL_DEPLOYMENT.md) for full instructions on configuring **llama.cpp**, **Ollama**, and native **Piper TTS** engines!
