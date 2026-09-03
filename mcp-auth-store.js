const fs = require('node:fs');
const path = require('node:path');
const { createHmac, timingSafeEqual, randomBytes } = require('node:crypto');

// Single process/replica store. Raw access/refresh tokens are never persisted.
class FileTokenStore {
  constructor(directory, integrityKey) {
    if (!path.isAbsolute(directory) || directory === path.parse(directory).root ||
        path.basename(directory) !== 'mcp-auth' || typeof integrityKey !== 'string' || integrityKey.length < 43) {
      throw new Error('Invalid MCP store configuration');
    }
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (fs.realpathSync(directory) !== directory || !fs.lstatSync(directory).isDirectory()) {
      throw new Error('MCP store must be a real directory');
    }
    fs.chmodSync(directory, 0o700);
    this.file = path.join(directory, 'tokens.json');
    this.key = integrityKey;
    this.state = { version: 1, tokens: {} };
    this.revision = null;
    this.reload();
  }
  reload() {
    if (!fs.existsSync(this.file) && this.revision !== null) throw new Error('MCP store disappeared');
    if (fs.existsSync(this.file)) {
      const stat = fs.lstatSync(this.file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4 * 1024 * 1024) throw new Error('Invalid MCP store');
      const envelope = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      const mac = this.mac(envelope.payload);
      if (typeof envelope.mac !== 'string' || envelope.mac.length !== mac.length ||
          !timingSafeEqual(Buffer.from(mac), Buffer.from(envelope.mac))) throw new Error('MCP store integrity failed');
      const state = JSON.parse(envelope.payload);
      if (state.version !== 1 || !state.tokens || typeof state.tokens !== 'object' || Array.isArray(state.tokens)) {
        throw new Error('Invalid MCP store');
      }
      this.state = state;
      this.revision = envelope.mac;
      fs.chmodSync(this.file, 0o600);
    }
  }
  mac(payload) { return createHmac('sha256', this.key).update(payload).digest('hex'); }
  snapshot() { this.reload(); return structuredClone(this.state); }
  save(state) {
    const expectedRevision = this.revision;
    const lock = `${this.file}.lock`;
    const lockFd = fs.openSync(lock, 'wx', 0o600);
    try {
      this.reload();
      if (this.revision !== expectedRevision) throw new Error('MCP store conflict; retry with a fresh snapshot');
      this.persist(state);
    } finally {
      fs.closeSync(lockFd);
      fs.unlinkSync(lock);
    }
  }
  persist(state) {
    const payload = JSON.stringify(state);
    if (Buffer.byteLength(payload) > 3 * 1024 * 1024) throw new Error('MCP store capacity reached');
    const temporary = `${this.file}.${randomBytes(8).toString('hex')}.tmp`;
    const fd = fs.openSync(temporary, 'wx', 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify({ payload, mac: this.mac(payload) }));
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    fs.renameSync(temporary, this.file);
    const directory = fs.openSync(path.dirname(this.file), 'r');
    try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
    this.state = structuredClone(state);
    this.revision = this.mac(payload);
  }
}

module.exports = { FileTokenStore };
