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
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
}
class PixiePanel {
    constructor(_context) {
        this._context = _context;
        this.groqClient = null;
        // Pipeline state — only one flow active at a time.
        // 'idle' | 'chat' | 'codewatch'
        this._pipeline = 'idle';
        this._ttsDoneResolve = null;
        this._busyTimeout = null;
        this._recordingTimeout = null;
        this.recordingStartTime = 0;
        this._codeWatchDebounce = null;
        this._lastReportedErrors = new Set();
        this._lastCodeCommentAt = 0;
        this._codeWatcherStarted = false;
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
        if (!this._codeWatcherStarted) {
            this._codeWatcherStarted = true;
            this._startCodeWatcher();
        }
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
            } else {
                this.postMessage({ type: 'SHOW_SCREEN', screen: 'API_KEY' });
            }
        } catch (e) {
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
                    } catch (e) {
                        this.postMessage({ type: 'UPLOAD_VRM_DONE', success: false, error: e.message });
                    }
                    break;
                }

                case 'CLEAR_API_KEY':
                    await this.secretManager.clearGroqKey();
                    this.groqClient = null;
                    this._pipeline = 'idle';
                    this.postMessage({ type: 'SHOW_SCREEN', screen: 'API_KEY' });
                    break;

                case 'SEND_TEXT': {
                    if (this._pipeline !== 'idle') return;
                    const text = (msg.text ?? '').trim();
                    if (!text) return;
                    this.postMessage({ type: 'USER_SAID', text });
                    this.postMessage({ type: 'SET_STATE', state: 'processing' });
                    await this._runChat(text);
                    break;
                }

                case 'START_LISTENING':
                    if (this._pipeline !== 'idle') return;
                    this._pipeline = 'chat';
                    this.recordingStartTime = Date.now();
                    try {
                        await this.audioCapture.startRecording();
                        this.postMessage({ type: 'SET_STATE', state: 'listening' });
                        this._recordingTimeout = setTimeout(() => {
                            if (this._pipeline === 'chat') this.handleMessage({ type: 'STOP_LISTENING' });
                        }, 30000);
                    } catch (e) {
                        this._pipeline = 'idle';
                        const m2 = e.message || '';
                        const hint = m2.includes('sox') || m2.includes('rec') || m2.includes('ENOENT')
                            ? 'sox not found — run: brew install sox'
                            : 'Mic error: ' + m2;
                        this.postMessage({ type: 'SHOW_ERROR', message: hint });
                    }
                    break;

                case 'STOP_LISTENING': {
                    clearTimeout(this._recordingTimeout);
                    if (Date.now() - this.recordingStartTime < 600) {
                        this.audioCapture.stopRecording().catch(() => {});
                        this._pipeline = 'idle';
                        this.postMessage({ type: 'SET_STATE', state: 'idle' });
                        break;
                    }
                    this.postMessage({ type: 'SET_STATE', state: 'processing' });
                    const audioPath = await this.audioCapture.stopRecording();
                    if (!audioPath) {
                        this._pipeline = 'idle';
                        this.postMessage({ type: 'SET_STATE', state: 'idle' });
                        break;
                    }
                    await this._transcribeAndRun(audioPath);
                    break;
                }

                // Webview signals audio playback finished — resolve the pending TTS promise.
                case 'TTS_DONE':
                    clearTimeout(this._busyTimeout);
                    if (this._ttsDoneResolve) {
                        const resolve = this._ttsDoneResolve;
                        this._ttsDoneResolve = null;
                        resolve();
                    }
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
                    if (this.groqClient) {
                        this.groqClient.setMemory('');
                        this.groqClient.clearHistory();
                        this.memoryManager.save('', []);
                    }
                    break;

                case 'RESET_ALL':
                    await this.secretManager.clearGroqKey();
                    this.memoryManager.clear();
                    this.groqClient = null;
                    this._pipeline = 'idle';
                    this.postMessage({ type: 'SHOW_SCREEN', screen: 'API_KEY' });
                    break;
            }
        } catch (err) {
            this._failPipeline(err.message || 'An unexpected error occurred');
        }
    }

    // ─── SHARED TTS ───────────────────────────────────────────────────────────────
    // Single TTS path for all flows. Sends PLAY_AUDIO then awaits TTS_DONE from
    // the webview (or a 60s safety timeout). Caller owns pipeline state.
    async _runTTS(text) {
        const audioBuffer = await this.groqClient.synthesizeSpeech(text);
        await new Promise(resolve => {
            this._ttsDoneResolve = resolve;
            this._busyTimeout = setTimeout(() => {
                this._ttsDoneResolve = null;
                resolve();
            }, 60000);
            this.postMessage({ type: 'PLAY_AUDIO', audioBase64: audioBuffer.toString('base64'), mimeType: 'audio/wav' });
        });
    }

    // ─── CHAT FLOW ────────────────────────────────────────────────────────────────
    // Owns pipeline = 'chat'. try/finally guarantees reset to idle regardless of errors.
    async _runChat(text) {
        if (!this.groqClient) return;
        this._pipeline = 'chat';
        try {
            const codeContext = this._getEditorContext();
            const gen = this.groqClient.streamLLMResponse(text, codeContext);
            let buf = '';
            for await (const chunk of gen) {
                buf += chunk;
                const words = buf.split(' ');
                words.slice(0, -1).filter(w => w.trim()).forEach(w =>
                    this.postMessage({ type: 'LLM_WORD_CHUNK', word: w })
                );
                buf = words[words.length - 1];
            }
            if (buf.trim()) this.postMessage({ type: 'LLM_WORD_CHUNK', word: buf });
            this.postMessage({ type: 'LLM_DONE' });

            this.memoryManager.save(this.groqClient.memory, this.groqClient.conversationHistory);
            this.groqClient.autoCompress((s, h) => {
                this.memoryManager.save(s, h);
                this.postMessage({ type: 'MEMORY_UPDATED', summary: s });
            });

            const fullText = this.groqClient.getLastResponse();
            if (fullText.trim()) {
                this.postMessage({ type: 'SET_STATE', state: 'speaking' });
                this.postMessage({ type: 'PIXIE_SAID', text: fullText, emotion: this.groqClient.getLastEmotion() });
                await this._runTTS(fullText);
            }
        } catch (e) {
            if (e.message?.includes('429')) {
                this.postMessage({ type: 'SHOW_ERROR', message: 'Rate limit hit, wait a moment.' });
            } else if (e.message === 'TTS_TERMS_NOT_ACCEPTED') {
                this.postMessage({ type: 'SHOW_ERROR', message: 'Accept Orpheus TTS terms at console.groq.com first.' });
            } else {
                this.postMessage({ type: 'ERROR', message: e.message || 'Something went wrong.' });
            }
        } finally {
            this._pipeline = 'idle';
            this.postMessage({ type: 'SET_STATE', state: 'idle' });
        }
    }

    // ─── CODE WATCHER FLOW ────────────────────────────────────────────────────────
    // Owns pipeline = 'codewatch'. try/finally guarantees reset to idle.
    async _runCodeComment(errorMsg, snippet) {
        if (this._pipeline !== 'idle' || !this.groqClient) return;
        this._pipeline = 'codewatch';
        this._lastCodeCommentAt = Date.now();
        this.postMessage({ type: 'SET_STATE', state: 'speaking' });
        try {
            const comment = await this.groqClient.getCodeComment(errorMsg, snippet);
            if (!comment.trim()) return;
            const { text: cleanComment, emotion } = this.groqClient.parseEmotionTag(comment);
            this.postMessage({ type: 'PIXIE_SAID', text: cleanComment, emotion });
            await this._runTTS(cleanComment);
        } catch (e) {
            if (e.message === 'TTS_TERMS_NOT_ACCEPTED') {
                this.postMessage({ type: 'SHOW_ERROR', message: 'Accept Orpheus TTS terms at console.groq.com first.' });
            }
            // Rate limits / transient errors: stay silent, she'll try on next new error
        } finally {
            this._pipeline = 'idle';
            this.postMessage({ type: 'SET_STATE', state: 'idle' });
        }
    }

    // ─── VOICE RECORDING ─────────────────────────────────────────────────────────
    async _transcribeAndRun(audioPath) {
        const cleanup = () => { try { if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath); } catch {} };
        try {
            if (!this.groqClient) throw new Error('Client not initialized');
            if (!fs.existsSync(audioPath) || fs.statSync(audioPath).size < 1000) {
                cleanup();
                this._pipeline = 'idle';
                this.postMessage({ type: 'SET_STATE', state: 'idle' });
                return;
            }
            const transcript = await this.groqClient.transcribeAudio(audioPath);
            cleanup();
            if (!transcript?.trim()) {
                this._pipeline = 'idle';
                this.postMessage({ type: 'SET_STATE', state: 'idle' });
                return;
            }
            this.postMessage({ type: 'USER_SAID', text: transcript });
            await this._runChat(transcript); // _runChat owns pipeline reset via finally
        } catch (e) {
            cleanup();
            this._pipeline = 'idle';
            this.postMessage({ type: 'SET_STATE', state: 'idle' });
            this.postMessage({ type: 'SHOW_ERROR', message: e.message || 'Audio processing failed' });
        }
    }

    // ─── CODE WATCHER ────────────────────────────────────────────────────────────
    _startCodeWatcher() {
        const scheduleCheck = (doc) => {
            if (this._pipeline !== 'idle' || !this.groqClient) return;
            clearTimeout(this._codeWatchDebounce);
            this._codeWatchDebounce = setTimeout(() => this._checkCodeErrors(doc), 1500);
        };
        // Primary: language server reports a diagnostic change
        this._context.subscriptions.push(
            vscode.languages.onDidChangeDiagnostics(event => {
                const editor = vscode.window.activeTextEditor;
                if (!editor) return;
                if (event.uris.some(u => u.fsPath === editor.document.uri.fsPath))
                    scheduleCheck(editor.document);
            })
        );
        // Fallback: for LSPs (e.g. Pylance) that don't reliably fire onDidChangeDiagnostics.
        // Longer debounce lets the LSP finish before we read diagnostics.
        this._context.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument(event => {
                const editor = vscode.window.activeTextEditor;
                if (!editor || editor.document.uri.fsPath !== event.document.uri.fsPath) return;
                if (this._pipeline !== 'idle' || !this.groqClient) return;
                clearTimeout(this._codeWatchDebounce);
                this._codeWatchDebounce = setTimeout(() => this._checkCodeErrors(editor.document), 3000);
            })
        );
    }

    async _checkCodeErrors(document, isRetry = false) {
        if (this._pipeline !== 'idle' || !this.groqClient) {
            console.log('[Pixie] code check skipped — pipeline:', this._pipeline, 'client:', !!this.groqClient);
            return;
        }
        const cooldownLeft = 30000 - (Date.now() - this._lastCodeCommentAt);
        if (cooldownLeft > 0) {
            console.log('[Pixie] code check skipped — cooldown', Math.ceil(cooldownLeft / 1000) + 's left');
            return;
        }

        const diagnostics = vscode.languages.getDiagnostics(document.uri);
        const errors = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error);
        console.log('[Pixie] check', document.fileName, '— total diags:', diagnostics.length, 'errors:', errors.length, 'retry:', isRetry);

        // Remove errors that have been resolved so they can re-trigger if they come back
        const currentMessages = new Set(errors.map(e => e.message));
        for (const msg of this._lastReportedErrors) {
            if (!currentMessages.has(msg)) this._lastReportedErrors.delete(msg);
        }

        if (!errors.length) {
            // LSP may still be analyzing — retry once after 3s before giving up
            if (!isRetry) setTimeout(() => this._checkCodeErrors(document, true), 3000);
            return;
        }

        const newErrors = errors.filter(e => !this._lastReportedErrors.has(e.message));
        if (!newErrors.length) return;

        const error = newErrors[0];
        this._lastReportedErrors.add(error.message);

        const line = error.range.start.line;
        const snippetLines = [];
        for (let i = Math.max(0, line - 2); i <= Math.min(document.lineCount - 1, line + 2); i++) {
            snippetLines.push(`${i === line ? '>>>' : '   '} ${document.lineAt(i).text}`);
        }
        await this._runCodeComment(error.message, snippetLines.join('\n'));
    }

    // ─── UTILITIES ───────────────────────────────────────────────────────────────
    _getEditorContext() {
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return null;
            const doc = editor.document;
            if (doc.lineCount === 0) return null;
            const sel = editor.selection;
            const fileName = path.basename(doc.fileName);
            const lang = doc.languageId;
            let code, label;
            if (!sel.isEmpty) {
                code = doc.getText(sel);
                label = `${fileName} — selected lines ${sel.start.line + 1}–${sel.end.line + 1}`;
            } else {
                const cursor = sel.active.line;
                const start = Math.max(0, cursor - 60);
                const end = Math.min(doc.lineCount - 1, cursor + 60);
                code = doc.getText(new vscode.Range(start, 0, end, doc.lineAt(end).text.length));
                label = `${fileName} — lines ${start + 1}–${end + 1}, cursor at line ${cursor + 1}`;
            }
            if (code.length > 8000) code = code.slice(0, 8000) + '\n... (truncated)';
            return { label, lang, code };
        } catch {
            return null;
        }
    }

    _failPipeline(message) {
        this._pipeline = 'idle';
        this.postMessage({ type: 'ERROR', message });
        this.postMessage({ type: 'SET_STATE', state: 'error' });
    }

    async initializeClient(key) {
        try {
            this.groqClient = new groqClient_1.GroqClient(key);
            await this.groqClient.initialize();
            const saved = this.memoryManager.load();
            if (saved.compressed) this.groqClient.setMemory(saved.compressed);
            if (saved.recentHistory.length) this.groqClient.conversationHistory = saved.recentHistory;
            this.postMessage({ type: 'SHOW_SCREEN', screen: 'VOICE_UI' });
        } catch (e) {
            await this.secretManager.clearGroqKey();
            this.postMessage({ type: 'SHOW_ERROR', message: 'Connection failed. Check your API key. ' + e.message });
        }
    }

    async showLoadingScreen() {
        this.postMessage({ type: 'SHOW_SCREEN', screen: 'LOADING' });
    }

    dispose() {
        this.audioCapture.stopRecording().catch(() => {});
    }

    // ─── VRM ASSETS ──────────────────────────────────────────────────────────────
    downloadFile(url, destPath) {
        return new Promise((resolve, reject) => {
            const follow = (location) => {
                const mod = location.startsWith('https') ? https : http;
                mod.get(location, (res) => {
                    if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        res.resume(); follow(res.headers.location); return;
                    }
                    if (res.statusCode !== 200) {
                        res.resume(); reject(new Error(`HTTP ${res.statusCode} downloading ${location}`)); return;
                    }
                    const out = fs.createWriteStream(destPath);
                    res.pipe(out);
                    out.on('finish', () => { out.close(); resolve(); });
                    out.on('error', (err) => { try { fs.unlinkSync(destPath); } catch {} reject(err); });
                    res.on('error', (err) => { try { fs.unlinkSync(destPath); } catch {} reject(err); });
                }).on('error', reject);
            };
            follow(url);
        });
    }

    async sendVrmUri(companion) {
        if (!this._view) return;
        const ASSETS_BASE = 'https://github.com/venkateshannabathina/project-panda/releases/download/v0';
        const cacheDir = this._context.globalStorageUri.fsPath;
        let vrmName;
        if (companion === 'custom') {
            const customPath = path.join(cacheDir, 'custom.vrm');
            vrmName = fs.existsSync(customPath) ? 'custom.vrm' : 'female.vrm';
        } else if (companion === 'male') {
            vrmName = 'male.vrm';
        } else {
            vrmName = 'female.vrm';
        }
        const animNames = ['showfullbody.vrma', 'greeting.vrma', 'spin.vrma', 'peacesign.vrma', 'shoot.vrma', 'VRMA_06.vrma', 'VRMA_07.vrma'];
        const assetsToCheck = vrmName === 'custom.vrm' ? animNames : [vrmName, ...animNames];
        for (const name of assetsToCheck) {
            const dest = path.join(cacheDir, name);
            if (!fs.existsSync(dest)) await this.downloadFile(`${ASSETS_BASE}/${name}`, dest);
        }
        const toUri = (name) => this._view.webview.asWebviewUri(vscode.Uri.joinPath(this._context.globalStorageUri, name)).toString();
        const animations = {
            intro: toUri('showfullbody.vrma'), greeting: toUri('greeting.vrma'),
            spin: toUri('spin.vrma'), peacesign: toUri('peacesign.vrma'),
            shoot: toUri('shoot.vrma'), vrma06: toUri('VRMA_06.vrma'), vrma07: toUri('VRMA_07.vrma'),
        };
        this.postMessage({ type: 'LOAD_VRM', vrmUri: toUri(vrmName), vrmaUri: animations.intro, animations });
    }

    _updateHtml() {
        if (!this._view) return;
        const webview = this._view.webview;
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'style.css'));
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'main.js'));
        const vrmBundleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'vrm-bundle.js'));
        const creatorUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'creator.png'));
        const backgroundUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'background.png'));
        const htmlPath = vscode.Uri.joinPath(this._context.extensionUri, 'webview', 'index.html');
        let html = fs.readFileSync(htmlPath.fsPath, 'utf8');
        const nonce = getNonce();
        html = html
            .replace(/\{\{styleUri\}\}/g, styleUri.toString())
            .replace(/\{\{scriptUri\}\}/g, scriptUri.toString())
            .replace(/\{\{vrmBundleUri\}\}/g, vrmBundleUri.toString())
            .replace(/\{\{creatorUri\}\}/g, creatorUri.toString())
            .replace(/\{\{backgroundUri\}\}/g, backgroundUri.toString())
            .replace(/\{\{cspSource\}\}/g, webview.cspSource)
            .replace(/\{\{nonce\}\}/g, nonce);
        this._view.webview.html = html;
    }
}
exports.PixiePanel = PixiePanel;
PixiePanel.viewType = 'pixie.view';
//# sourceMappingURL=panel.js.map
