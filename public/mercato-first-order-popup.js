(function () {
  'use strict';

  var script = document.currentScript || (function () {
    var scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();
  var dataset = script ? script.dataset || {} : {};
  var globalConfig = window.MercatoFirstOrderPopup || {};
  var scriptOrigin = '';
  try {
    scriptOrigin = script && script.src ? new URL(script.src, window.location.href).origin : '';
  } catch (_) {}

  var config = {
    apiBase: String(dataset.apiBase || globalConfig.apiBase || scriptOrigin || window.location.origin).replace(/\/+$/, ''),
    cssHref: dataset.cssHref || globalConfig.cssHref || (scriptOrigin ? scriptOrigin + '/mercato-first-order-popup.css' : '/mercato-first-order-popup.css'),
    force: dataset.force === '1' || globalConfig.force === true,
    customerId: dataset.customerId || globalConfig.customerId || '',
    loggedIn: dataset.loggedIn === '1' || globalConfig.loggedIn === true,
    purchase: globalConfig.purchase || window.MercatoGrowthPurchase || null
  };

  var DEFAULT_CLOSE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
  var DEFAULT_SCROLL_REASON = 'scroll_40';
  var defaultCampaign = {
    enabled: false,
    campaignId: 'first_order_discount',
    cooldownDays: 7,
    first: {
      prefix: 'F10',
      discount: 10,
      minTotal: 600,
      validDays: 3
    },
    triggers: {
      timeMinSeconds: 10,
      timeMaxSeconds: 15,
      scrollPercent: 40,
      exitIntentDesktop: true
    },
    text: {
      title: '-10% на перше замовлення',
      subtitle: 'Введіть свій телефон — отримаєте персональний промокод.',
      emailPlaceholder: 'Email (необовʼязково)',
      phonePlaceholder: '0637299268',
      consent: 'Погоджуюсь отримати персональний промокод та повідомлення від Mercato',
      submit: 'Отримати промокод',
      loading: 'Створюємо код...',
      successTitle: 'Дякуємо!',
      successIntro: 'Ваш промокод на перше замовлення:',
      successNote: 'Знижка -10% від 600 грн, дійсний 3 дні',
      copyButton: 'Скопіювати код',
      copiedButton: 'Скопійовано',
      legal: 'Промокод персональний, одноразовий і не сумується з іншими акціями, накопичувальними знижками, HoReCa, оптом або корпоративними умовами. Телефон у замовленні має збігатися з телефоном, введеним у попапі.',
      contactError: 'Введіть телефон у форматі +380XXXXXXXXX або 0XXXXXXXXX.',
      consentError: 'Потрібна згода на отримання промокоду та повідомлень.',
      requestError: 'Сервер довго відповідає. Спробуйте ще раз за кілька секунд.'
    },
    exclusions: {
      pages: ['checkout', 'payment', 'success', 'account', 'horeca', 'ho-re-ca', 'opt', 'optom', 'corporate', 'korporatyv']
    }
  };
  var campaign = mergeCampaign(defaultCampaign, globalConfig.campaign || globalConfig || {});

  var keys = {
    seenAt: 'mrc_first_popup_seen_at',
    dismissedUntil: 'mrc_first_popup_dismissed_until',
    submitted: 'mrc_first_popup_submitted',
    code: 'mrc_first_popup_code',
    session: 'mrc_first_popup_session',
    shownSession: 'mrc_first_popup_shown_session',
    beginCheckout: 'mrc_begin_checkout_sent',
    purchase: 'mrc_purchase_sent'
  };
  var opened = false;
  var submitted = false;
  var triggerTimers = [];
  var overlay = null;

  function storage(type) {
    try {
      var store = type === 'session' ? window.sessionStorage : window.localStorage;
      var probe = '__mrc_probe__';
      store.setItem(probe, '1');
      store.removeItem(probe);
      return store;
    } catch (_) {
      return null;
    }
  }

  var local = storage('local');
  var session = storage('session');

  function now() {
    return Date.now();
  }

  function number(value, fallback) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function plain(value, fallback) {
    var clean = String(value || '').trim();
    return clean || fallback || '';
  }

  function mergeCampaign(base, next) {
    var source = next && typeof next === 'object' ? next : {};
    var merged = {
      enabled: typeof source.enabled === 'boolean' ? source.enabled : base.enabled,
      campaignId: plain(source.campaignId, base.campaignId),
      cooldownDays: number(source.cooldownDays, base.cooldownDays),
      first: Object.assign({}, base.first, source.first || {}),
      triggers: Object.assign({}, base.triggers, source.triggers || {}),
      text: Object.assign({}, base.text, source.text || {}),
      exclusions: Object.assign({}, base.exclusions, source.exclusions || {})
    };
    if (typeof dataset.enabled !== 'undefined') merged.enabled = dataset.enabled === '1';
    if (typeof globalConfig.enabled === 'boolean') merged.enabled = globalConfig.enabled;
    return merged;
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }

  function getQueryParams() {
    var out = {};
    var params = new URLSearchParams(window.location.search || '');
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid'].forEach(function (key) {
      out[key] = params.get(key) || '';
    });
    return out;
  }

  function dataLayerPush(eventName, payload) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(Object.assign({ event: eventName }, payload || {}));
  }

  function pathMatchesExtraExclusion(path) {
    var pages = Array.isArray(campaign.exclusions && campaign.exclusions.pages) ? campaign.exclusions.pages : [];
    return pages.some(function (item) {
      var clean = String(item || '').trim().toLowerCase();
      if (!clean) return false;
      if (clean.length <= 3) {
        var safe = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp('(^|/)' + safe + '(/|$)').test(path);
      }
      return path.indexOf(clean) !== -1;
    });
  }

  function isExcludedPage() {
    var path = decodeURIComponent(window.location.pathname || '').toLowerCase();
    return /\/(checkout|payment|success|account)(\/|$)/i.test(path)
      || /(horeca|ho-re-ca|хорека)/i.test(path)
      || /(\/opt(\/|$)|optom|опт|corporate|korporatyv|корпоратив)/i.test(path)
      || pathMatchesExtraExclusion(path);
  }

  function looksLoggedIn() {
    if (config.loggedIn || String(config.customerId || '').trim()) return true;
    if (document.body && /\blogged-?in\b|\bcustomer-logged\b/i.test(document.body.className || '')) return true;
    if (document.querySelector('a[href*="account/logout"], a[href*="route=account/logout"], .account-logout')) return true;
    return false;
  }

  function isNewVisitor() {
    if (!local || !session) return true;
    var seenAt = Number(local.getItem(keys.seenAt) || 0);
    if (!seenAt) {
      local.setItem(keys.seenAt, String(now()));
      session.setItem(keys.session, '1');
      return true;
    }
    if (session.getItem(keys.session) === '1') return true;
    return now() - seenAt < 24 * 60 * 60 * 1000;
  }

  function dismissedActive() {
    if (!local) return false;
    return Number(local.getItem(keys.dismissedUntil) || 0) > now();
  }

  function alreadySubmitted() {
    return Boolean(local && (local.getItem(keys.submitted) === '1' || local.getItem(keys.code)));
  }

  function alreadyShownThisSession() {
    return Boolean(session && session.getItem(keys.shownSession) === '1');
  }

  function eligible() {
    if (config.force) return true;
    if (!campaign.enabled) return false;
    if (isExcludedPage()) return false;
    if (looksLoggedIn()) return false;
    if (dismissedActive()) return false;
    if (alreadySubmitted()) return false;
    if (alreadyShownThisSession()) return false;
    return isNewVisitor();
  }

  function loadCss() {
    if (!config.cssHref || document.querySelector('link[data-mrc-popup-css]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = config.cssHref;
    link.setAttribute('data-mrc-popup-css', '1');
    document.head.appendChild(link);
  }

  function ensureCriticalCss() {
    if (document.getElementById('mrc-popup-critical-css')) return;
    var style = document.createElement('style');
    style.id = 'mrc-popup-critical-css';
    style.textContent = [
      '.mrc-pop-overlay{position:fixed;inset:0;z-index:99998;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;background:rgba(20,16,12,.55);opacity:0;pointer-events:none;transition:opacity .25s ease;}',
      '.mrc-pop-overlay.is-open{opacity:1;pointer-events:auto;}',
      '.mrc-pop-dialog{position:relative;width:100%;max-width:420px;max-height:calc(100vh - 40px);overflow:auto;box-sizing:border-box;background:#fff;color:#2b1d10;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;}',
      '.mrc-pop-close{position:absolute;top:10px;right:14px;}',
      '.mrc-pop-hp{position:absolute!important;left:-9999px!important;width:1px!important;height:1px!important;opacity:0!important;}'
    ].join('');
    document.head.appendChild(style);
  }

  function successNote(data) {
    var discount = number(data && data.discount, campaign.first.discount);
    var minTotal = number(data && data.minTotal, campaign.first.minTotal);
    var expiresAt = data && data.expiresAt ? String(data.expiresAt).slice(0, 10) : '';
    if (expiresAt) return 'Знижка -' + discount + '% від ' + minTotal + ' грн, дійсний до ' + expiresAt;
    return campaign.text.successNote || ('Знижка -' + discount + '% від ' + minTotal + ' грн, дійсний ' + number(campaign.first.validDays, 3) + ' дні');
  }

  function renderPopup() {
    var t = campaign.text || defaultCampaign.text;
    var overlayNode = document.createElement('div');
    overlayNode.className = 'mrc-pop-overlay';
    overlayNode.setAttribute('role', 'dialog');
    overlayNode.setAttribute('aria-modal', 'true');
    overlayNode.setAttribute('aria-labelledby', 'mrc-pop-title');
    overlayNode.innerHTML = [
      '<div class="mrc-pop-dialog">',
      '<button class="mrc-pop-close" type="button" aria-label="Закрити">×</button>',
      '<div class="mrc-pop-body">',
      '<h3 class="mrc-pop-title" id="mrc-pop-title">' + escapeHtml(t.title) + '</h3>',
      '<p class="mrc-pop-sub">' + escapeHtml(t.subtitle) + '</p>',
      '<form class="mrc-pop-form" novalidate>',
      '<input class="mrc-pop-input" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="' + escapeHtml(t.phonePlaceholder) + '">',
      '<input class="mrc-pop-input" name="email" type="email" inputmode="email" autocomplete="email" placeholder="' + escapeHtml(t.emailPlaceholder) + '">',
      '<label class="mrc-pop-consent"><input type="checkbox" name="consent"><span>' + escapeHtml(t.consent) + '</span></label>',
      '<input class="mrc-pop-input mrc-pop-hp" name="website" tabindex="-1" autocomplete="off">',
      '<p class="mrc-pop-error" aria-live="polite"></p>',
      '<button class="mrc-pop-submit" type="submit">' + escapeHtml(t.submit) + '</button>',
      '</form>',
      '<div class="mrc-pop-success" aria-live="polite">',
      '<h3 class="mrc-pop-success-title">' + escapeHtml(t.successTitle) + '</h3>',
      '<p class="mrc-pop-sub">' + escapeHtml(t.successIntro) + '</p>',
      '<div class="mrc-pop-code" data-code></div>',
      '<p class="mrc-pop-success-note" data-success-note>' + escapeHtml(t.successNote) + '</p>',
      '<button class="mrc-pop-copy-btn" type="button">' + escapeHtml(t.copyButton) + '</button>',
      '<p class="mrc-pop-note">' + escapeHtml(t.legal) + '</p>',
      '</div>',
      '</div>',
      '</div>'
    ].join('');
    document.body.appendChild(overlayNode);
    return overlayNode;
  }

  function closePopup() {
    if (!overlay) return;
    overlay.classList.remove('is-open');
    if (!submitted && local) {
      var cooldown = number(campaign.cooldownDays, 7) > 0 ? number(campaign.cooldownDays, 7) * 24 * 60 * 60 * 1000 : DEFAULT_CLOSE_COOLDOWN_MS;
      local.setItem(keys.dismissedUntil, String(now() + cooldown));
      dataLayerPush('popup_close', { popup_id: campaign.campaignId });
    }
  }

  function openPopup(reason) {
    if (opened || !eligible()) return;
    opened = true;
    if (session) session.setItem(keys.shownSession, '1');
    ensureCriticalCss();
    loadCss();
    overlay = overlay || renderPopup();
    bindPopup(overlay);
    window.requestAnimationFrame(function () {
      overlay.classList.add('is-open');
      var input = overlay.querySelector('.mrc-pop-input[name="phone"]');
      if (input && window.innerWidth >= 700) input.focus();
    });
    dataLayerPush('popup_view', { popup_id: campaign.campaignId, trigger: reason || 'unknown' });
    triggerTimers.forEach(clearTimeout);
  }

  function contactType(email, phone) {
    if (email && phone) return 'email_phone';
    if (email) return 'email';
    if (phone) return 'phone';
    return '';
  }

  var uaMobilePrefixes = {
    '39': true,
    '50': true,
    '63': true,
    '66': true,
    '67': true,
    '68': true,
    '73': true,
    '89': true,
    '91': true,
    '92': true,
    '93': true,
    '94': true,
    '95': true,
    '96': true,
    '97': true,
    '98': true,
    '99': true
  };

  function normalizeUaPhone(value) {
    var digits = String(value || '').replace(/\D/g, '');
    var local = '';
    if (digits.length === 10 && digits.charAt(0) === '0') local = digits;
    else if (digits.length === 12 && digits.indexOf('380') === 0) local = digits.slice(2);
    else return '';
    if (!/^0\d{9}$/.test(local)) return '';
    if (!uaMobilePrefixes[local.slice(1, 3)]) return '';
    return '38' + local;
  }

  function setError(errorNode, message) {
    errorNode.textContent = message || '';
    errorNode.classList.toggle('is-visible', Boolean(message));
  }

  function bindPopup(root) {
    if (root.getAttribute('data-bound') === '1') return;
    root.setAttribute('data-bound', '1');
    var close = root.querySelector('.mrc-pop-close');
    var form = root.querySelector('.mrc-pop-form');
    var error = root.querySelector('.mrc-pop-error');
    var success = root.querySelector('.mrc-pop-success');
    var submit = root.querySelector('.mrc-pop-submit');
    var codeBox = root.querySelector('[data-code]');
    var noteBox = root.querySelector('[data-success-note]');
    var copy = root.querySelector('.mrc-pop-copy-btn');
    var emailInput = root.querySelector('input[name="email"]');
    var phoneInput = root.querySelector('input[name="phone"]');
    var consentInput = root.querySelector('input[name="consent"]');
    var websiteInput = root.querySelector('input[name="website"]');
    var t = campaign.text || defaultCampaign.text;
    var requestSerial = 0;

    close.addEventListener('click', closePopup);

    copy.addEventListener('click', function () {
      var code = codeBox.textContent.trim();
      if (navigator.clipboard && code) navigator.clipboard.writeText(code).catch(function () {});
      copy.textContent = t.copiedButton;
      setTimeout(function () { copy.textContent = t.copyButton; }, 1800);
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      setError(error, '');
      var email = String((emailInput && emailInput.value) || '').trim();
      var phone = String((phoneInput && phoneInput.value) || '').trim();
      var normalizedPhone = normalizeUaPhone(phone);
      if (!normalizedPhone) {
        setError(error, t.contactError);
        if (phoneInput) phoneInput.focus();
        return;
      }
      if (!consentInput || !consentInput.checked) {
        setError(error, t.consentError);
        if (consentInput) consentInput.focus();
        return;
      }

      submit.disabled = true;
      submit.textContent = t.loading;
      var currentRequest = ++requestSerial;
      var controller = window.AbortController ? new AbortController() : null;
      var timeout = setTimeout(function () {
        if (currentRequest !== requestSerial) return;
        if (controller) controller.abort();
        submit.disabled = false;
        submit.textContent = t.submit;
        setError(error, t.requestError || defaultCampaign.text.requestError);
      }, 25000);

      var params = getQueryParams();
      var fetchOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({}, params, {
          contact: '+' + normalizedPhone,
          email: email,
          phone: '+' + normalizedPhone,
          consent: consentInput.checked,
          website: websiteInput ? websiteInput.value : '',
          landingPage: local ? local.getItem(keys.seenAt + '_landing') || window.location.href : window.location.href,
          pageUrl: window.location.href,
          referrer: document.referrer || '',
          device: window.innerWidth < 760 ? 'mobile' : (window.innerWidth < 1100 ? 'tablet' : 'desktop')
        }))
      };
      if (controller) fetchOptions.signal = controller.signal;
      fetch(config.apiBase + '/api/first-order-popup/lead', fetchOptions)
        .then(function (response) {
          return response.json().then(function (data) {
            if (!response.ok || !data.ok) {
              var message = data && (data.error || data.reason) ? (data.error || data.reason) : 'Не вдалося створити промокод.';
              throw new Error(message);
            }
            return data;
          });
        })
        .then(function (data) {
          if (currentRequest !== requestSerial) return;
          clearTimeout(timeout);
          submitted = true;
          if (local) {
            local.setItem(keys.submitted, '1');
            local.setItem(keys.code, data.code || '');
            local.setItem(keys.code + '_phone', normalizedPhone);
          }
          dataLayerPush('popup_submit', { popup_id: campaign.campaignId, contact_type: contactType(email, normalizedPhone) });
          dataLayerPush('first_discount_code_created', {
            popup_id: campaign.campaignId,
            coupon: data.code,
            discount: number(data.discount, campaign.first.discount),
            value: number(data.discount, campaign.first.discount),
            currency: 'UAH',
            minimum_order_value: number(data.minTotal, campaign.first.minTotal)
          });
          form.style.display = 'none';
          codeBox.textContent = data.code || '';
          noteBox.textContent = successNote(data);
          success.classList.add('is-visible');
          submit.disabled = false;
          submit.textContent = t.submit;
        })
        .catch(function (err) {
          if (currentRequest !== requestSerial) return;
          clearTimeout(timeout);
          var message = err && err.name === 'AbortError'
            ? (t.requestError || defaultCampaign.text.requestError)
            : (err.message || 'Не вдалося створити промокод.');
          setError(error, message);
          submit.disabled = false;
          submit.textContent = t.submit;
        });
    });
  }

  function setupTriggers() {
    if (!eligible()) return;
    if (local && !local.getItem(keys.seenAt + '_landing')) {
      local.setItem(keys.seenAt + '_landing', window.location.href);
    }
    if (config.force) {
      setTimeout(function () { openPopup('preview'); }, 80);
      return;
    }

    var minDelay = Math.max(0, number(campaign.triggers.timeMinSeconds, 10)) * 1000;
    var maxDelay = Math.max(minDelay, number(campaign.triggers.timeMaxSeconds, 15) * 1000);
    var delay = minDelay + Math.floor(Math.random() * Math.max(1, maxDelay - minDelay + 1));
    triggerTimers.push(setTimeout(function () { openPopup('time'); }, delay));

    window.addEventListener('scroll', function onScroll() {
      if (opened) {
        window.removeEventListener('scroll', onScroll);
        return;
      }
      var doc = document.documentElement;
      var maxScroll = Math.max(1, doc.scrollHeight - window.innerHeight);
      var progress = (window.scrollY || doc.scrollTop || 0) / maxScroll;
      var threshold = Math.max(1, Math.min(95, number(campaign.triggers.scrollPercent, 40))) / 100;
      if (progress >= threshold) {
        window.removeEventListener('scroll', onScroll);
        openPopup(Math.round(threshold * 100) === 40 ? DEFAULT_SCROLL_REASON : 'scroll_' + Math.round(threshold * 100));
      }
    }, { passive: true });

    if (campaign.triggers.exitIntentDesktop !== false && window.innerWidth >= 900) {
      document.addEventListener('mouseleave', function onExit(event) {
        if (event.clientY <= 0) {
          document.removeEventListener('mouseleave', onExit);
          openPopup('exit_intent');
        }
      });
    }
  }

  function currentProductItem(target) {
    var button = target && target.closest ? target.closest('[data-product-id], [onclick*="cart.add"], button, a') : null;
    var onclick = button ? String(button.getAttribute('onclick') || '') : '';
    var match = onclick.match(/cart\.add\(['"]?(\d+)/i);
    var id = (button && (button.getAttribute('data-product-id') || button.value)) || (match && match[1]) || '';
    var card = button && button.closest ? button.closest('.product-thumb, .product-layout, .product-item, .product') : null;
    var nameNode = card ? card.querySelector('.caption a, .name, h4, h3') : document.querySelector('h1');
    return {
      item_id: id ? String(id) : undefined,
      item_name: nameNode ? nameNode.textContent.trim().replace(/\s+/g, ' ') : undefined,
      quantity: 1
    };
  }

  function setupEcommerceEvents() {
    document.addEventListener('click', function (event) {
      var target = event.target;
      if (!target || !target.closest) return;
      var button = target.closest('[onclick*="cart.add"], .button-cart, #button-cart, [data-add-to-cart], .btn-cart');
      if (!button) return;
      dataLayerPush('add_to_cart', {
        currency: 'UAH',
        items: [currentProductItem(button)]
      });
    }, true);

    var patchCartTimer = setInterval(function () {
      if (!window.cart || typeof window.cart.add !== 'function' || window.cart.add.__mrcPatched) return;
      var original = window.cart.add;
      window.cart.add = function (productId, quantity) {
        dataLayerPush('add_to_cart', {
          currency: 'UAH',
          items: [{ item_id: String(productId || ''), quantity: Number(quantity || 1) }]
        });
        return original.apply(this, arguments);
      };
      window.cart.add.__mrcPatched = true;
      clearInterval(patchCartTimer);
    }, 300);
    setTimeout(function () { clearInterval(patchCartTimer); }, 5000);

    if (/\/checkout(\/|$)/i.test(window.location.pathname || '') && session && session.getItem(keys.beginCheckout) !== '1') {
      session.setItem(keys.beginCheckout, '1');
      dataLayerPush('begin_checkout', { currency: 'UAH', items: [] });
    }

    var purchase = config.purchase || window.MercatoGrowthPurchase || null;
    if (purchase && /\/(checkout\/success|success)(\/|$)/i.test(window.location.pathname || '') && session && session.getItem(keys.purchase) !== String(purchase.transaction_id || purchase.order_id || '1')) {
      var transactionId = purchase.transaction_id || purchase.order_id || '';
      if (transactionId) {
        session.setItem(keys.purchase, String(transactionId));
        dataLayerPush('purchase', {
          transaction_id: String(transactionId),
          value: Number(purchase.value || purchase.total || 0),
          currency: purchase.currency || 'UAH',
          coupon: purchase.coupon || '',
          items: Array.isArray(purchase.items) ? purchase.items : []
        });
        if (purchase.second_coupon_created && purchase.second_coupon) {
          dataLayerPush('second_discount_code_created', {
            coupon: String(purchase.second_coupon),
            transaction_id: String(transactionId)
          });
        }
        var coupon = String(purchase.coupon || '').toUpperCase();
        if (coupon.indexOf(campaign.first.prefix || 'F10') === 0) dataLayerPush('first_discount_used', { coupon: coupon, transaction_id: String(transactionId) });
        if (coupon.indexOf('F15') === 0) dataLayerPush('second_discount_used', { coupon: coupon, transaction_id: String(transactionId) });
      }
    }
  }

  function loadCampaignConfig() {
    if (globalConfig.config && typeof globalConfig.config === 'object') {
      campaign = mergeCampaign(campaign, globalConfig.config);
    }
    return fetch(config.apiBase + '/api/first-order-popup/config', { credentials: 'omit' })
      .then(function (response) {
        if (!response.ok) throw new Error('popup config unavailable');
        return response.json();
      })
      .then(function (data) {
        campaign = mergeCampaign(campaign, data || {});
      })
      .catch(function () {
        campaign = mergeCampaign(campaign, {});
      });
  }

  function boot() {
    ensureCriticalCss();
    loadCampaignConfig().then(function () {
      if (eligible()) loadCss();
      setupEcommerceEvents();
      setupTriggers();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
