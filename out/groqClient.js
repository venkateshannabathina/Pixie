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
    // Compress one conversation turn into the running memory string.
    // Fires a small, fast LLM call — result is saved by the caller.
    async compressMemory(userMsg, pixieReply) {
        const existing = this.memory || 'none';
        const result = await this.client.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages: [
                {
                    role: 'system',
                    content: `You compress conversation facts about a user into ultra-short memory tokens.
Format rules:
- Use key:value pairs separated by | (pipe)
- Shorten names (Venkatesh → venky), times (9:30 → 930), activities to 2-4 chars
- Merge new facts with existing memory — do NOT duplicate keys, update values if changed
- Keep total output under 120 characters
- Output ONLY the compressed memory string, nothing else

Examples:
Input existing: "none"
Input chat: user said "I woke up at 9:30, went to school"
Output: name:venky|wake:930|school:daily

Input existing: "name:venky|wake:930|school:daily"
Input chat: user said "I love rap music and got home at 5pm"
Output: name:venky|wake:930|school:daily|home:5pm|music:rap`
                },
                {
                    role: 'user',
                    content: `Existing memory: ${existing}\nNew conversation:\nUser: ${userMsg}\nPixie: ${pixieReply}\n\nOutput compressed memory:`
                }
            ],
            stream: false,
            max_tokens: 80
        });
        return (result.choices[0]?.message?.content || existing).trim();
    }
    async *streamLLMResponse(userText) {
        this.lastFullResponse = '';
        const memoryLine = this.memory ? `\nMEMORY ABOUT USER (use naturally, never recite verbatim): ${this.memory}` : '';
        const systemPrompt = this.buildSystemPrompt(memoryLine);
        // Keep last 20 messages (10 exchanges) to avoid bloating the context
        if (this.conversationHistory.length > 20) {
            this.conversationHistory = this.conversationHistory.slice(-20);
        }
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
        // Append this exchange to history so future turns have context
        this.conversationHistory.push({ role: 'user', content: userText });
        this.conversationHistory.push({ role: 'assistant', content: this.lastFullResponse });
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