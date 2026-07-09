const fs = require('fs');
const path = require('path');

let DatabaseSync = null;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {
  DatabaseSync = null;
}

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function jsonText(value) {
  return JSON.stringify(value || {});
}

function readPayloadRows(db, table, limit = 500) {
  return db.prepare(`SELECT payload_json FROM ${table} ORDER BY created_at DESC, rowid DESC LIMIT ?`).all(limit)
    .map(row => safeJsonParse(row.payload_json, null))
    .filter(Boolean);
}

function runTransaction(db, work) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}

class OperationalStore {
  constructor(options = {}) {
    this.rootDir = options.rootDir || process.cwd();
    this.dbPath = options.dbPath || path.join(this.rootDir, 'mercato-operational.sqlite');
    this.disabled = Object.prototype.hasOwnProperty.call(options, 'disabled')
      ? Boolean(options.disabled)
      : /^(1|true|yes|on)$/i.test(String(process.env.OPERATIONAL_DB_DISABLED || ''));
    this.db = null;
    this.error = '';
  }

  init() {
    if (this.disabled) {
      this.error = 'disabled by OPERATIONAL_DB_DISABLED';
      return false;
    }
    if (!DatabaseSync) {
      this.error = 'node:sqlite is not available in this Node runtime';
      return false;
    }
    try {
      fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
      this.db = new DatabaseSync(this.dbPath);
      this.db.exec('PRAGMA journal_mode = WAL');
      this.db.exec('PRAGMA synchronous = NORMAL');
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS action_events (
          id TEXT PRIMARY KEY,
          action_id TEXT,
          status TEXT,
          source TEXT,
          title TEXT,
          created_at TEXT,
          payload_json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS business_events (
          id TEXT PRIMARY KEY,
          action_id TEXT,
          status TEXT,
          source TEXT,
          title TEXT,
          created_at TEXT,
          payload_json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS business_experiments (
          id TEXT PRIMARY KEY,
          action_id TEXT,
          status TEXT,
          title TEXT,
          created_at TEXT,
          updated_at TEXT,
          payload_json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS business_learnings (
          id TEXT PRIMARY KEY,
          action_id TEXT,
          title TEXT,
          created_at TEXT,
          payload_json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS email_messages (
          id TEXT PRIMARY KEY,
          to_email TEXT,
          status TEXT,
          campaign_id TEXT,
          action_id TEXT,
          segment_id TEXT,
          subject TEXT,
          created_at TEXT,
          updated_at TEXT,
          sent_at TEXT,
          payload_json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS publish_runs (
          id TEXT PRIMARY KEY,
          status TEXT,
          type TEXT,
          mode TEXT,
          url TEXT,
          dry_run INTEGER DEFAULT 0,
          created_at TEXT,
          payload_json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS trust_checks (
          id TEXT PRIMARY KEY,
          url TEXT,
          product_id TEXT,
          status TEXT,
          critical_count INTEGER DEFAULT 0,
          high_count INTEGER DEFAULT 0,
          created_at TEXT,
          payload_json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS growth_leads (
          id TEXT PRIMARY KEY,
          contact_key TEXT UNIQUE,
          email TEXT,
          phone TEXT,
          status TEXT,
          first_coupon TEXT,
          second_coupon TEXT,
          landing_page TEXT,
          created_at TEXT,
          updated_at TEXT,
          payload_json TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_action_events_action_id ON action_events(action_id);
        CREATE INDEX IF NOT EXISTS idx_business_events_action_id ON business_events(action_id);
        CREATE INDEX IF NOT EXISTS idx_email_messages_to_email ON email_messages(to_email);
        CREATE INDEX IF NOT EXISTS idx_publish_runs_created_at ON publish_runs(created_at);
        CREATE INDEX IF NOT EXISTS idx_trust_checks_created_at ON trust_checks(created_at);
        CREATE INDEX IF NOT EXISTS idx_growth_leads_contact_key ON growth_leads(contact_key);
        CREATE INDEX IF NOT EXISTS idx_growth_leads_status ON growth_leads(status);
      `);
      return true;
    } catch (error) {
      this.error = error.message;
      this.db = null;
      return false;
    }
  }

  available() {
    return Boolean(this.db);
  }

  tableCount(table) {
    if (!this.available()) return 0;
    try {
      return Number(this.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count || 0);
    } catch {
      return 0;
    }
  }

  status() {
    const tables = {};
    for (const table of [
      'action_events',
      'business_events',
      'business_experiments',
      'business_learnings',
      'email_messages',
      'publish_runs',
      'trust_checks',
      'growth_leads'
    ]) {
      tables[table] = this.tableCount(table);
    }
    return {
      enabled: !this.disabled,
      available: this.available(),
      path: this.dbPath,
      error: this.error,
      tables
    };
  }

  importFromJson({ actionLog, businessMemory, emailTracking } = {}) {
    if (!this.available()) return;
    if (this.tableCount('action_events') === 0) {
      const entries = Array.isArray(actionLog?.entries) ? actionLog.entries : Array.isArray(actionLog) ? actionLog : [];
      this.writeActionLog(entries);
    }
    if (this.tableCount('business_events') === 0 && this.tableCount('business_experiments') === 0) {
      this.writeBusinessMemory(businessMemory || {});
    }
    if (this.tableCount('email_messages') === 0) {
      const messages = Array.isArray(emailTracking?.messages) ? emailTracking.messages : [];
      this.writeEmailTracking({ messages });
    }
  }

  writeActionLog(entries = []) {
    if (!this.available()) return;
    const rows = Array.isArray(entries) ? entries : [];
    runTransaction(this.db, () => {
      this.db.exec('DELETE FROM action_events');
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO action_events (id, action_id, status, source, title, created_at, payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      rows.slice(0, 500).forEach((entry, index) => {
        const id = entry.id || `action-${index}`;
        stmt.run(
          id,
          entry.actionId || '',
          entry.status || '',
          entry.source || '',
          entry.title || '',
          entry.createdAt || entry.timestamp || '',
          jsonText({ ...entry, id })
        );
      });
    });
  }

  readActionLog() {
    if (!this.available() || this.tableCount('action_events') === 0) return null;
    return { version: 1, entries: readPayloadRows(this.db, 'action_events', 500) };
  }

  writeBusinessMemory(memory = {}) {
    if (!this.available()) return;
    const events = Array.isArray(memory.events) ? memory.events : [];
    const experiments = Array.isArray(memory.experiments) ? memory.experiments : [];
    const learnings = Array.isArray(memory.learnings) ? memory.learnings : [];
    runTransaction(this.db, () => {
      this.db.exec('DELETE FROM business_events');
      this.db.exec('DELETE FROM business_experiments');
      this.db.exec('DELETE FROM business_learnings');
      const eventStmt = this.db.prepare(`
        INSERT OR REPLACE INTO business_events (id, action_id, status, source, title, created_at, payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      events.slice(0, 800).forEach((event, index) => {
        const id = event.id || `business-event-${index}`;
        eventStmt.run(id, event.actionId || '', event.status || '', event.source || '', event.title || '', event.createdAt || '', jsonText({ ...event, id }));
      });
      const experimentStmt = this.db.prepare(`
        INSERT OR REPLACE INTO business_experiments (id, action_id, status, title, created_at, updated_at, payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      experiments.slice(0, 250).forEach((experiment, index) => {
        const id = experiment.id || `experiment-${index}`;
        experimentStmt.run(id, experiment.actionId || '', experiment.status || '', experiment.title || '', experiment.startedAt || experiment.createdAt || '', experiment.lastEventAt || experiment.updatedAt || '', jsonText({ ...experiment, id }));
      });
      const learningStmt = this.db.prepare(`
        INSERT OR REPLACE INTO business_learnings (id, action_id, title, created_at, payload_json)
        VALUES (?, ?, ?, ?, ?)
      `);
      learnings.slice(0, 250).forEach((learning, index) => {
        const id = learning.id || `learning-${index}`;
        learningStmt.run(id, learning.actionId || '', learning.title || '', learning.createdAt || '', jsonText({ ...learning, id }));
      });
    });
  }

  readBusinessMemory() {
    if (!this.available() || (this.tableCount('business_events') === 0 && this.tableCount('business_experiments') === 0)) return null;
    return {
      version: 1,
      events: readPayloadRows(this.db, 'business_events', 800),
      experiments: readPayloadRows(this.db, 'business_experiments', 250),
      learnings: readPayloadRows(this.db, 'business_learnings', 250)
    };
  }

  writeEmailTracking(data = {}) {
    if (!this.available()) return;
    const messages = Array.isArray(data.messages) ? data.messages : [];
    runTransaction(this.db, () => {
      this.db.exec('DELETE FROM email_messages');
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO email_messages
          (id, to_email, status, campaign_id, action_id, segment_id, subject, created_at, updated_at, sent_at, payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      messages.forEach((message, index) => {
        const id = message.id || `email-${index}`;
        stmt.run(
          id,
          message.to || '',
          message.status || '',
          message.campaignId || '',
          message.actionId || '',
          message.segmentId || '',
          message.subject || '',
          message.createdAt || '',
          message.updatedAt || '',
          message.sentAt || '',
          jsonText({ ...message, id })
        );
      });
    });
  }

  readEmailTracking() {
    if (!this.available() || this.tableCount('email_messages') === 0) return null;
    return { messages: readPayloadRows(this.db, 'email_messages', 10000) };
  }

  upsertGrowthLead(lead = {}) {
    if (!this.available()) return null;
    const now = new Date().toISOString();
    const id = lead.id || `growth-lead-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const contactKey = String(lead.contactKey || lead.contact_key || '').trim();
    if (!contactKey) return null;
    const existing = this.db.prepare('SELECT payload_json FROM growth_leads WHERE contact_key = ? LIMIT 1').get(contactKey);
    const current = existing ? safeJsonParse(existing.payload_json, {}) : {};
    const createdAt = lead.createdAt || current.createdAt || now;
    const payload = {
      ...current,
      ...lead,
      id: lead.id || current.id || id,
      contactKey,
      createdAt,
      updatedAt: lead.updatedAt || now
    };
    this.db.prepare(`
      INSERT OR REPLACE INTO growth_leads
        (id, contact_key, email, phone, status, first_coupon, second_coupon, landing_page, created_at, updated_at, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      payload.id,
      contactKey,
      payload.email || '',
      payload.phone || '',
      payload.status || '',
      payload.firstCoupon || payload.first_coupon || '',
      payload.secondCoupon || payload.second_coupon || '',
      payload.landingPage || payload.landing_page || '',
      payload.createdAt,
      payload.updatedAt,
      jsonText(payload)
    );
    return payload;
  }

  readGrowthLeadByContact(contactKey = '') {
    if (!this.available()) return null;
    const key = String(contactKey || '').trim();
    if (!key) return null;
    const row = this.db.prepare('SELECT payload_json FROM growth_leads WHERE contact_key = ? LIMIT 1').get(key);
    return row ? safeJsonParse(row.payload_json, null) : null;
  }

  readGrowthLeads(limit = 500) {
    if (!this.available() || this.tableCount('growth_leads') === 0) return null;
    return {
      leads: readPayloadRows(this.db, 'growth_leads', Math.max(1, Math.min(Number(limit) || 500, 5000)))
    };
  }

  appendPublishRun(run = {}) {
    if (!this.available()) return;
    const now = run.createdAt || new Date().toISOString();
    const id = run.id || `publish-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.db.prepare(`
      INSERT OR REPLACE INTO publish_runs (id, status, type, mode, url, dry_run, created_at, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      run.status || '',
      run.type || '',
      run.mode || '',
      run.url || '',
      run.dryRun ? 1 : 0,
      now,
      jsonText({ ...run, id, createdAt: now })
    );
  }

  appendTrustCheck(check = {}) {
    if (!this.available()) return;
    const now = check.createdAt || new Date().toISOString();
    const id = check.id || `trust-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.db.prepare(`
      INSERT OR REPLACE INTO trust_checks (id, url, product_id, status, critical_count, high_count, created_at, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      check.url || '',
      check.productId || check.product_id || '',
      check.status || '',
      Number(check.criticalCount || 0),
      Number(check.highCount || 0),
      now,
      jsonText({ ...check, id, createdAt: now })
    );
  }

  readTrustChecks(limit = 50) {
    if (!this.available() || this.tableCount('trust_checks') === 0) return [];
    return readPayloadRows(this.db, 'trust_checks', Math.max(1, Math.min(Number(limit) || 50, 500)));
  }

  readPublishRuns(limit = 50) {
    if (!this.available() || this.tableCount('publish_runs') === 0) return [];
    return readPayloadRows(this.db, 'publish_runs', Math.max(1, Math.min(Number(limit) || 50, 500)));
  }
}

module.exports = {
  OperationalStore,
  safeJsonParse
};
