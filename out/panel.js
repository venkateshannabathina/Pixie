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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PixiePanel = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const https = __importStar(require("https"));
const http = __importStar(require("http"));
const secretManager_1 = require("./secretManager");
const groqClient_1 = require("./groqClient");
const audioCapture_1 = require("./audioCapture");
const memoryManager_1 = require("./memoryManager");
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
class PixiePanel {
    constructor(_context) {
        this._context = _context;
        this.groqClient = null;
        this.isBusy = false;
        this.recordingStartTime = 0;
        this._turnCount = 0;
        this.secretManager = new secretManager_1.SecretManager(_context.secrets);
        this.audioCapture = new audioCapture_1.AudioCapture();
        fs.mkdirSync(_context.globalStorageUri.fsPath, { recursive: true });
        this.memoryManager = new memoryManager_1.MemoryManager(_context.globalStorageUri.fsPath);
    }
    resolveWebviewView(webviewView, _context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._context.extensionUri, 'media'),
                vscode.Uri.joinPath(this._context.extensionUri, 'webview'),
                this._context.globalStorageUri,
            ]
        };
        this._updateHtml();
        webviewView.webview.onDidReceiveMessage(async (msg) => this.handleMessage(msg));
    }
    postMessage(msg) {
        this._view?.webview.postMessage(msg);
    }
    async checkInitialKey() {
        try {
            const key = await this.secretManager.getGroqKey();
            if (key) {
                await this.showLoadingScreen();
                await this.initializeClient(key);
            }
            else {
                this.postMessage({ type: 'SHOW_SCREEN', screen: 'API_KEY' });
            }
        }
        catch (e) {
            this.postMessage({ type: 'SHOW_ERROR', message: e.message || 'Initialization error' });
        }
    }
    async handleMessage(msg) {
        try {
            switch (msg.type) {
                case 'START_CLICKED':
                    this.postMessage({ type: 'SHOW_SCREEN', screen: 'API_KEY' });
                    break;
                case 'SAVE_API_KEY':
                    await this.secretManager.saveGroqKey(msg.key);
                    await this.showLoadingScreen();
                    await this.initializeClient(msg.key);
                    break;
                case 'WEBVIEW_READY':
                    await this.checkInitialKey();
                    break;
                case 'REQUEST_VRM':
                    await this.sendVrmUri(msg.companion);
                    break;
                case 'UPLOAD_VRM': {
                    try {
                        const buffer = Buffer.from(msg.data, 'base64');
                        const dest = path.join(this._context.globalStorageUri.fsPath, 'custom.vrm');
                        fs.writeFileSync(dest, buffer);
                        this.postMessage({ type: 'UPLOAD_VRM_DONE', success: true });
                    }
                    catch (e) {
                        this.postMessage({ type: 'UPLOAD_VRM_DONE', success: false, error: e.message });
                    }
                    break;
                }
                case 'CLEAR_API_KEY':
                    await this.secretManager.clearGroqKey();
                    this.groqClient = null;
                    this.isBusy = false;
                    this.postMessage({ type: 'SHOW_SCREEN', screen: 'API_KEY' });
                    break;
                case 'SEND_TEXT': {
                    if (this.isBusy)
                        return;
                    const text = (msg.text ?? '').trim();
                    if (!text)
                        return;
                    this.isBusy = true;
                    this.postMessage({ type: 'USER_SAID', text });
                    this.postMessage({ type: 'SET_STATE', state: 'processing' });
                    await this.handleUserTranscript(text);
                    break;
                }
                case 'START_LISTENING':
                    if (this.isBusy)
                        return;
                    this.isBusy = true;
                    this.recordingStartTime = Date.now();
                    try {
                        await this.audioCapture.startRecording();
                        this.postMessage({ type: 'SET_STATE', state: 'listening' });
                        // Auto-stop after 30s — prevents sox running forever if keyup is missed
                        this._recordingTimeout = setTimeout(() => {
                            if (this.isBusy) {
                                this.handleMessage({ type: 'STOP_LISTENING' });
                            }
                        }, 30000);
                    }
                    catch (e) {
                        this.isBusy = false;
                        const msg2 = e.message || '';
                        const hint = msg2.includes('sox') || msg2.includes('rec') || msg2.includes('ENOENT')
                            ? 'sox not found — run: brew install sox'
                            : 'Mic error: ' + msg2;
                        this.postMessage({ type: 'SHOW_ERROR', message: hint });
                    }
                    break;
                case 'STOP_LISTENING': {
                    clearTimeout(this._recordingTimeout);
                    const recordingMs = Date.now() - this.recordingStartTime;
                    if (recordingMs < 600) {
                        this.audioCapture.stopRecording().catch(() => {});
                        this.postMessage({ type: 'SET_STATE', state: 'idle' });
                        this.isBusy = false;
                        break;
                    }
                    this.postMessage({ type: 'SET_STATE', state: 'processing' });
                    const audioPath = await this.audioCapture.stopRecording();
                    if (!audioPath) {
                        this.postMessage({ type: 'SET_STATE', state: 'idle' });
                        this.isBusy = false;
                        break;
                    }
                    await this.processAudio(audioPath);
                    break;
                }
                case 'TTS_DONE':
                    clearTimeout(this._busyTimeout);
                    this.isBusy = false;
                    this.postMessage({ type: 'SET_STATE', state: 'idle' });
                    break;
                case 'UPDATE_SETTINGS':
                    if (this.groqClient) {
                        this.groqClient.updateSettings({
                            voiceName: msg.voiceName,
                            model: msg.model,
                            companionName: msg.companionName,
                            personality: msg.personality,
                        });
                    }
                    break;
                case 'CLEAR_MEMORY':
                    this.memoryManager.clear();
                    if (this.groqClient)
                        this.groqClient.setMemory('');
                    break;
                case 'RESET_ALL':
                    await this.secretManager.clearGroqKey();
                    this.memoryManager.clear();
                    this.groqClient = null;
                    this.isBusy = false;
                    this.postMessage({ type: 'SHOW_SCREEN', screen: 'API_KEY' });
                    break;
            }
        }
        catch (err) {
            this.handleError(err.message || 'An unexpected error occurred');
        }
    }
    // Download a single file from a URL (follows redirects) to a local path.
    downloadFile(url, destPath) {
        return new Promise((resolve, reject) => {
            const follow = (location) => {
                const mod = location.startsWith('https') ? https : http;
                mod.get(location, (res) => {
                    if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        res.resume();
                        follow(res.headers.location);
                        return;
                    }
                    if (res.statusCode !== 200) {
                        res.resume();
                        reject(new Error(`HTTP ${res.statusCode} downloading ${location}`));
                        return;
                    }
                    const out = fs.createWriteStream(destPath);
                    res.pipe(out);
                    out.on('finish', () => { out.close(); resolve(); });
                    out.on('error', (err) => { try {
                        fs.unlinkSync(destPath);
                    }
                    catch { } reject(err); });
                    res.on('error', (err) => { try {
                        fs.unlinkSync(destPath);
                    }
                    catch { } reject(err); });
                }).on('error', reject);
            };
            follow(url);
        });
    }
    // Downloads all VRM/VRMA assets from HuggingFace into globalStorageUri (cached).
    // On repeat launches the cached files are served directly — no re-download.
    async sendVrmUri(companion) {
        if (!this._view)
            return;
        const ASSETS_BASE = 'https://github.com/venkateshannabathina/project-panda/releases/download/v0';
        const cacheDir = this._context.globalStorageUri.fsPath;
        // Resolve which VRM file to use
        let vrmName;
        if (companion === 'custom') {
            const customPath = path.join(cacheDir, 'custom.vrm');
            vrmName = fs.existsSync(customPath) ? 'custom.vrm' : 'female.vrm';
        }
        else if (companion === 'male') {
            vrmName = 'male.vrm';
        }
        else {
            vrmName = 'female.vrm';
        }
        const animNames = [
            'showfullbody.vrma',
            'greeting.vrma',
            'spin.vrma',
            'peacesign.vrma',
            'shoot.vrma',
            'VRMA_06.vrma',
            'VRMA_07.vrma',
        ];
        // Download any standard assets that aren't already cached (custom.vrm is already saved)
        const assetsToCheck = vrmName === 'custom.vrm' ? animNames : [vrmName, ...animNames];
        for (const name of assetsToCheck) {
            const dest = path.join(cacheDir, name);
            if (!fs.existsSync(dest)) {
                await this.downloadFile(`${ASSETS_BASE}/${name}`, dest);
            }
        }
        const toUri = (name) => this._view.webview.asWebviewUri(vscode.Uri.joinPath(this._context.globalStorageUri, name)).toString();
        const animations = {
            intro: toUri('showfullbody.vrma'),
            greeting: toUri('greeting.vrma'),
            spin: toUri('spin.vrma'),
            peacesign: toUri('peacesign.vrma'),
            shoot: toUri('shoot.vrma'),
            vrma06: toUri('VRMA_06.vrma'),
            vrma07: toUri('VRMA_07.vrma'),
        };
        this.postMessage({ type: 'LOAD_VRM', vrmUri: toUri(vrmName), vrmaUri: animations.intro, animations });
    }
    async processAudio(audioPath) {
        const cleanup = () => { try { if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath); } catch {} };
        try {
            if (!this.groqClient)
                throw new Error('Groq client not initialized.');
            if (!fs.existsSync(audioPath)) {
                this.postMessage({ type: 'SET_STATE', state: 'idle' });
                this.isBusy = false;
                return;
            }
            const stats = fs.statSync(audioPath);
            if (stats.size < 1000) {
                cleanup();
                this.postMessage({ type: 'SET_STATE', state: 'idle' });
                this.isBusy = false;
                return;
            }
            const transcript = await this.groqClient.transcribeAudio(audioPath);
            cleanup();
            if (!transcript || transcript.trim().length === 0) {
                this.postMessage({ type: 'SET_STATE', state: 'idle' });
                this.isBusy = false;
                return;
            }
            // Show what the user said in chat
            this.postMessage({ type: 'USER_SAID', text: transcript });
            await this.handleUserTranscript(transcript);
        }
        catch (e) {
            cleanup();
            this.postMessage({ type: 'SET_STATE', state: 'idle' });
            this.isBusy = false;
            throw e;
        }
    }
    async initializeClient(key) {
        try {
            this.groqClient = new groqClient_1.GroqClient(key);
            await this.groqClient.initialize();
            // Load persisted memory into the client
            const savedMemory = this.memoryManager.load();
            if (savedMemory)
                this.groqClient.setMemory(savedMemory);
            this.postMessage({ type: 'SHOW_SCREEN', screen: 'VOICE_UI' });
        }
        catch (e) {
            await this.secretManager.clearGroqKey();
            this.postMessage({ type: 'SHOW_ERROR', message: 'Connection failed. Check your API key. ' + e.message });
            this.isBusy = false;
        }
    }
    async showLoadingScreen() {
        this.postMessage({ type: 'SHOW_SCREEN', screen: 'LOADING' });
    }
    async handleUserTranscript(text) {
        if (!this.groqClient)
            return;
        try {
            const generator = this.groqClient.streamLLMResponse(text);
            let wordBuffer = '';
            for await (const chunk of generator) {
                wordBuffer += chunk;
                const words = wordBuffer.split(' ');
                if (words.length > 1) {
                    for (let i = 0; i < words.length - 1; i++) {
                        if (words[i].trim()) {
                            this.postMessage({ type: 'LLM_WORD_CHUNK', word: words[i] });
                        }
                    }
                    wordBuffer = words[words.length - 1];
                }
            }
            if (wordBuffer.trim()) {
                this.postMessage({ type: 'LLM_WORD_CHUNK', word: wordBuffer });
            }
            this.postMessage({ type: 'LLM_DONE' });
            // Compress memory every 5 turns to avoid hammering the API on every message
            this._turnCount++;
            if (this._turnCount % 5 === 0) {
                const reply = this.groqClient.getLastResponse();
                this.groqClient.compressMemory(text, reply).then(compressed => {
                    this.memoryManager.save(compressed);
                    this.groqClient.setMemory(compressed);
                    this.postMessage({ type: 'MEMORY_UPDATED', summary: compressed });
                }).catch(() => { });
            }
            await this.handleTTS();
        }
        catch (e) {
            if (e.message?.includes('429')) {
                this.handleError('Rate limit hit, please wait a moment.');
            }
            else {
                throw e;
            }
        }
    }
    async handleTTS() {
        if (!this.groqClient)
            return;
        this.postMessage({ type: 'SET_STATE', state: 'speaking' });
        try {
            const fullText = this.groqClient.getLastResponse();
            if (!fullText.trim()) {
                this.postMessage({ type: 'SET_STATE', state: 'idle' });
                this.isBusy = false;
                return;
            }
            // Send full Yuriko reply to display in chat (clean text + detected emotion)
            const emotion = this.groqClient.getLastEmotion();
            this.postMessage({ type: 'YURIKO_SAID', text: fullText, emotion });
            const audioBuffer = await this.groqClient.synthesizeSpeech(fullText);
            const audioBase64 = audioBuffer.toString('base64');
            this.postMessage({ type: 'PLAY_AUDIO', audioBase64, mimeType: 'audio/wav' });
            // Safety: if TTS_DONE never arrives (audio decode fail, webview crash), unlock after 60s
            this._busyTimeout = setTimeout(() => {
                if (this.isBusy) {
                    this.isBusy = false;
                    this.postMessage({ type: 'SET_STATE', state: 'idle' });
                }
            }, 60000);
        }
        catch (e) {
            if (e.message === 'TTS_TERMS_NOT_ACCEPTED') {
                this.handleError('Accept Orpheus terms at https://console.groq.com/playground?model=canopylabs%2Forpheus-v1-english first.');
            }
            else {
                throw e;
            }
        }
    }
    handleError(message) {
        this.postMessage({ type: 'ERROR', message });
        this.postMessage({ type: 'SET_STATE', state: 'error' });
        this.isBusy = false;
    }
    dispose() {
        this.audioCapture.stopRecording().catch(() => {});
    }
    _updateHtml() {
        if (!this._view)
            return;
        const webview = this._view.webview;
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'style.css'));
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'main.js'));
        const vrmBundleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'vrm-bundle.js'));
        const creatorUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'creator.png'));
        const backgroundUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'background.png'));
        const htmlPath = vscode.Uri.joinPath(this._context.extensionUri, 'webview', 'index.html');
        let html = fs.readFileSync(htmlPath.fsPath, 'utf8');
        const nonce = getNonce();
        const cspSource = webview.cspSource;
        html = html
            .replace(/\{\{styleUri\}\}/g, styleUri.toString())
            .replace(/\{\{scriptUri\}\}/g, scriptUri.toString())
            .replace(/\{\{vrmBundleUri\}\}/g, vrmBundleUri.toString())
            .replace(/\{\{creatorUri\}\}/g, creatorUri.toString())
            .replace(/\{\{backgroundUri\}\}/g, backgroundUri.toString())
            .replace(/\{\{cspSource\}\}/g, cspSource)
            .replace(/\{\{nonce\}\}/g, nonce);
        this._view.webview.html = html;
    }
}
exports.PixiePanel = PixiePanel;
PixiePanel.viewType = 'pixie.view';
//# sourceMappingURL=panel.js.map