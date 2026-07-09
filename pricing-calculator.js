function cleanPriceText(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[^\d,.\- ]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function parseMoney(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = cleanPriceText(value);
  if (!cleaned) return null;
  const normalized = cleaned.includes(',') && cleaned.includes('.')
    ? cleaned.replace(/,/g, '')
    : cleaned.replace(',', '.');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function roundToStep(value, step = 1) {
  const number = Number(value);
  const multiple = Number(step);
  if (!Number.isFinite(number)) return null;
  if (!Number.isFinite(multiple) || multiple <= 0) return number;
  return Math.round(number / multiple) * multiple;
}

function roundMoney(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

const DEFAULT_COFFEE_PRICING_CONFIG = {
  source: 'Google Sheet: "Rasschety Mercato" / tabs "Kalkulyatsiya" and "Raschet Sait"',
  greenVatRate: 0.2,
  roastLossRate: 0.22,
  defaultPackageCostPerKg: 10,
  defaultElectricityCostPerKg: 10,
  defaultDeliveryCostPerKg: 20,
  saleMarkup: 0.35,
  catalogMarkup: 0.3,
  siteOverhead: 43.905,
  siteRoundStep: 5,
  sitePackages: {
    g100: { grams: 100, divisor: 10, markup: 1.6, addOverhead: true, roundTo: 5 },
    g250: { grams: 250, divisor: 4, markup: 1.5, addOverhead: true, roundTo: 5 },
    g500: { grams: 500, percentMarkup: 60, addOverhead: false, roundTo: 0, enabled: false },
    g1000: { grams: 1000, multiplier: 1.3, addOverhead: true, roundTo: 5 }
  }
};

function configWithOverrides(overrides = {}) {
  const config = {
    ...DEFAULT_COFFEE_PRICING_CONFIG,
    ...Object.fromEntries(Object.entries(overrides || {}).filter(([, value]) => value !== undefined && value !== null && value !== '')),
    sitePackages: {
      ...DEFAULT_COFFEE_PRICING_CONFIG.sitePackages,
      ...(overrides.sitePackages || {})
    }
  };
  [
    'greenVatRate',
    'roastLossRate',
    'defaultPackageCostPerKg',
    'defaultElectricityCostPerKg',
    'defaultDeliveryCostPerKg',
    'saleMarkup',
    'catalogMarkup',
    'siteOverhead',
    'siteRoundStep'
  ].forEach(key => {
    const parsed = parseMoney(config[key]);
    if (parsed !== null) config[key] = parsed;
  });
  return config;
}

function calculateSitePackagePrice(salePricePerKg, packageConfig = {}, config = DEFAULT_COFFEE_PRICING_CONFIG) {
  const base = Number(salePricePerKg);
  if (!Number.isFinite(base) || base <= 0) return null;

  let raw = null;
  if (Number.isFinite(Number(packageConfig.divisor)) && Number.isFinite(Number(packageConfig.markup))) {
    raw = (base / Number(packageConfig.divisor)) * Number(packageConfig.markup);
  } else if (Number.isFinite(Number(packageConfig.percentMarkup)) && Number.isFinite(Number(packageConfig.grams))) {
    raw = (base * Number(packageConfig.grams) / 1000 / 100) * (Number(packageConfig.percentMarkup) + 100);
  } else if (Number.isFinite(Number(packageConfig.multiplier))) {
    raw = base * Number(packageConfig.multiplier);
  }

  if (!Number.isFinite(raw)) return null;
  if (packageConfig.addOverhead) raw += Number(config.siteOverhead || 0);
  const roundTo = packageConfig.roundTo !== undefined && packageConfig.roundTo !== null
    ? Number(packageConfig.roundTo)
    : Number(config.siteRoundStep || 0);
  const rounded = roundTo > 0
    ? roundToStep(raw, roundTo)
    : raw;

  return {
    raw: roundMoney(raw, 4),
    value: roundMoney(rounded, 2),
    displayValue: roundMoney(rounded, 0),
    grams: Number(packageConfig.grams || 0)
  };
}

function calculateCoffeePricing(input = {}, overrides = {}) {
  const config = configWithOverrides(overrides);
  const nbuRate = parseMoney(input.nbuRate ?? input.usdRate ?? input.rate);
  const priceUsd = parseMoney(input.priceUsd ?? input.greenPriceUsd);
  let greenPriceUah = parseMoney(input.greenPriceUah ?? input.priceUah ?? input.greenPrice);
  let source = greenPriceUah !== null ? 'uah' : '';

  if ((greenPriceUah === null || greenPriceUah <= 0) && priceUsd !== null && nbuRate !== null) {
    greenPriceUah = priceUsd * nbuRate;
    source = 'usd_nbu';
  }

  if (greenPriceUah === null || greenPriceUah <= 0) {
    return {
      ok: false,
      error: 'green_price_required',
      message: 'Need green coffee price in UAH/kg or USD/kg with NBU rate.',
      input: {
        greenPriceUah,
        priceUsd,
        nbuRate
      },
      config
    };
  }

  const greenPriceWithVat = parseMoney(input.greenPriceWithVat ?? input.priceWithVat)
    ?? greenPriceUah * (1 + Number(config.greenVatRate || 0));
  const roastLossRate = parseMoney(input.roastLossRate) ?? Number(config.roastLossRate || 0);
  const packageCostPerKg = parseMoney(input.packageCostPerKg) ?? Number(config.defaultPackageCostPerKg || 0);
  const electricityCostPerKg = parseMoney(input.electricityCostPerKg) ?? Number(config.defaultElectricityCostPerKg || 0);
  const deliveryCostPerKg = parseMoney(input.deliveryCostPerKg) ?? Number(config.defaultDeliveryCostPerKg || 0);
  const saleMarkup = parseMoney(input.saleMarkup) ?? Number(config.saleMarkup || 0);

  const roastedCostPerKg =
    greenPriceWithVat * (1 + roastLossRate) +
    packageCostPerKg +
    electricityCostPerKg +
    deliveryCostPerKg;
  const salePricePerKg = roastedCostPerKg * (1 + saleMarkup);
  const catalogPricePerKg = salePricePerKg * (1 + Number(config.catalogMarkup || 0));

  const sitePrices = {};
  Object.entries(config.sitePackages || {}).forEach(([key, packageConfig]) => {
    if (packageConfig?.enabled === false) return;
    sitePrices[key] = calculateSitePackagePrice(salePricePerKg, packageConfig, config);
  });

  return {
    ok: true,
    source,
    formulaVersion: 'google-sheet-2026-05-18',
    input: {
      greenPriceUah: roundMoney(greenPriceUah, 4),
      greenPriceUsd: priceUsd,
      nbuRate
    },
    costs: {
      greenPriceWithVat: roundMoney(greenPriceWithVat, 4),
      roastLossRate,
      packageCostPerKg,
      electricityCostPerKg,
      deliveryCostPerKg,
      roastedCostPerKg: roundMoney(roastedCostPerKg, 4)
    },
    sale: {
      saleMarkup,
      salePricePerKg: roundMoney(salePricePerKg, 4),
      catalogMarkup: Number(config.catalogMarkup || 0),
      catalogPricePerKg: roundMoney(catalogPricePerKg, 4)
    },
    sitePrices,
    recommendedOpenCartPrice: sitePrices.g250?.value ?? sitePrices.g100?.value ?? roundMoney(salePricePerKg, 2),
    config
  };
}

function calculateSupplierLotPricing(lot = {}, options = {}) {
  return calculateCoffeePricing({
    greenPriceUah: lot.price_uah,
    priceUsd: lot.price_usd,
    nbuRate: options.nbuRate
  }, options.config || {});
}

module.exports = {
  DEFAULT_COFFEE_PRICING_CONFIG,
  parseMoney,
  roundToStep,
  roundMoney,
  configWithOverrides,
  calculateCoffeePricing,
  calculateSupplierLotPricing
};
