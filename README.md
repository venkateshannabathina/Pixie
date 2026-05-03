<div align="center">

<br>

<img src="https://github.com/venkateshannabathina/project-panda/raw/HEAD/icon.png" width="96" alt="Panda">

<br><br>

# Panda — Voice Companion

**A living 3D AI companion inside VS Code.**  
She talks, reacts, remembers, and has real personality.

<br>

[![VS Code](https://img.shields.io/badge/VS%20Code-1.85%2B-007ACC?style=flat-square&logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=VenkateshAnnabathina.project-panda)
[![Groq](https://img.shields.io/badge/Powered%20by-Groq-F55036?style=flat-square)](https://groq.com)
[![Three.js](https://img.shields.io/badge/3D-Three.js%20%2B%20VRM-black?style=flat-square&logo=threedotjs)](https://threejs.org)
[![License](https://img.shields.io/badge/License-MIT-22c55e?style=flat-square)](https://github.com/venkateshannabathina/project-panda/blob/HEAD/LICENSE)
[![Version](https://img.shields.io/badge/Version-0.1.0-da7756?style=flat-square)]()

<br>

<img src="https://github.com/venkateshannabathina/project-panda/raw/HEAD/DATA/example1.png" width="720" alt="Panda in VS Code" style="border-radius:12px">

<br><br>

*"Because coding alone at 2am shouldn't feel lonely."*

<br>

</div>

---

## What is Panda?

Panda puts a **fully animated 3D AI companion** into your VS Code sidebar. Hold a button, speak — she transcribes, thinks, and talks back. Her face reacts to her own emotions in real time. She remembers things you tell her across sessions. She has her own distinct personality, and she owns it.

This is not a chatbot widget. It is a complete voice pipeline with a living VRM avatar — expressions, lip sync, blink, and idle motion all driven in real time through the full conversation stack.

---

## The Pipeline

```
Hold button / Space  →  mic opens
        |
   SoX binary  →  16kHz mono WAV  (node-record-lpcm16)
        |
   Whisper STT  →  transcript  (Groq · whisper-large-v3-turbo)
        |
   Compressed memory injected into system prompt
        |
   LLM  →  streamed reply + [emotion:X] tag  (Groq · llama-3.3-70b-versatile)
        |
   Emotion tag  →  avatar expression driven live
        |
   Memory compressed in background  →  key:value tokens persisted
        |
   Orpheus TTS  →  WAV audio buffer  (Groq · canopylabs/orpheus-v1-english)
        |
   Web Audio API  →  decoded, played back in webview
```

Every stage is wired end-to-end with no human-in-the-loop. Speak, hear her respond, watch her face change — the entire loop happens in under a few seconds.

---

## Features

<table>
<tr>
<td width="50%" valign="top">

### Voice
- Hold-to-talk mic button
- Space bar shortcut (hands on keyboard)
- Whisper hallucination filter — silence never triggers a response
- Real-time lip sync driven from audio amplitude

### Intelligence
- Streaming LLM responses via Groq
- 6 distinct personalities with separate system prompts
- 13 emotion states parsed from every reply
- Compressed session memory — persists across VS Code restarts

</td>
<td width="50%" valign="top">

### Avatar
- Real-time 3D VRM rendering via Three.js
- Emotion-driven facial expressions (joy, angry, sad, smirk, and more)
- Idle blink and breathing animation
- Custom VRM upload — bring your own character

### Customization
- Custom wallpaper/background image
- Theme: light, dark, or system
- Character size: small, medium, large
- Background scene colors
- Multiple TTS voice options

</td>
</tr>
</table>

---

## Screenshots

<div align="center">

<table>
<tr>
<td align="center">
<img src="https://github.com/venkateshannabathina/project-panda/raw/HEAD/DATA/example1.png" width="340" alt="Panda dark mode">
<br><sub>Default · Dark theme</sub>
</td>
<td align="center">
<img src="https://github.com/venkateshannabathina/project-panda/raw/HEAD/DATA/example2.png" width="340" alt="Panda light mode">
<br><sub>Default · Light theme</sub>
</td>
</tr>
<tr>
<td align="center" colspan="2">
<img src="https://github.com/venkateshannabathina/project-panda/raw/HEAD/DATA/example3.png" width="700" alt="Panda with custom wallpaper">
<br><sub>Custom wallpaper · Room background</sub>
</td>
</tr>
</table>

</div>

---

## Personalities

Each personality is a completely different system prompt, not just a tone modifier. Switching characters changes how she thinks, speaks, and reacts.

| Personality | Character |
|---|---|
| **Friendly** | Warm, expressive, slightly chaotic. Smirks, judges, gets excited, feels things. |
| **Casual** | Chill bestie energy. "honestly", "lol", "dude" — never overthinks it. |
| **Sarcastic** | Deeply, magnificently sarcastic. Deadpan delivery is her superpower. |
| **Professional** | Composed, precise, unfailingly efficient. High-end assistant energy. |
| **Meanie** | Brutally honest, zero filter, will judge everything. Extremely high standards. |
| **Innocent** | Pure, sweet, wonderfully naive. Genuinely believes the world is magical. |

Custom characters you upload get their own personality assigned through the creation wizard — completely separate from Yuriko's settings.

---

## Setup

### 1 — Install SoX

Panda records audio through the `sox` binary. Install it before anything else.

```bash
# macOS
brew install sox

# Ubuntu / Debian
sudo apt install sox

# Windows
# Download from: https://sox.sourceforge.net
```

### 2 — Get a Groq API Key

Panda runs on Groq's inference API — it's fast and has a generous free tier.

1. Go to [console.groq.com](https://console.groq.com) and create an account
2. Generate an API key under **API Keys**
3. Keep it — you'll paste it into Panda on first launch

### 3 — Accept Orpheus TTS Terms

Orpheus is the voice model. You need to accept the terms once before it works.

Open this link while signed into your Groq account:  
[console.groq.com/playground?model=canopylabs/orpheus-v1-english](https://console.groq.com/playground?model=canopylabs%2Forpheus-v1-english)

Click **Accept Terms** when prompted. You only need to do this once.

### 4 — Install the Extension

Install from the VS Code Marketplace, or press `F5` in this repo to launch the Extension Development Host.

### 5 — First Launch

1. Click the **Panda** icon in the VS Code activity bar
2. Paste your Groq API key when prompted
3. Choose your companion from the onboarding screen
4. Hold the mic button (or press **Space**) and start talking

---

## Adding Your Own Character

Panda supports custom VRM models through a built-in creation wizard.

1. Open **Settings → Character → Switch Character**
2. Click **Add Your Own**
3. Select any `.vrm` file from your computer
4. Name your companion and choose their personality
5. Hit **Create** — Panda loads them with the full animation set

Your custom character retains their own name, personality, and profile. Switching back and forth between characters loads each one's settings independently.

---

## Settings Reference

| Tab | Options |
|---|---|
| **Character** | Name, Personality, Switch Character |
| **Voice** | TTS voice selection, LLM model |
| **Appearance** | Theme, character size, background color, wallpaper |
| **Memory** | Enable/disable, view summary, clear |
| **About** | Version info, Groq links, creator |

All settings persist across sessions. Memory is compressed by the LLM into short key:value tokens rather than storing raw chat logs — efficient and private.

---

## Memory System

Panda remembers things you tell her, but not by storing chat logs. After each conversation turn, a background call to a small, fast LLM (`llama-3.1-8b-instant`) compresses the exchange into a compact token string:

```
name:alex|work:coding|music:rap|wake:730|mood:tired
```

This string is re-injected into every system prompt. Yuriko uses it naturally — she doesn't recite it back, she just *knows*.

Memory persists to disk across VS Code restarts. You can view the current summary or clear it entirely from the **Memory** settings tab.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Extension Host | Node.js, TypeScript, VS Code API |
| 3D Rendering | Three.js, @pixiv/three-vrm, @pixiv/three-vrm-animation |
| Speech-to-Text | Groq · Whisper Large v3 Turbo |
| Language Model | Groq · Llama 3.3 70B Versatile (default) |
| Text-to-Speech | Groq · Orpheus v1 English (canopylabs) |
| Audio Capture | node-record-lpcm16, SoX |
| Secrets | VS Code SecretStorage (never stored in plaintext) |
| Memory | LLM-compressed key:value tokens, persisted to globalStorageUri |

---

## Development

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Bundle VRM scene
npm run bundle

# Watch mode
npm run watch
```

Press **F5** in VS Code to launch the Extension Development Host with live reloading.

The extension requires the `sox` binary at runtime for audio capture. All other dependencies are npm packages.

---

## Architecture

```
Extension Host (Node.js)              Webview (HTML/JS)
  src/panel.ts         ←——————————→   media/main.js
  src/groqClient.ts                   media/style.css
  src/audioCapture.ts                 media/vrm-bundle.js
  src/memoryManager.ts                webview/index.html
  src/secretManager.ts
```

All audio I/O lives in the Extension Host. Web Speech API and `getUserMedia` are not available in VS Code webviews — Panda routes everything through the Node.js layer and communicates with the webview via `postMessage`.

---

## Roadmap

- [ ] Multiple concurrent custom character slots
- [ ] More facial expression triggers and idle behaviors
- [ ] Localization support
- [ ] Additional built-in companions (Animal Kingdom Vol. 2+)

---

<div align="center">

<br>

Built by **Venkatesh Annabathina**

[![GitHub](https://img.shields.io/badge/GitHub-venkateshannabathina-181717?style=flat-square&logo=github)](https://github.com/venkateshannabathina)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-venkatesh--annabathina-0A66C2?style=flat-square&logo=linkedin)](https://linkedin.com/in/venkatesh-annabathina)

<br>

*This extension is in active development. More features are on the way.*

<br>

</div>
