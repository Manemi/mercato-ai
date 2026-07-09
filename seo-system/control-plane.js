const crypto = require('crypto');

const SEO_CONTROL_AGENTS = [
  { id: 'inventory', name: 'Site Inventory Agent', surfaces: ['products', 'categories', 'information', 'seo_urls', 'technical_files'] },
  { id: 'on_page', name: 'On-page Agent', surfaces: ['name', 'meta_title', 'meta_description', 'meta_h1', 'description'] },
  { id: 'schema', name: 'Schema Agent', surfaces: ['Product', 'Offer', 'CollectionPage', 'WebPage', 'Organization', 'WebSite'] },
  { id: 'indexation', name: 'Indexation Agent', surfaces: ['seo_url', 'robots.txt', 'sitemap.xml', 'canonical', 'status'] },
  { id: 'internal_links', name: 'Internal Linking Agent', surfaces: ['category_links', 'information_links', 'template_recommendation_blocks'] },
  { id: 'images', name: 'Image Agent', surfaces: ['image', 'additional_images', 'alt_source', 'dimensions'] },
  { id: 'content', name: 'Content Quality Agent', surfaces: ['description', 'duplication', 'thin_content', 'buyer_value'] },
  { id: 'performance', name: 'Performance Agent', surfaces: ['twig', 'css', 'js', 'image_delivery', 'layout'] },
  { id: 'technical', name: 'Technical SEO Agent', surfaces: ['htaccess', 'theme_templates', 'controllers', 'headers', 'redirects'] },
  { id: 'geo', name: 'GEO Agent', surfaces: ['llms.txt', 'ai_crawlers', 'citation_blocks', 'entity_signals'] },
  { id: 'verifier', name: 'Verifier Agent', surfaces: ['database_readback', 'file_hash', 'live_page', 're_audit', 'rollback'] }
];

const SEO_CHANGE_CAPABILITIES = [
  { id: 'metadata', label: 'Title, meta description, H1', mode: 'bulk_typed_patch', impact: 'Релевантність, CTR і зрозуміла структура сторінки.' },
  { id: 'descriptions', label: 'Описи товарів, категорій і сторінок', mode: 'agent_draft_after_evidence', impact: 'Якість landing page, конверсія й покриття пошукового наміру.' },
  { id: 'internal_links', label: 'Внутрішня перелінковка', mode: 'agent_draft_after_evidence', impact: 'Передача внутрішньої ваги та шлях користувача до товару.' },
  { id: 'seo_urls', label: 'SEO URL і redirects', mode: 'typed_patch_plus_code_review', impact: 'Стабільна індексація, canonical і відсутність битих старих адрес.' },
  { id: 'schema', label: 'Product/Offer, CollectionPage, WebPage', mode: 'managed_schema', impact: 'Узгоджені структуровані дані без вигаданих рейтингів.' },
  { id: 'canonical', label: 'Canonical, robots, sitemap', mode: 'technical_file_patch', impact: 'Керування дублями, crawl budget та індексацією.' },
  { id: 'social_meta', label: 'Open Graph і Twitter cards', mode: 'technical_file_patch', impact: 'Коректні прев’ю посилань і кращий CTR із соцмереж/месенджерів.' },
  { id: 'images', label: 'Alt, dimensions, lazy-load, WebP/AVIF hooks', mode: 'template_or_asset_patch', impact: 'Image SEO, LCP, CLS і мобільна конверсія.' },
  { id: 'cwv', label: 'LCP, INP, CLS у Twig/CSS/JS', mode: 'technical_file_patch', impact: 'Мобільна швидкість і якість взаємодії.' },
  { id: 'headings_breadcrumbs', label: 'Heading hierarchy і breadcrumbs', mode: 'template_patch', impact: 'Структура сторінки, навігація і BreadcrumbList schema.' },
  { id: 'crawl_directives', label: 'Noindex/status/crawler rules', mode: 'typed_or_file_patch', impact: 'Контроль індексованих сторінок і AI crawler accessibility.' },
  { id: 'geo', label: 'llms.txt та citation-ready блоки', mode: 'file_or_content_patch', impact: 'GEO/AI Search після базової технічної готовності.' },
  { id: 'verification', label: 'Readback, re-audit і rollback', mode: 'automatic', impact: 'Підтвердження фактичної зміни та швидке відновлення.' }
];

function oneLine(value = '') {
  return String(value || '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function textLength(value = '') {
  return [...oneLine(value)].length;
}

function trimAtWord(value = '', max = 155) {
  const clean = oneLine(value);
  if ([...clean].length <= max) return clean;
  const chars = [...clean];
  const clipped = chars.slice(0, max + 1).join('');
  const boundary = clipped.lastIndexOf(' ');
  return `${clipped.slice(0, boundary > Math.floor(max * 0.65) ? boundary : max).replace(/[.,:;!?\s]+$/, '')}.`;
}

function slugify(value = '') {
  const map = {
    а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ye', ж: 'zh', з: 'z',
    и: 'y', і: 'i', ї: 'yi', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
    р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
    щ: 'shch', ь: '', ю: 'yu', я: 'ya', ы: 'y', э: 'e', ё: 'yo', ъ: ''
  };
  return [...oneLine(value).toLowerCase()]
    .map(char => map[char] ?? char)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

function actionId(...parts) {
  return `seo-control-${crypto.createHash('sha256').update(parts.map(String).join('|')).digest('hex').slice(0, 18)}`;
}

function sourceFingerprint(entity = {}) {
  return crypto.createHash('sha256').update(JSON.stringify({
    type: entity.type,
    id: entity.id,
    name: entity.name || '',
    meta_title: entity.meta_title || '',
    meta_description: entity.meta_description || '',
    meta_h1: entity.meta_h1 || '',
    descriptionSha1: entity.descriptionSha1 || '',
    seo_keyword: entity.seo_keyword || '',
    status: entity.status ?? null,
    schema_marker: Boolean(entity.schema_marker)
  })).digest('hex');
}

function entityTarget(entity = {}) {
  return entity.url || `${entity.type}:${entity.id}`;
}

function makeProposal(entity, field, after, {
  agent = 'On-page Agent',
  priority = 'important',
  category = 'on_page',
  issue = '',
  impact = '',
  executor = 'entity_patch',
  note = '',
  recommendedAction = ''
} = {}) {
  const before = field === 'schema_type'
    ? Boolean(entity.schema_marker)
    : entity[field] ?? '';
  if (JSON.stringify(before) === JSON.stringify(after)) return null;
  return {
    id: actionId(entity.type, entity.id, field, before, after),
    agent,
    category,
    priority,
    issue,
    impact,
    recommendedAction: recommendedAction || `Змінити ${field} у ${entity.type} #${entity.id} точним typed patch після підтвердження.`,
    execution: 'automatic_after_approval',
    executor,
    entityType: entity.type,
    entityId: entity.id,
    target: entityTarget(entity),
    field,
    before,
    after,
    sourceFingerprint: sourceFingerprint(entity),
    note,
    verification: executor === 'file_patch'
      ? 'Перевірити SHA-1 файла після запису, live HTML і повторний технічний аудит.'
      : 'Прочитати сутність назад з OpenCart, перевірити точне значення й повторити цільовий аудит.'
  };
}

function safeMetaTitle(entity) {
  const name = oneLine(entity.name);
  if (!name) return '';
  const suffix = ' | Mercato';
  return trimAtWord(`${trimAtWord(name, 60 - suffix.length)}${suffix}`, 60);
}

function safeMetaDescription(entity) {
  const current = oneLine(entity.meta_description);
  const description = oneLine(entity.description || entity.descriptionPreview);
  const name = oneLine(entity.name);
  const source = current || description || `Купити ${name} в Mercato з доставкою по Україні.`;
  return trimAtWord(source, 155);
}

function decodeHtmlForSeoScan(html = '') {
  return String(html || '')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&#39;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&');
}

function stripManagedInternalLinks(html = '') {
  return String(html || '')
    .replace(/<!--\s*MERCATO_AI_INTERNAL_LINKS_START\s*-->[\s\S]*?<!--\s*MERCATO_AI_INTERNAL_LINKS_END\s*-->/gi, '')
    .replace(/&lt;!--\s*MERCATO_AI_INTERNAL_LINKS_START\s*--&gt;[\s\S]*?&lt;!--\s*MERCATO_AI_INTERNAL_LINKS_END\s*--&gt;/gi, '')
    .trim();
}

function internalAnchorCount(html = '') {
  const raw = String(html || '');
  const decoded = decodeHtmlForSeoScan(raw);
  const pattern = /<a\b[^>]*href=["'][^"']*(?:mercato\.com\.ua|\/)[^"']*["']/gi;
  const rawCount = (raw.match(pattern) || []).length;
  const decodedCount = (decoded.match(pattern) || []).length;
  return Math.max(rawCount, decodedCount);
}

function entityDescriptionStats(entity = {}) {
  const rawDescription = String(entity.description || '');
  const visibleDescriptionHtml = stripManagedInternalLinks(rawDescription);
  const visibleDescriptionLength = rawDescription
    ? textLength(decodeHtmlForSeoScan(visibleDescriptionHtml))
    : Number(entity.descriptionLength || textLength(entity.descriptionPreview));
  return {
    visibleDescriptionHtml,
    visibleDescriptionLength,
    hasManagedInternalLinks: /MERCATO_AI_INTERNAL_LINKS_START/i.test(rawDescription),
    internalAnchorCount: internalAnchorCount(visibleDescriptionHtml),
    descriptionPreview: oneLine(decodeHtmlForSeoScan(visibleDescriptionHtml || entity.descriptionPreview || '')).slice(0, 220)
  };
}

function scanEntity(entity, duplicateKeywords) {
  const proposals = [];
  const tasks = [];
  const target = entityTarget(entity);
  const titleLength = textLength(entity.meta_title);
  const metaLength = textLength(entity.meta_description);
  const h1 = oneLine(entity.meta_h1);
  const name = oneLine(entity.name);

  if (!entity.meta_title || titleLength > 60) {
    const after = safeMetaTitle(entity);
    const proposal = after && makeProposal(entity, 'meta_title', after, {
      issue: !entity.meta_title ? 'Meta title відсутній.' : `Meta title має ${titleLength} символів.`,
      impact: 'Title link у Google, релевантність і CTR.',
      recommendedAction: 'Сформувати короткий title з реальною назвою сутності й брендом, показати Було/Стане та записати поле meta_title.'
    });
    if (proposal) proposals.push(proposal);
  }

  if (!entity.meta_description || metaLength > 160) {
    const after = safeMetaDescription(entity);
    const proposal = after && makeProposal(entity, 'meta_description', after, {
      issue: !entity.meta_description ? 'Meta description відсутній.' : `Meta description має ${metaLength} символів.`,
      impact: 'Якість snippet і CTR без масового переписування сторінки.',
      recommendedAction: 'Скоротити поточний підтверджений опис до 155 символів без вигаданих фактів і записати meta_description.'
    });
    if (proposal) proposals.push(proposal);
  }

  if (!h1 && name) {
    const proposal = makeProposal(entity, 'meta_h1', trimAtWord(name, 90), {
      issue: 'H1 відсутній.',
      impact: 'Чіткий головний заголовок сторінки.',
      recommendedAction: 'Записати фактичну назву сутності в meta_h1 або керований H1-блок.'
    });
    if (proposal) proposals.push(proposal);
  }

  if (!entity.seo_keyword && name) {
    const keyword = slugify(name);
    const proposal = keyword && makeProposal(entity, 'seo_keyword', keyword, {
      agent: 'Indexation Agent',
      category: 'indexation',
      issue: 'SEO URL відсутній.',
      impact: 'Стабільний зрозумілий URL для індексації та внутрішніх посилань.',
      recommendedAction: 'Створити унікальний транслітерований slug у таблиці seo_url та перевірити routing.'
    });
    if (proposal) proposals.push(proposal);
  } else if (duplicateKeywords.has(entity.seo_keyword)) {
    tasks.push({
      id: actionId(entity.type, entity.id, 'duplicate_keyword'),
      agent: 'Indexation Agent',
      category: 'indexation',
      priority: 'critical',
      issue: `SEO URL дублюється: ${entity.seo_keyword}.`,
      impact: 'Ризик неправильного routing, canonical і втрати індексації.',
      execution: 'manual_review_before_approval',
      entityType: entity.type,
      entityId: entity.id,
      target,
      recommendedAction: 'Вибрати основну URL-адресу, підготувати новий унікальний slug і 301 redirect зі старої.',
      verification: 'Перевірити final URL, 301, canonical, sitemap і GSC URL Inspection.'
    });
  }

  if (entity.type === 'product' && !entity.schema_marker) {
    const proposal = makeProposal(entity, 'schema_type', 'Product', {
      agent: 'Schema Agent',
      category: 'schema',
      issue: 'Product/Offer JSON-LD не підтверджено в керованому блоці.',
      impact: 'Google product data, rich results і узгодженість із Merchant.',
      executor: 'managed_schema',
      recommendedAction: 'Побудувати Product + Offer JSON-LD з поточної картки OpenCart, вставити керований блок і перевірити marker/readback.',
      note: 'Schema будується лише з поточних даних OpenCart. Review/AggregateRating без реальних відгуків не створюються.'
    });
    if (proposal) proposals.push(proposal);
  }
  if (entity.type === 'category' && !entity.schema_marker) {
    const proposal = makeProposal(entity, 'schema_type', 'CollectionPage', {
      agent: 'Schema Agent',
      category: 'schema',
      issue: 'CollectionPage JSON-LD не підтверджено в керованому блоці.',
      impact: 'Чіткий тип категорії, назва, опис і canonical URL для пошукових систем.',
      executor: 'managed_schema',
      recommendedAction: 'Побудувати CollectionPage JSON-LD з поточної категорії, вставити керований блок і перевірити marker/readback.',
      note: 'Schema використовує лише фактичну назву, опис і URL категорії.'
    });
    if (proposal) proposals.push(proposal);
  }
  if (entity.type === 'information' && !entity.schema_marker) {
    const proposal = makeProposal(entity, 'schema_type', 'WebPage', {
      agent: 'Schema Agent',
      category: 'schema',
      issue: 'WebPage JSON-LD не підтверджено в керованому блоці.',
      impact: 'Чітка типізація інформаційної сторінки та її canonical URL.',
      executor: 'managed_schema',
      recommendedAction: 'Побудувати WebPage JSON-LD з поточної сторінки, вставити керований блок і перевірити marker/readback.',
      note: 'Schema не додає вигаданих авторів, рейтингів або FAQ.'
    });
    if (proposal) proposals.push(proposal);
  }

  const descriptionStats = entityDescriptionStats(entity);
  const visibleDescriptionHtml = descriptionStats.visibleDescriptionHtml;
  const descriptionLength = descriptionStats.visibleDescriptionLength;
  const hasManagedInternalLinks = descriptionStats.hasManagedInternalLinks;
  if (descriptionLength < (entity.type === 'product' ? 180 : 250)) {
    tasks.push({
      id: actionId(entity.type, entity.id, hasManagedInternalLinks ? 'broken_internal_links_only' : 'thin_content'),
      agent: 'Content Quality Agent',
      category: 'content',
      priority: hasManagedInternalLinks && descriptionLength < 80 ? 'critical' : 'important',
      issue: hasManagedInternalLinks && descriptionLength < 80
        ? 'Опис зламаний: після видалення керованого блоку внутрішніх посилань немає фактичного тексту товару.'
        : `Видимий опис короткий: ${descriptionLength} символів.`,
      impact: 'Слабка відповідь на намір покупця й низька унікальна цінність сторінки.',
      execution: 'editor_after_evidence',
      entityType: entity.type,
      entityId: entity.id,
      target,
      recommendedAction: hasManagedInternalLinks && descriptionLength < 80
        ? 'Терміново прибрати голий блок внутрішніх посилань і відновити фактичний опис товару з OpenCart-атрибутів або backup.'
        : 'Прочитати факти товару/категорії, запити GSC і конкурентні сторінки; підготувати людський текст без службових SEO-фраз.',
      verification: 'Ручна перевірка фактів, повторний content/page audit і контроль конверсій.'
    });
  }

  if (entity.type !== 'product' && descriptionLength >= 350 && descriptionStats.internalAnchorCount === 0) {
    tasks.push({
      id: actionId(entity.type, entity.id, 'internal_links'),
      agent: 'Internal Linking Agent',
      category: 'internal_links',
      priority: 'important',
      issue: 'У видимому описі немає підтверджених внутрішніх посилань.',
      impact: 'Слабший шлях до категорій/товарів і гірший розподіл внутрішньої ваги.',
      execution: 'editor_after_evidence',
      entityType: entity.type,
      entityId: entity.id,
      target,
      recommendedAction: 'Вибрати 2-3 релевантні цільові сторінки з inventory/GSC і підготувати точний HTML diff.',
      verification: 'Перевірити HTTP 200, природні анкори, відсутність redirect chain і повторний crawl.'
    });
  }

  if (entity.type === 'product' && !entity.image) {
    tasks.push({
      id: actionId(entity.type, entity.id, 'missing_image'),
      agent: 'Image Agent',
      category: 'images',
      priority: 'critical',
      issue: 'У товару немає головного зображення.',
      impact: 'Блокер Merchant, image search і конверсії.',
      execution: 'asset_required',
      entityType: entity.type,
      entityId: entity.id,
      target,
      recommendedAction: 'Підготувати реальне фото товару, завантажити в OpenCart і перевірити доступність для Googlebot.',
      verification: 'HTTP 200 image URL, розмір, формат, live rendering і повторний Merchant/Image scan.'
    });
  }

  return { proposals, tasks };
}

function technicalTasks(files = [], technical = {}) {
  const tasks = [];
  const proposals = [];
  const byName = new Map(files.map(file => [file.path, file]));
  const robots = byName.get('robots.txt');
  const llms = byName.get('llms.txt');
  if (!robots?.exists) {
    tasks.push({
      id: actionId('site_file', 'robots.txt', 'missing'),
      agent: 'Indexation Agent',
      category: 'indexation',
      priority: 'critical',
      issue: 'robots.txt не знайдено.',
      impact: 'Немає контрольованої декларації crawler rules і sitemap location.',
      execution: 'file_editor_after_review',
      target: 'robots.txt',
      recommendedAction: 'Зібрати правила з поточного routing, не блокувати CSS/JS/product/category, додати sitemap URL і показати повний diff.',
      verification: 'Перевірити robots.txt tester, доступ Googlebot до ресурсів і повторний crawl.'
    });
  }
  if (!llms?.exists) {
    tasks.push({
      id: actionId('site_file', 'llms.txt', 'missing'),
      agent: 'GEO Agent',
      category: 'geo',
      priority: 'later',
      issue: 'llms.txt не знайдено.',
      impact: 'Низькопріоритетний допоміжний GEO-сигнал; не замінює crawl/indexation.',
      execution: 'file_editor_after_review',
      target: 'llms.txt',
      recommendedAction: 'Створити короткий файл з основними категоріями, політиками й canonical URL після технічної основи.',
      verification: 'HTTP 200, коректні URL і відсутність конфлікту з robots/canonical.'
    });
  }
  if (technical.bridgeCanWriteCodeFiles) {
    tasks.push({
      id: actionId('technical', 'code_files', 'capability'),
      agent: 'Technical SEO Agent',
      category: 'technical',
      priority: 'important',
      issue: 'Шаблони й SEO-код доступні для контрольованого patch.',
      impact: 'Агент може виправляти canonical, schema placement, headings, lazy-load, layout і CWV у реальному коді.',
      execution: 'capability_only',
      target: 'OpenCart theme/controllers',
      recommendedAction: 'Відкрити конкретний файл з manifest, побудувати unified diff, перевірити syntax і лише потім відправити approval.',
      verification: 'File hash readback, PHP/Twig/JS syntax, live page, mobile screenshot і rollback при регресії.'
    });
  }
  return { proposals, tasks };
}

function buildSeoControlPlan(inventory = {}) {
  const entities = [
    ...(inventory.products || []).map(item => ({ ...item, type: 'product', id: Number(item.id || item.product_id) })),
    ...(inventory.categories || []).map(item => ({ ...item, type: 'category', id: Number(item.id || item.category_id) })),
    ...(inventory.information || []).map(item => ({ ...item, type: 'information', id: Number(item.id || item.information_id) }))
  ].filter(entity => entity.id > 0);
  const keywordCounts = new Map();
  entities.forEach(entity => {
    const keyword = String(entity.seo_keyword || '').trim();
    if (keyword) keywordCounts.set(keyword, (keywordCounts.get(keyword) || 0) + 1);
  });
  const duplicateKeywords = new Set([...keywordCounts.entries()].filter(([, count]) => count > 1).map(([keyword]) => keyword));
  const proposals = [];
  const tasks = [];
  entities.forEach(entity => {
    const result = scanEntity(entity, duplicateKeywords);
    proposals.push(...result.proposals);
    tasks.push(...result.tasks);
  });
  const technical = technicalTasks(inventory.files || [], inventory.technical || {});
  proposals.push(...technical.proposals);
  tasks.push(...technical.tasks);
  const priorityOrder = { critical: 0, important: 1, later: 2 };
  const sort = (left, right) =>
    (priorityOrder[left.priority] ?? 9) - (priorityOrder[right.priority] ?? 9)
    || String(left.target || '').localeCompare(String(right.target || ''));
  proposals.sort(sort);
  tasks.sort(sort);
  return {
    generatedAt: new Date().toISOString(),
    source: {
      bridgeVersion: inventory.bridgeVersion || '',
      fingerprint: inventory.fingerprint || '',
      generatedAt: inventory.generatedAt || ''
    },
    agents: SEO_CONTROL_AGENTS.map(agent => ({
      ...agent,
      readAccess: true,
      writeAccess: agent.id !== 'inventory' ? 'after_approval' : 'read_only'
    })),
    capabilities: SEO_CHANGE_CAPABILITIES,
    inventorySummary: {
      products: inventory.products?.length || 0,
      categories: inventory.categories?.length || 0,
      information: inventory.information?.length || 0,
      files: inventory.files?.length || 0,
      entities: entities.length
    },
    entityIndex: entities.map(entity => {
      const descriptionStats = entityDescriptionStats(entity);
      return {
        type: entity.type,
        id: entity.id,
        url: entity.url || '',
        name: entity.name || '',
        sourceFingerprint: sourceFingerprint(entity),
        descriptionLength: descriptionStats.visibleDescriptionLength,
        visibleDescriptionLength: descriptionStats.visibleDescriptionLength,
        descriptionPreview: descriptionStats.descriptionPreview,
        internalAnchorCount: descriptionStats.internalAnchorCount,
        hasManagedInternalLinks: descriptionStats.hasManagedInternalLinks
      };
    }),
    files: (inventory.files || []).map(file => ({
      path: file.path,
      exists: Boolean(file.exists),
      writable: Boolean(file.writable),
      size: Number(file.size || 0),
      sha1: file.sha1 || '',
      kind: file.kind || '',
      extension: file.extension || ''
    })),
    proposals,
    tasks,
    summary: {
      executable: proposals.length,
      needsEvidenceOrEditor: tasks.length,
      critical: [...proposals, ...tasks].filter(item => item.priority === 'critical').length,
      important: [...proposals, ...tasks].filter(item => item.priority === 'important').length,
      byExecutor: proposals.reduce((acc, item) => {
        acc[item.executor] = (acc[item.executor] || 0) + 1;
        return acc;
      }, {})
    }
  };
}

module.exports = {
  SEO_CONTROL_AGENTS,
  SEO_CHANGE_CAPABILITIES,
  buildSeoControlPlan,
  sourceFingerprint,
  trimAtWord,
  slugify
};
