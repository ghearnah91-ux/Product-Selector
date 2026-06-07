(function () {
  const DATA = window.BROOKEAIR_DATA || {};
  const products = DATA.Products || [];
  const rules = (DATA.EngineeringRules || []).sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));
  const productApps = DATA.ProductApplications || [];
  const productAccessories = DATA.ProductAccessories || [];
  const accessories = DATA.Accessories || [];
  const variants = DATA.ProductVariants || [];
  const sizeLimits = DATA.SizeLimits || [];
  const features = DATA.ProductFeatures || [];
  const performanceSources = DATA.PerformanceSources || [];
  const commonMistakes = DATA.CommonMistakes || [];
  const compatibility = DATA.CompatibilityMatrix || [];
  const gaps = DATA.DataGaps || [];

  const state = {
    air_function: '', mounting: '', application: '', airflow: '', special: [], keyword: '', family: ''
  };

  const $ = id => document.getElementById(id);
  const normalise = value => String(value ?? '').toLowerCase().trim();
  const contains = (haystack, needle) => normalise(haystack).includes(normalise(needle));
  const splitList = value => String(value || '').split(';').map(x => x.trim()).filter(Boolean);
  const unique = arr => [...new Set(arr.filter(Boolean))];

  const productByCode = new Map(products.map(p => [p.product_code, p]));
  const accessoryByCode = new Map(accessories.map(a => [a.accessory_code, a]));

  function init() {
    initTabs();
    renderStatus();
    renderSelectorControls();
    renderFamilyFilter();
    renderRecommendations();
    initConfigurator();
    renderLibrary();
    renderRules();
    bindEvents();
  }

  function bindEvents() {
    $('resetBtn').addEventListener('click', () => {
      Object.assign(state, { air_function: '', mounting: '', application: '', airflow: '', special: [], keyword: '', family: '' });
      renderSelectorControls();
      renderFamilyFilter();
      $('keywordInput').value = '';
      renderRecommendations();
    });
    $('exportBtn').addEventListener('click', exportSummary);
    $('copyTopBtn').addEventListener('click', copyTopRecommendation);
    $('keywordInput').addEventListener('input', e => { state.keyword = e.target.value; renderRecommendations(); });
    $('familyFilter').addEventListener('change', e => { state.family = e.target.value; renderRecommendations(); });
    $('librarySearch').addEventListener('input', renderLibrary);
  }

  function initTabs() {
    document.querySelectorAll('.tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(x => x.classList.remove('active'));
        btn.classList.add('active');
        $(btn.dataset.tab).classList.add('active');
      });
    });
  }

  function renderStatus() {
    $('dataStatus').innerHTML = `<span class="badge good">${products.length} products</span><span class="badge good">${rules.length} rules</span><span class="badge good">${compatibility.length} compatibility checks</span>`;
  }

  function renderSelectorControls() {
    const applications = unique((DATA.Applications || []).map(a => a.application_name)).sort();
    const config = DATA.ConfigOptions || {};
    const html = [
      selectQuestion('air_function', 'What are you trying to do?', config.air_function || ['Supply','Extract','Return','Transfer']),
      selectQuestion('mounting', 'Where is it installed?', config.mounting || ['Ceiling','Sidewall','Floor']),
      selectQuestion('application', 'What type of space is it for?', applications),
      numberQuestion('airflow', 'Airflow requirement (optional, l/s)'),
      checkboxQuestion('special', 'Special requirements', config.special || [])
    ].join('');
    $('questionContainer').innerHTML = html;

    document.querySelectorAll('[data-field]').forEach(el => {
      const field = el.dataset.field;
      if (el.type === 'checkbox') {
        el.addEventListener('change', () => {
          const selected = [...document.querySelectorAll(`[data-field="${field}"]:checked`)].map(x => x.value);
          state[field] = selected;
          renderRecommendations();
        });
      } else {
        el.addEventListener('input', e => { state[field] = e.target.value; renderRecommendations(); });
      }
    });
  }

  function selectQuestion(field, label, items) {
    return `<div class="question"><label for="${field}">${label}</label><select id="${field}" data-field="${field}"><option value="">Not specified</option>${items.map(x => `<option ${state[field]===x?'selected':''} value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('')}</select></div>`;
  }

  function numberQuestion(field, label) {
    return `<div class="question"><label for="${field}">${label}</label><input id="${field}" data-field="${field}" type="number" min="0" step="1" value="${escapeHtml(state[field])}" placeholder="e.g. 250" /></div>`;
  }

  function checkboxQuestion(field, label, items) {
    return `<div class="question"><label>${label}</label><div class="checkbox-grid">${items.map(x => `<label><input type="checkbox" data-field="${field}" value="${escapeHtml(x)}" ${state[field].includes(x)?'checked':''}>${escapeHtml(x)}</label>`).join('')}</div></div>`;
  }

  function renderFamilyFilter() {
    const families = unique(products.map(p => p.product_family)).sort();
    $('familyFilter').innerHTML = `<option value="">All families</option>` + families.map(f => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('');
  }

  function hasExactToken(value, target) {
    return splitList(value).some(x => normalise(x) === normalise(target));
  }

  function isFloorProduct(product) {
    return ['AL-FLG-GR', 'BR-FLG-GR', 'AL-CRFG-GR'].includes(product.product_code) || contains(product.product_category, 'floor');
  }

  function isRaisedFloorProduct(product) {
    return product.product_code === 'AL-CRFG-GR' || contains(product.product_name, 'Data Centre Floor');
  }

  function isLinearSlotOrBar(product) {
    return contains(product.product_category, 'linear bar') || contains(product.product_category, 'slot diffuser') || contains(product.product_name, 'linear slot') || contains(product.product_name, 'flowline') || contains(product.product_name, 'linear bar');
  }

  function isAirValve(product) {
    return product.product_code === 'AL-ARV-DF' || contains(product.product_category, 'air valve') || contains(product.product_name, 'air valve');
  }

  function isGeneralRoomApplication(value) {
    const v = normalise(value);
    return ['apartment', 'flat', 'hotel', 'bedroom', 'residential', 'office', 'meeting room'].some(x => v.includes(x));
  }

  function hardExclusion(product) {
    const reasons = [];
    const mounting = state.mounting;
    const application = state.application;
    const special = state.special.map(normalise);

    if (mounting === 'Circular Duct' && product.product_code !== 'PBMC') {
      reasons.push('Excluded because circular duct mounting requires PBMC curved duct grille in V1.');
    }

    if (mounting === 'Floor' && !isFloorProduct(product)) {
      reasons.push('Excluded because floor mounting requires a floor grille product.');
    }

    if (mounting === 'Raised Floor' && !isRaisedFloorProduct(product)) {
      reasons.push('Excluded because raised floor/data centre applications require the CRFG/data centre floor grille in V1.');
    }

    if ((application === 'Operating Theatre' || application === 'Clean Room') && product.product_code !== 'AL-LAM-DF') {
      reasons.push('Excluded because controlled/hygiene-sensitive applications require Laminar Flow in V1.');
    }

    if (special.includes('long throw') && product.product_code !== 'AL-DRJ-DF') {
      reasons.push('Excluded because Long Throw requirement requires Drum Jet in V1.');
    }

    return reasons;
  }

  function directBestMatch(product) {
    if (state.mounting === 'Circular Duct' && product.product_code === 'PBMC') return 'Direct match: PBMC is the circular duct mounted grille.';
    if (state.mounting === 'Floor' && isFloorProduct(product)) return 'Direct match: floor mounted application requires a floor grille.';
    if (state.mounting === 'Raised Floor' && isRaisedFloorProduct(product)) return 'Direct match: raised floor/data centre application requires CRFG.';
    if ((state.application === 'Operating Theatre' || state.application === 'Clean Room') && product.product_code === 'AL-LAM-DF') return 'Direct match: Laminar Flow is the controlled/hygiene-sensitive terminal.';
    if (state.application === 'Data Centre' && product.product_code === 'AL-CRFG-GR') return 'Direct match: CRFG is the data centre / raised floor grille.';
    if (state.special.map(normalise).includes('long throw') && product.product_code === 'AL-DRJ-DF') return 'Direct match: Drum Jet is the long throw product.';
    return '';
  }

  function scoreProduct(product) {
    const excluded = hardExclusion(product);
    const reasons = [];
    const warnings = [];
    const direct = directBestMatch(product);
    const textBlob = [product.product_name, product.product_code, product.product_family, product.product_category, product.description, product.primary_function, product.mounting_location, product.notes].join(' ');

    if (excluded.length) {
      return { product, score: 0, excluded: true, reasons: excluded, warnings: excluded.slice(0, 3) };
    }

    let score = direct ? 100 : 8;
    if (direct) reasons.push(direct);

    if (state.family && product.product_family !== state.family) score = 0;

    if (state.keyword) {
      if (contains(textBlob, state.keyword)) { score += direct ? 0 : 12; reasons.push(`Matches keyword "${state.keyword}".`); }
      else score -= 10;
    }

    if (state.air_function) {
      if (contains(product.primary_function, state.air_function) || (state.air_function === 'Return' && contains(product.primary_function, 'Extract'))) {
        score += direct ? 0 : 22; reasons.push(`Matches ${state.air_function.toLowerCase()} duty.`);
      } else {
        score -= 18; warnings.push(`Primary function is ${product.primary_function || 'not defined'}, not clearly ${state.air_function}.`);
      }
    }

    if (state.mounting) {
      if (hasExactToken(product.mounting_location, state.mounting) || contains(product.description, state.mounting)) {
        score += direct ? 0 : 25; reasons.push(`Suitable for ${state.mounting.toLowerCase()} installation.`);
      } else {
        score -= 20;
        warnings.push(`Not listed for ${state.mounting.toLowerCase()} mounting.`);
      }
    }

    if (state.application) {
      const app = productApps.find(x => x.product_code === product.product_code && x.application_name === state.application);
      if (app) {
        if (normalise(app.suitability).includes('suitable') || normalise(app.suitability).includes('preferred')) score += direct ? 0 : 26;
        reasons.push(app.reason || `Listed for ${state.application}.`);
      } else if (contains(textBlob, state.application)) {
        score += direct ? 0 : 8;
      } else {
        score -= 8;
      }
    }

    const prodFeatures = features.filter(f => f.product_code === product.product_code).map(f => `${f.feature} ${f.value} ${f.notes}`).join(' ');
    for (const special of state.special) {
      const s = normalise(special);
      const match = contains(textBlob, special) || contains(prodFeatures, special) ||
        (s.includes('continuous') && (contains(textBlob, 'continuous') || contains(prodFeatures, 'continuous'))) ||
        (s.includes('curved') && (contains(textBlob, 'curved') || contains(prodFeatures, 'curved'))) ||
        (s.includes('clean') && (contains(textBlob, 'clean') || contains(textBlob, 'laminar'))) ||
        (s.includes('high free') && contains(textBlob, 'free area')) ||
        (s.includes('adjustable') && contains(textBlob, 'adjustable')) ||
        (s.includes('vav') && contains(textBlob, 'variable air volume'));
      if (match) { score += direct ? 0 : 12; reasons.push(`Matches special requirement: ${special}.`); }
      else { score -= 8; }
    }

    const airflow = Number(state.airflow || 0);
    if (airflow > 0) {
      if (airflow > 600 && product.product_code === 'AL-DRJ-DF') { score += direct ? 0 : 15; reasons.push('Drum Jet should be considered for larger volume / long throw duties.'); }
      if (airflow <= 80 && isAirValve(product)) { score += direct ? 0 : 6; reasons.push('Air valve remains plausible at low room air volumes.'); }
      if (airflow > 80 && isAirValve(product)) { score -= 30; warnings.push('Air valve is generally not preferred once airflow increases; use a grille or diffuser sized to suit.'); }
      if (airflow > 0 && isLinearSlotOrBar(product)) { score += direct ? 0 : 10; reasons.push('Linear grille/diffuser can be sized to suit the required volume.'); }
    }

    // Brooke Air selection preference: where the application is broadly compatible but not a specialist hard-rule case,
    // favour linear slot diffusers and linear bar grilles over air valves. Small grilles can be manufactured to suit
    // low and medium room volumes, whereas air valves should be treated as simple low-volume options only.
    if (!direct && isGeneralRoomApplication(state.application) && ['Supply', 'Extract', 'Return'].includes(state.air_function)) {
      if (isLinearSlotOrBar(product) && (hasExactToken(product.mounting_location, state.mounting) || contains(product.mounting_location, 'Sidewall') || contains(product.mounting_location, 'Ceiling'))) {
        score += 22;
        reasons.push('Borderline room duty: Brooke Air preference is to offer a linear slot diffuser or linear bar grille before an air valve.');
      }
      if (isAirValve(product)) {
        score -= 18;
        warnings.push('Air valves are kept as low-volume/simple-room alternatives, not the preferred customer-facing recommendation.');
      }
    }

    if (!direct && state.mounting === 'Sidewall' && isLinearSlotOrBar(product)) {
      score += 10;
      reasons.push('Linear grilles and slot diffusers are suitable sidewall/bulkhead options.');
    }

    for (const rule of rules) {
      const c = normalise(rule.condition);
      const applies = !rule.applies_to_product_code || rule.applies_to_product_code === product.product_code;
      if (!applies) continue;
      let hit = false;
      if (state.application && c.includes(normalise(state.application))) hit = true;
      if (state.mounting && c.includes(normalise(state.mounting))) hit = true;
      for (const special of state.special) if (c.includes(normalise(special)) || normalise(rule.reason).includes(normalise(special))) hit = true;
      if (hit) {
        const action = normalise(rule.output_action || rule.rule_type);
        if ((action.includes('recommend') || action.includes('inclusion')) && !direct) score += Math.min(18, Number(rule.priority || 50) / 6);
        if (action.includes('warn') || action.includes('exclude')) warnings.push(rule.reason || rule.recommendation);
        if (rule.recommendation || rule.reason) reasons.push(rule.recommendation || rule.reason);
      }
    }

    if (product.v1_status && normalise(product.v1_status).includes('needs')) warnings.push('Included in V1 but needs manual datasheet/performance data.');
    if (!reasons.length) reasons.push('Possible catalogue match. Check full datasheet before issue.');
    score = Math.max(0, Math.min(100, Math.round(score)));
    return { product, score, excluded: false, reasons: unique(reasons).slice(0, 5), warnings: unique(warnings).slice(0, 3) };
  }

  function renderRecommendations() {
    const ranked = products.map(scoreProduct).filter(x => x.score > 0).sort((a, b) => b.score - a.score || a.product.product_name.localeCompare(b.product.product_name));
    $('resultCount').textContent = `${ranked.length} product families shown. Top results are guidance only.`;
    $('recommendations').innerHTML = ranked.slice(0, 12).map((r, idx) => productCard(r, idx)).join('') || '<p>No products match the current filters.</p>';
    document.querySelectorAll('[data-copy-product]').forEach(btn => {
      btn.addEventListener('click', () => copyProductEnquiry(btn.dataset.copyProduct));
    });
  }

  function scoreBand(score) {
    if (score >= 75) return { cls: 'score-good', label: 'Strong match' };
    if (score >= 50) return { cls: 'score-amber', label: 'Possible match' };
    return { cls: 'score-red', label: 'Review carefully' };
  }

  function confidenceText(score) {
    if (score >= 90) return 'Recommended';
    if (score >= 75) return 'Strong match';
    if (score >= 50) return 'Possible match';
    return 'Technical review required';
  }

  function suitabilityText(r) {
    const p = r.product;
    if (r.score >= 90) return `This is the best match from the current rules for the selected duty. Confirm final size, noise level and pressure drop against the datasheet before issuing.`;
    if (r.score >= 75) return `This looks suitable based on product function and installation data. Check detailed performance and accessory requirements before selection.`;
    if (r.score >= 50) return `This may be suitable, but the match is not strong enough for automatic recommendation. Treat as an alternative only.`;
    return `This product has only a weak catalogue match. It should not be recommended without technical review.`;
  }

  function detailRows(r) {
    const p = r.product;
    const perf = performanceSources.find(ps => ps.product_code === p.product_code);
    const sizes = sizeLimits.find(s => s.product_code === p.product_code);
    const acc = productAccessories.filter(pa => pa.product_code === p.product_code).slice(0, 8).map(pa => pa.accessory_code).join(', ');
    const vars = variants.filter(v => v.product_code === p.product_code).slice(0, 8).map(v => v.variant_code).join(', ');
    const rows = [
      ['Product family', p.product_family || 'Not defined'],
      ['Category', p.product_category || 'Not defined'],
      ['Primary function', p.primary_function || 'Not defined'],
      ['Mounting', p.mounting_location || 'Not defined'],
      ['Material', p.material || 'Not defined'],
      ['Variants/types', vars || 'See datasheet'],
      ['Compatible accessories', acc || 'See datasheet'],
      ['Size range', sizes ? sizeSummary(sizes) : 'See datasheet'],
      ['Performance source', perf ? `${perf.data_type || 'Datasheet'}${perf.source_confidence ? ' · ' + perf.source_confidence : ''}` : 'Not loaded in this prototype']
    ];
    return rows.map(([k,v]) => `<div class="detail-row"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`).join('');
  }

  function productCard(r, idx) {
    const p = r.product;
    const band = scoreBand(r.score);
    return `<article class="card ${idx===0?'top':''}">
      <div class="card-header">
        <div>
          <span class="recommendation-label ${band.cls}">${confidenceText(r.score)}</span>
          <h3>${escapeHtml(p.product_name)}</h3>
          <p class="code">${escapeHtml(p.product_code)}</p>
        </div>
        <div class="score ${band.cls}" title="${escapeHtml(band.label)}"><span>${r.score}</span><small>%</small></div>
      </div>
      <p class="meta">${escapeHtml(p.product_family)} · ${escapeHtml(p.product_category)} · ${escapeHtml(p.material || '')}</p>
      <p>${escapeHtml(p.description || '')}</p>
      <div class="customer-summary"><strong>Selection note:</strong> ${escapeHtml(suitabilityText(r))}</div>
      <details class="match-details" ${idx === 0 ? 'open' : ''}>
        <summary>Show selection detail</summary>
        <div class="detail-grid">${detailRows(r)}</div>
        <h4>Why this product is shown</h4>
        <ul class="reason-list">${r.reasons.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>
        ${r.warnings.length ? `<h4>Checks before issue</h4><div>${r.warnings.map(w => `<span class="badge bad">${escapeHtml(w)}</span>`).join('')}</div>` : ''}
      </details>
      <div class="cta-row"><button class="secondary small" data-copy-product="${escapeHtml(p.product_code)}">Copy enquiry text</button></div>
    </article>`;
  }

  function sizeSummary(s) {
    const parts = [];
    if (s.min_width_mm || s.max_width_mm) parts.push(`W ${s.min_width_mm || '?'}-${s.max_width_mm || '?'}mm`);
    if (s.min_height_mm || s.max_height_mm) parts.push(`H ${s.min_height_mm || '?'}-${s.max_height_mm || '?'}mm`);
    if (s.max_single_section_length_mm) parts.push(`max section ${s.max_single_section_length_mm}mm`);
    return parts.join(', ') || s.size_notes || 'See datasheet';
  }

  function initConfigurator() {
    const configurableProducts = products
      .filter(productHasCompatibility)
      .sort((a, b) => a.product_name.localeCompare(b.product_name));

    $('compatProduct').innerHTML = configurableProducts
      .map(p => `<option value="${escapeHtml(p.product_code)}">${escapeHtml(p.product_name)} (${escapeHtml(p.product_code)})</option>`)
      .join('');

    ['compatProduct','compatVariant','compatGroup','compatOption'].forEach(id => {
      $(id).addEventListener('change', () => {
        if (id === 'compatProduct') renderCompatVariants();
        if (id === 'compatProduct' || id === 'compatVariant') renderCompatGroups();
        if (id === 'compatProduct' || id === 'compatVariant' || id === 'compatGroup') renderCompatOptions();
        renderCompat();
      });
    });

    renderCompatVariants();
    renderCompatGroups();
    renderCompatOptions();
    renderCompat();
  }

  function productHasCompatibility(product) {
    const keys = compatibilityKeysForProduct(product.product_code);
    return keys.some(key => compatibility.some(c => c.product_type === key));
  }

  function compatibilityKeysForProduct(productCode) {
    const productVariants = variants.filter(v => v.product_code === productCode).map(v => v.variant_code);
    const keys = productVariants.map(compatibilityKeyForVariant).filter(Boolean);
    return unique(keys);
  }

  function compatibilityKeyForVariant(variantCode) {
    const code = String(variantCode || '').toUpperCase();
    if (!code) return '';
    if (code.includes('HD/')) return 'HD';
    if (code === 'SDH' || code === 'SDV' || code === 'SD') return 'SD';
    if (code === 'DDH' || code === 'DDV' || code === 'DD') return 'DD';
    if (code === 'R') return 'R';
    if (['E5C', 'EXP', 'PER'].includes(code)) return 'E5C-EXP-PER';
    if (['E5C/RC', 'PER/RC'].includes(code)) return code;
    if (code.startsWith('F') && code.includes('-C')) return 'CC CSW';
    if (code.startsWith('F')) return 'FB,FN';
    if (code.includes('FR/FB') || code.includes('CRFG')) return 'FR/FB,CRFG';
    if (code.includes('F45')) return 'F45N';
    if (code.includes('RGD')) return 'RGD';
    if (code.includes('TG1') || code.includes('TG2')) return 'TG1/TG2';
    if (code.includes('TG')) return 'TG, T/TG';
    if (code.includes('BV60')) return 'BV60';
    return '';
  }

  function renderCompatVariants() {
    const productCode = $('compatProduct').value;
    const productVariants = variants.filter(v => v.product_code === productCode);
    const rows = [];
    for (const variant of productVariants) {
      const key = compatibilityKeyForVariant(variant.variant_code);
      if (key && compatibility.some(c => c.product_type === key)) {
        rows.push({ variant, key });
      }
    }

    const grouped = [];
    const seen = new Set();
    for (const row of rows) {
      const id = `${row.key}|${row.variant.variant_code}`;
      if (!seen.has(id)) {
        seen.add(id);
        grouped.push(row);
      }
    }

    $('compatVariant').innerHTML = grouped
      .map(row => `<option value="${escapeHtml(row.key)}" data-variant="${escapeHtml(row.variant.variant_code)}">${escapeHtml(row.variant.variant_code)} — ${escapeHtml(row.variant.variant_name || row.key)}</option>`)
      .join('');

    $('compatVariantNote').textContent = grouped.length
      ? 'Options below are filtered by the selected product type, not shown as one generic list.'
      : 'No compatibility matrix entry is currently mapped to this product.';
  }

  function selectedCompatKey() {
    return $('compatVariant').value || '';
  }

  function renderCompatGroups() {
    const key = selectedCompatKey();
    const groups = unique(compatibility.filter(c => c.product_type === key).map(c => c.option_group)).sort();
    $('compatGroup').innerHTML = groups.map(x => `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('');
  }

  function renderCompatOptions() {
    const key = selectedCompatKey();
    const group = $('compatGroup').value;
    const opts = compatibility
      .filter(c => c.product_type === key && c.option_group === group)
      .map(c => c.option_code);
    $('compatOption').innerHTML = unique(opts).map(x => `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('');
  }

  function renderCompat() {
    const productCode = $('compatProduct').value;
    const product = productByCode.get(productCode);
    const key = selectedCompatKey();
    const group = $('compatGroup').value;
    const option = $('compatOption').value;
    const selectedVariant = $('compatVariant').selectedOptions[0]?.dataset?.variant || key;
    const rec = compatibility.find(c => c.product_type === key && c.option_group === group && c.option_code === option);

    let cls = 'na', title = 'Not found', msg = 'No compatibility record found for this combination.';
    if (!key) {
      msg = 'No mapped compatibility data is available for this product yet.';
    } else if (rec) {
      if (rec.allowed) {
        cls = 'ok';
        title = 'Allowed';
        msg = `${option} is compatible with ${selectedVariant || key} on ${product?.product_name || productCode}.`;
      } else if (rec.not_applicable) {
        cls = 'na';
        title = 'Not applicable / check manually';
        msg = `${option} is marked as not applicable or not normally used with ${selectedVariant || key}.`;
      } else {
        cls = 'no';
        title = 'Not allowed';
        msg = `${option} is marked as incompatible with ${selectedVariant || key}.`;
      }
    }

    $('compatResult').className = `compat-result ${cls}`;
    $('compatResult').innerHTML = `<h3>${title}</h3><p>${escapeHtml(msg)}</p><p class="meta">Matrix key: ${escapeHtml(key || 'none')} · Source: grille compatibility matrix.</p>`;

    const rows = compatibility.filter(c => c.product_type === key && c.option_group === group);
    $('compatTable').innerHTML = rows.length
      ? `<table><thead><tr><th>Option</th><th>Status</th><th>Meaning</th></tr></thead><tbody>${rows.map(r => `<tr><td>${escapeHtml(r.option_code)}</td><td>${escapeHtml(r.status)}</td><td>${r.allowed ? '<span class="badge good">Allowed</span>' : r.not_applicable ? '<span class="badge warn">Not applicable</span>' : '<span class="badge bad">Not allowed</span>'}</td></tr>`).join('')}</tbody></table>`
      : '<p>No options available for this product type and option group.</p>';
  }

  function renderLibrary() {
    const q = normalise($('librarySearch')?.value || '');
    const list = products.filter(p => !q || contains([p.product_code,p.product_name,p.product_family,p.product_category,p.description,p.notes].join(' '), q));
    $('libraryGrid').innerHTML = list.map(p => `<article class="card"><h3>${escapeHtml(p.product_name)}</h3><p class="code">${escapeHtml(p.product_code)}</p><p class="meta">${escapeHtml(p.product_family)} · ${escapeHtml(p.product_category)}</p><p>${escapeHtml(p.description || '')}</p><span class="badge">${escapeHtml(p.v1_status || 'Included')}</span><span class="badge warn">${escapeHtml(p.data_confidence || 'Unknown')} confidence</span></article>`).join('');
  }

  function renderRules() {
    $('rulesList').innerHTML = rules.map(r => `<div class="list-item"><p><strong>${escapeHtml(r.rule_id)} · Priority ${escapeHtml(r.priority)}</strong></p><p>${escapeHtml(r.condition)}</p><p class="meta">${escapeHtml(r.recommendation || '')}</p><p>${escapeHtml(r.reason || '')}</p></div>`).join('');
    $('mistakesList').innerHTML = commonMistakes.map(m => `<div class="list-item"><p><strong>${escapeHtml(m.scenario)}</strong></p><p>${escapeHtml(m.warning_message)}</p><p class="meta">${escapeHtml(m.recommended_action)} · ${escapeHtml(m.severity)}</p></div>`).join('');
    $('gapsList').innerHTML = gaps.map(g => `<div class="list-item"><p><strong>${escapeHtml(g.area)}</strong></p><p>${escapeHtml(g.gap_description)}</p><p class="meta">Impact: ${escapeHtml(g.impact)} · Status: ${escapeHtml(g.status)}</p></div>`).join('');
  }

  function copyProductEnquiry(productCode) {
    const result = products.map(scoreProduct).find(x => x.product.product_code === productCode);
    if (!result) return;
    const p = result.product;
    const lines = [
      `Product enquiry: ${p.product_name} (${p.product_code})`,
      '',
      `Application: ${state.application || 'Not specified'}`,
      `Air function: ${state.air_function || 'Not specified'}`,
      `Mounting: ${state.mounting || 'Not specified'}`,
      `Airflow: ${state.airflow ? state.airflow + ' l/s' : 'Not specified'}`,
      `Special requirements: ${state.special.length ? state.special.join(', ') : 'None specified'}`,
      '',
      `Selection confidence: ${confidenceText(result.score)} (${result.score}%)`,
      `Reason: ${result.reasons[0] || 'Catalogue match'}`,
      '',
      'Please confirm final size, finish, accessories, noise level and pressure drop.'
    ];
    navigator.clipboard.writeText(lines.join('\n'));
  }

  function copyTopRecommendation() {
    const top = products.map(scoreProduct).sort((a, b) => b.score - a.score)[0];
    if (!top) return;
    const p = top.product;
    const text = `${p.product_name} (${p.product_code})\nScore: ${top.score}\nReasons:\n- ${top.reasons.join('\n- ')}\nWarnings:\n- ${top.warnings.join('\n- ') || 'None'}`;
    navigator.clipboard?.writeText(text);
  }

  function exportSummary() {
    const ranked = products.map(scoreProduct).sort((a, b) => b.score - a.score).slice(0, 5);
    const lines = [
      'Brooke Air Product Selector V2 summary',
      '',
      'Inputs:',
      `Air function: ${state.air_function || 'Not specified'}`,
      `Mounting: ${state.mounting || 'Not specified'}`,
      `Application: ${state.application || 'Not specified'}`,
      `Airflow: ${state.airflow || 'Not specified'} l/s`,
      `Special: ${state.special.join(', ') || 'None'}`,
      '',
      'Top recommendations:',
      ...ranked.map((r, i) => `${i+1}. ${r.product.product_name} (${r.product.product_code}) - score ${r.score}`)
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'brookeair-selector-summary.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
  }

  init();
})();
