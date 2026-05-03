"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecretManager = void 0;
class SecretManager {
    constructor(secrets) {
        this.secrets = secrets;
    }
    async saveGroqKey(key) {
        await this.secrets.store('pixie.groqKey', key);
    }
    async getGroqKey() {
        return this.secrets.get('pixie.groqKey');
    }
    async clearGroqKey() {
        await this.secrets.delete('pixie.groqKey');
    }
}
exports.SecretManager = SecretManager;
//# sourceMappingURL=secretManager.js.map