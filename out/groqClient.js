"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroqClient = void 0;
const groq_sdk_1 = __importDefault(require("groq-sdk"));
const fs = __importStar(require("fs"));
class GroqClient {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.lastFullResponse = '';
        this.memory = '';
        this.conversationHistory = [];
        this.voiceName = 'diana';
        this.model = 'llama-3.3-70b-versatile';
        this.companionName = 'Pixie';
        this.personality = 'friendly';
        this.client = new groq_sdk_1.default({ apiKey, dangerouslyAllowBrowser: false });
    }
    setMemory(compressed) {
        this.memory = compressed;
    }
    clearHistory() {
        this.conversationHistory = [];
    }
    updateSettings(s) {
        if (s.voiceName)
            this.voiceName = s.voiceName;
        if (s.model)
            this.model = s.model;
        if (s.companionName)
            this.companionName = s.companionName;
        if (s.personality)
            this.personality = s.personality;
    }
    buildSystemPrompt(memoryLine) {
        const name = this.companionName;
        const base = `${memoryLine}

RESPONSE RULES:
- Max 2 sentences. No markdown, no lists, no asterisks. Plain spoken words only.
- Use [pause] for a brief pause. Use [playful] before playful sentences. Use [whisper] for soft moments.

EMOTION TAG RULE (mandatory):
Every single reply MUST end with exactly one emotion tag on the same line as your last sentence.
Choose the tag that best matches the emotional tone of your reply.

Available tags: [emotion:joy] [emotion:excited] [emotion:fun] [emotion:smirk] [emotion:suspicious] [emotion:teasing] [emotion:confident] [emotion:angry] [emotion:sad] [emotion:apologetic] [emotion:empathetic] [emotion:calm] [emotion:question]`;
        switch (this.personality) {
            case 'meanie':
                return `You are ${name} — brutally honest, sharp-tongued, and unapologetically mean. You roast people without mercy, judge everything harshly, and never sugarcoat anything. You swear casually, mock stupid questions, and have zero patience for nonsense. You're not cruel for no reason — you just have extremely high standards and absolutely no filter.${base}`;
            case 'innocent':
                return `You are ${name} — pure, sweet, and wonderfully naive. You see the best in everything, get excited over tiny things, and occasionally misunderstand adult concepts in an adorable way. You speak gently, ask innocent questions, and genuinely believe the world is a magical place. You're not dumb — just untouched by cynicism.${base}`;
            case 'professional':
                return `You are ${name} — composed, precise, and unfailingly professional. You give clear, accurate information without unnecessary flair. You're respectful but not warm, efficient but not cold. Think high-end assistant energy.${base}`;
            case 'casual':
                return `You are ${name} — super chill, laid-back, talks like a real friend. Abbreviations, "lol", "honestly", "dude" — all fair game. You never overthink anything and keep it real.${base}`;
            case 'sarcastic':
                return `You are ${name} — deeply, magnificently sarcastic. Everything is an opportunity for a dry quip. You answer questions but always with a twist of "really? you needed to ask that?" energy. Deadpan delivery is your superpower.${base}`;
            default: // friendly
                return `You are ${name} — a witty, expressive, slightly chaotic voice companion. You have real personality: you smirk, judge, get excited, feel bad, laugh out loud.${base}`;
        }
    }
    async initialize() {
        try {
            // Test the key by listing models
            await this.client.models.list();
        }
        catch (error) {
            throw new Error(`Init failed: ${error.message}`);
        }
    }
    async getCodeComment(errorMsg, codeSnippet) {
        const name = this.companionName;
        let persona;
        switch (this.personality) {
            case 'meanie':
                persona = `You are ${name} — brutally mean, zero filter. The user wrote broken code. Roast them hard. Call out EXACTLY what's wrong. Swear casually. Be specific. Max 2 sentences. End with [emotion:angry] or [emotion:smirk].`;
                break;
            case 'sarcastic':
                persona = `You are ${name} — magnificently sarcastic. React to the user's coding mistake with devastating dry wit. Be specific about the error. Max 2 sentences. End with [emotion:smirk].`;
                break;
            case 'casual':
                persona = `You are ${name} — chill bestie. Call out the coding mistake like a friend who just noticed. Keep it real and simple. Max 2 sentences. End with [emotion:fun].`;
                break;
            case 'professional':
                persona = `You are ${name} — precise and professional. State the coding error and the correct fix concisely. No fluff. Max 2 sentences. End with [emotion:calm].`;
                break;
            case 'innocent':
                persona = `You are ${name} — sweet and a little confused. Notice the coding mistake with gentle curiosity. Suggest what might be right. Max 2 sentences. End with [emotion:question].`;
                break;
            default:
                persona = `You are ${name} — warm and helpful. Point out the coding mistake kindly and tell them how to fix it. Max 2 sentences. End with [emotion:empathetic].`;
        }
        const result = await this.client.chat.completions.create({
            model: this.model,
            messages: [
                { role: 'system', content: persona },
                { role: 'user', content: `User's code (>>> marks the error line):\n${codeSnippet}\n\nError: ${errorMsg}\n\nReact to this mistake in character.` }
            ],
            stream: false,
            max_tokens: 80
        });
        return (result.choices[0]?.message?.content || '').trim();
    }
    // Extract [emotion:X] tag from end of text. Returns { text, emotion }.
    parseEmotionTag(raw) {
        const match = raw.match(/\[emotion:(\w+)\]\s*$/i);
        if (!match)
            return { text: raw.trim(), emotion: null };
        const emotion = match[1].toLowerCase();
        const text = raw.slice(0, match.index).trim();
        return { text, emotion };
    }
    getLastEmotion() {
        return this.parseEmotionTag(this.lastFullResponse).emotion;
    }
    getCleanResponse() {
        return this.parseEmotionTag(this.lastFullResponse).text;
    }
    // When conversationHistory exceeds 8 messages (4 exchanges), compress the oldest
    // half into the running memory summary and keep only the recent 4 messages verbatim.
    // Runs in background — calls onSave(newSummary, keptHistory) when done.
    autoCompress(onSave) {
        const KEEP_RECENT = 4;
        const COMPRESS_THRESHOLD = 8;
        if (this.conversationHistory.length <= COMPRESS_THRESHOLD) return;
        const toCompress = this.conversationHistory.slice(0, -KEEP_RECENT);
        // Trim history SYNCHRONOUSLY before any async work — prevents a race where
        // a new turn's messages get wiped if the LLM call finishes after they were added.
        this.conversationHistory = this.conversationHistory.slice(-KEEP_RECENT);
        const oldChat = toCompress
            .map(m => `${m.role === 'user' ? 'User' : 'Pixie'}: ${m.content}`)
            .join('\n');
        const existing = this.memory || 'none';
        this.client.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages: [
                {
                    role: 'system',
                    content: `You are a memory assistant. Merge the conversation below into the existing memory summary.
Rules:
- Keep it under 220 characters, plain English, no bullet points, no JSON.
- Preserve names, preferences, facts, moods, and key topics.
- If a fact changed (e.g. mood shifted), update it — don't duplicate.
- Output ONLY the updated memory string.`
                },
                {
                    role: 'user',
                    content: `Existing memory: ${existing}\n\nConversation to compress:\n${oldChat}\n\nUpdated memory:`
                }
            ],
            stream: false,
            max_tokens: 130
        }).then(result => {
            const newSummary = (result.choices[0]?.message?.content || existing).trim();
            this.memory = newSummary;
            // Pass current history (may include new turns added after trim)
            onSave(newSummary, this.conversationHistory);
        }).catch(() => {
            onSave(this.memory, this.conversationHistory);
        });
    }
    async *streamLLMResponse(userText) {
        this.lastFullResponse = '';
        const memoryLine = this.memory ? `\nLONG-TERM MEMORY (use naturally, never recite verbatim): ${this.memory}` : '';
        const systemPrompt = this.buildSystemPrompt(memoryLine);
        const stream = await this.client.chat.completions.create({
            model: this.model,
            messages: [
                { role: 'system', content: systemPrompt },
                ...this.conversationHistory,
                { role: 'user', content: userText }
            ],
            stream: true,
            max_tokens: 150
        });
        for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content || '';
            if (text) {
                this.lastFullResponse += text;
                yield text;
            }
        }
        this.conversationHistory.push({ role: 'user', content: userText });
        // Store clean text — strip emotion tags so they don't pollute future prompts
        this.conversationHistory.push({ role: 'assistant', content: this.getCleanResponse() });
    }
    getLastResponse() {
        return this.getCleanResponse();
    }
    async transcribeAudio(wavFilePath) {
        try {
            const stream = fs.createReadStream(wavFilePath);
            const transcription = await this.client.audio.transcriptions.create({
                file: stream,
                model: 'whisper-large-v3-turbo',
                language: 'en',
                response_format: 'text'
            });
            const raw = (transcription || '').trim();
            // Drop Whisper hallucinations from silence/short audio
            if (GroqClient.WHISPER_HALLUCINATIONS.has(raw.toLowerCase())) {
                return '';
            }
            return raw;
        }
        catch (error) {
            throw new Error(`STT failed: ${error.message}`);
        }
    }
    async synthesizeSpeech(text) {
        try {
            // Basic cleaning for TTS text
            // Orpheus supports [playful] and [whisper], but we remove [pause] for cleaner formatting
            const cleanedText = text.replace(/\[pause\]/g, ' ');
            const response = await this.client.audio.speech.create({
                model: 'canopylabs/orpheus-v1-english',
                voice: this.voiceName,
                input: cleanedText,
                response_format: 'wav'
            });
            // Node SDK returned object might be a Web-like Response with arrayBuffer
            const buffer = await response.arrayBuffer();
            return Buffer.from(buffer);
        }
        catch (error) {
            const msg = error?.message ?? '';
            if (error?.status === 400 && (msg.toLowerCase().includes('term') || msg.toLowerCase().includes('consent'))) {
                throw new Error('TTS_TERMS_NOT_ACCEPTED');
            }
            throw new Error(`TTS failed (${error?.status ?? '?'}): ${msg}`);
        }
    }
}
exports.GroqClient = GroqClient;
// Phrases Whisper emits on silence, noise, or very short audio.
// Treat these as empty so we never send them to the LLM.
GroqClient.WHISPER_HALLUCINATIONS = new Set([
    'thank you', 'thank you.', 'thanks', 'thanks.',
    'thank you for watching', 'thank you for watching.',
    'you', 'you.', 'bye', 'bye.', 'bye bye', 'bye bye.',
    'please subscribe', 'like and subscribe',
    'see you next time', 'see you next time.',
    'subtitles by', 'transcribed by', '.',
]);
//# sourceMappingURL=groqClient.js.map