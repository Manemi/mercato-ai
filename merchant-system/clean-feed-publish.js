#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const cheerio = require('cheerio');

const ROOT_DIR = path.resolve(__dirname, '..');
const PROJECT_DIR = path.resolve(ROOT_DIR, '..');
const DEFAULT_OUT_DIR = path.join(__dirname, 'clean-feed');
const DEFAULT_CANDIDATE = path.join(DEFAULT_OUT_DIR, 'mercato-clean-google-candidate.xml');
const DEFAULT_SUMMARY = path.join(DEFAULT_OUT_DIR, 'summary.json');
const DEFAULT_REPORT = path.join(DEFAULT_OUT_DIR, 'publish-report.json');

function argValue(name, fallback = '') {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  return process.argv[index + 1] || fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function compactText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

function ensureFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size < 1024) {
    throw new Error(`${label} looks invalid: ${filePath} (${stat.size} bytes)`);
  }
  return stat;
}

function parseFeed(xml) {
  const $ = cheerio.load(xml, { xmlMode: true });
  const entries = $('entry').toArray().map(element => {
    const get = selector => compactText($(element).find(selector).first().text());
    return {
      id: get('g\\:id'),
      title: get('g\\:title'),
      description: get('g\\:description'),
      link: get('g\\:link'),
      image: get('g\\:image_link'),
      availability: get('g\\:availability'),
      price: get('g\\:price'),
      brand: get('g\\:brand'),
      condition: get('g\\:condition'),
      category: get('g\\:google_product_category'),
      weight: get('g\\:shipping_weight')
    };
  });
  const duplicateValues = values => {
    const seen = new Set();
    const duplicates = new Set();
    values.forEach(value => {
      if (!value) return;
      if (seen.has(value)) duplicates.add(value);
      seen.add(value);
    });
    return [...duplicates];
  };
  const blockingIssues = [];
  const addIssue = (code, entry, extra = {}) => {
    blockingIssues.push({
      code,
      id: entry?.id || '',
      title: entry?.title || '',
      link: entry?.link || '',
      ...extra
    });
  };
  duplicateValues(entries.map(entry => entry.id)).forEach(id => {
    addIssue('duplicate_id', entries.find(entry => entry.id === id), { id });
  });
  duplicateValues(entries.map(entry => entry.link)).forEach(link => {
    addIssue('duplicate_link', entries.find(entry => entry.link === link), { link });
  });
  entries.forEach(entry => {
    if (!entry.id) addIssue('missing_id', entry);
    if (!entry.title) addIssue('missing_title', entry);
    if (!entry.description) addIssue('missing_description', entry);
    if (!entry.link || !/^https:\/\/mercato\.com\.ua\//iu.test(entry.link)) addIssue('invalid_link', entry);
    if (!entry.image || !/^https?:\/\//iu.test(entry.image)) addIssue('invalid_image', entry);
    if (!['in_stock', 'out_of_stock', 'preorder', 'backorder'].includes(entry.availability)) {
      addIssue('invalid_availability', entry, { availability: entry.availability });
    }
    if (!/^\d+\.\d{2} UAH$/u.test(entry.price)) addIssue('invalid_price', entry, { price: entry.price });
    if (entry.brand !== 'Mercato') addIssue('invalid_brand', entry, { brand: entry.brand });
    if (entry.condition !== 'new') addIssue('invalid_condition', entry, { condition: entry.condition });
    if (!entry.category) addIssue('missing_google_product_category', entry);
    if (!entry.weight) addIssue('missing_shipping_weight', entry);
    if (/(Купить|купить|черный|чёрный|зеленый|зелёный|молотый|зерновой|органическая|органический|кофе\b|кофейный|магазин|доставка|вкус и аромат|неповторимый вкус|настоящий вкус|русск|российск)/iu.test(`${entry.title} ${entry.description}`)) {
      addIssue('hard_ru_text_in_feed', entry);
    }
  });
  return {
    entries,
    blockingIssues
  };
}

function readSummary(summaryPath) {
  if (!fs.existsSync(summaryPath)) return null;
  return JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
}

function runGenerator() {
  const generatorPath = path.join(__dirname, 'clean-feed-generator.js');
  const args = [generatorPath, '--skip-current', '--strict'];
  const result = spawnSync(process.execPath, args, {
    cwd: PROJECT_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`clean-feed-generator failed with exit code ${result.status}`);
  }
}

function pruneBackups(backupDir, keep) {
  if (!Number.isFinite(keep) || keep <= 0 || !fs.existsSync(backupDir)) return [];
  const files = fs.readdirSync(backupDir)
    .filter(name => /^mercato-clean-google-\d{8}T\d{6}Z\.xml$/u.test(name))
    .map(name => ({
      name,
      path: path.join(backupDir, name),
      mtimeMs: fs.statSync(path.join(backupDir, name)).mtimeMs
    }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
  const deleted = [];
  files.slice(keep).forEach(file => {
    fs.unlinkSync(file.path);
    deleted.push(file.name);
  });
  return deleted;
}

function atomicPublish({ candidatePath, publicFile, backupDir, keepBackups }) {
  const publicDir = path.dirname(publicFile);
  if (!fs.existsSync(publicDir)) {
    throw new Error(`Public directory does not exist: ${publicDir}`);
  }
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = timestamp();
  const tempFile = path.join(publicDir, `.mercato-clean-google.${process.pid}.${stamp}.tmp`);
  let backupFile = '';
  fs.copyFileSync(candidatePath, tempFile);
  if (fs.existsSync(publicFile)) {
    backupFile = path.join(backupDir, `mercato-clean-google-${stamp}.xml`);
    fs.copyFileSync(publicFile, backupFile);
  }
  fs.renameSync(tempFile, publicFile);
  const prunedBackups = pruneBackups(backupDir, keepBackups);
  return {
    backupFile,
    prunedBackups
  };
}

function main() {
  const dryRun = hasArg('--dry-run');
  const skipGenerate = hasArg('--skip-generate');
  const candidatePath = path.resolve(argValue('--candidate', DEFAULT_CANDIDATE));
  const summaryPath = path.resolve(argValue('--summary', DEFAULT_SUMMARY));
  const reportPath = path.resolve(argValue('--report', DEFAULT_REPORT));
  const publicFileArg = argValue('--public-file', process.env.FEED_PUBLIC_FILE || '');
  const publicFile = publicFileArg ? path.resolve(publicFileArg) : '';
  const backupDir = path.resolve(argValue('--backup-dir', publicFile ? path.join(path.dirname(publicFile), 'feed-backups') : path.join(DEFAULT_OUT_DIR, 'feed-backups')));
  const keepBackups = Number(argValue('--keep-backups', process.env.FEED_KEEP_BACKUPS || '20'));

  if (!skipGenerate) runGenerator();
  const candidateStat = ensureFile(candidatePath, 'Candidate feed');
  const summary = readSummary(summaryPath);
  if (
    summary?.cleanFeed
    && Object.prototype.hasOwnProperty.call(summary.cleanFeed, 'productionReady')
    && summary.cleanFeed.productionReady !== true
  ) {
    throw new Error(`Summary is not production ready: ${summary.cleanFeed.blockingIssueCount || 'unknown'} blocking issue(s)`);
  }
  const xml = fs.readFileSync(candidatePath, 'utf8');
  const parsed = parseFeed(xml);
  if (!parsed.entries.length) throw new Error('Candidate feed has no entries');
  if (parsed.blockingIssues.length) {
    throw new Error(`Candidate feed has ${parsed.blockingIssues.length} blocking issue(s): ${JSON.stringify(parsed.blockingIssues.slice(0, 5))}`);
  }
  if (!dryRun && !publicFile) {
    throw new Error('Missing --public-file or FEED_PUBLIC_FILE for live publish');
  }

  const candidateHash = sha256File(candidatePath);
  const publish = dryRun
    ? { backupFile: '', prunedBackups: [] }
    : atomicPublish({ candidatePath, publicFile, backupDir, keepBackups });
  const report = {
    ok: true,
    dryRun,
    generatedAt: summary?.generatedAt || '',
    publishedAt: dryRun ? '' : new Date().toISOString(),
    candidatePath,
    publicFile: publicFile || '',
    backupFile: publish.backupFile,
    candidate: {
      bytes: candidateStat.size,
      sha256: candidateHash,
      entries: parsed.entries.length,
      uniqueIds: new Set(parsed.entries.map(entry => entry.id)).size,
      uniqueLinks: new Set(parsed.entries.map(entry => entry.link)).size
    },
    source: summary?.source || null,
    cleanFeed: summary?.cleanFeed || null,
    prunedBackups: publish.prunedBackups
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
