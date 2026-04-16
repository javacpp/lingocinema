<div align="center">
  <h1>🍿 LingoCinema</h1>
  <p><b>Learn English naturally from movies and TV shows.</b></p>
</div>

## Overview
LingoCinema is a full-stack web application that turns any movie or TV show subtitle file (`.srt` or `.vtt`) into a personalised English vocabulary study session.

Simply upload a subtitle, and the app uses **AI** to exhaustively analyse the text. It extracts a comprehensive library of words, idioms, phrases, slang, and grammar points—each annotated with bilingual definitions (English + Chinese), phonetics, CEFR levels, and usage examples. You can even click to hear pronunciations!

## 🔥 Features
* **Subtitle Analysis:** Upload `.srt` or `.vtt` files and automatically extract vocabulary.
* **CEFR Level Filtering:** Filter your extracted items by difficulty (A1, A2, B1, B2, C1, C2).
* **Rich Context:** Every extracted item includes English and Chinese meanings, phonetics, part-of-speech, and example sentences.
* **Pronunciation TTS:** Listen to any term in American or British English.
* **Search & Filter:** Real-time search across terms and definitions.
* **Local Storage:** Everything is saved to a fast local SQLite database.

## 🛠 Tech Stack
* **Frontend:** React 19, TypeScript, Tailwind CSS 4, Motion, Vite
* **Backend:** Express, better-sqlite3
* **AI/TTS:** Google Gemini (`gemini-3-flash-preview`), Piper, or Ollama (fully configurable)

## 🚀 How to Run Locally

### Prerequisites
* **Node.js** v22 (LTS is recommended. *Note: Node v23 has known compatibility issues with `tsx`*)
* **npm**
* A **Google Gemini API Key** (or local Ollama setup)

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
   Open `.env.local` and add your Gemini API Key:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```
   *(Note: You can easily get a free key from [Google AI Studio](https://aistudio.google.com/app/apikey))*

3. **Start the Development Server**
   ```bash
   npm run dev
   ```

4. **Open the App**
   Navigate to [http://localhost:3000](http://localhost:3000) in your browser!
