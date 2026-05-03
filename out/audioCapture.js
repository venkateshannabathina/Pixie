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
exports.AudioCapture = void 0;
const recorder = __importStar(require("node-record-lpcm16"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
class AudioCapture {
    constructor() {
        this.recording = null;
        this.outputPath = '';
    }
    async startRecording() {
        // Inject homebrew paths into the extension host's PATH so 'rec'/'sox' binary is found
        if (!process.env.PATH?.includes('/opt/homebrew/bin')) {
            process.env.PATH = `${process.env.PATH || ''}:/opt/homebrew/bin:/usr/local/bin`;
        }
        this.outputPath = path.join(os.tmpdir(), `pixie_${Date.now()}.wav`);
        const recordOptions = {
            sampleRate: 16000,
            channels: 1,
            audioType: 'wav'
        };
        if (os.platform() === 'win32') {
            recordOptions.recorder = 'sox';
        }
        this.recording = recorder.record(recordOptions);
        const fileStream = fs.createWriteStream(this.outputPath);
        this.recording.stream().pipe(fileStream);
    }
    async stopRecording() {
        if (!this.recording) {
            console.warn('stopRecording called before startRecording');
            return '';
        }
        this.recording.stop();
        this.recording = null;
        // Wait for the file to flush completely to disk
        await new Promise((resolve) => setTimeout(resolve, 300));
        if (fs.existsSync(this.outputPath)) {
            return this.outputPath;
        }
        return '';
    }
    cleanup(filePath) {
        if (filePath && fs.existsSync(filePath)) {
            fs.unlink(filePath, () => { }); // silent cleanup
        }
    }
}
exports.AudioCapture = AudioCapture;
//# sourceMappingURL=audioCapture.js.map