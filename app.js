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

  function scoreProduct(product) {
    let score = 0;
    const reasons = [];
    const warnings = [];
    const textBlob = [product.product_name, product.product_code, product.product_family, product.product_category, product.description, product.primary_function, product.mounting_location, product.notes].join(' ');

    if (state.family && product.product_family !== state.family) score -= 100;
    if (state.keyword) {
      if (contains(textBlob, state.keyword)) { score += 14; reasons.push(`Matches keyword "${state.keyword}".`); }
      else score -= 12;
    }

    if (state.air_function) {
      if (contains(product.primary_function, state.air_function) || (state.air_function === 'Return' && contains(product.primary_function, 'Extract'))) {
        score += 25; reasons.push(`Matches ${state.air_function.toLowerCase()} duty.`);
      } else {
        score -= 10; warnings.push(`Primary function is ${product.primary_function || 'not defined'}, not clearly ${state.air_function}.`);
      }
    }

    if (state.mounting) {
      if (contains(product.mounting_location, state.mounting) || contains(product.description, state.mounting)) {
        score += 22; reasons.push(`Suitable for ${state.mounting.toLowerCase()} installation.`);
      } else {
        score -= 6;
      }
    }

    if (state.application) {
      const app = productApps.find(x => x.product_code === product.product_code && x.application_name === state.application);
      if (app) {
        if (normalise(app.suitability).includes('suitable') || normalise(app.suitability).includes('preferred')) score += 28;
        reasons.push(app.reason || `Listed for ${state.application}.`);
      } else if (contains(textBlob, state.application)) {
        score += 8;
      }
    }

    const prodFeatures = features.filter(f => f.product_code === product.product_code).map(f => `${f.feature} ${f.value} ${f.notes}`).join(' ');
    for (const special of state.special) {
      const s = normalise(special);
      const match = contains(textBlob, special) || contains(prodFeatures, special) ||
        (s.includes('long') && contains(textBlob, 'long')) ||
        (s.includes('continuous') && (contains(textBlob, 'continuous') || contains(prodFeatures, 'continuous'))) ||
        (s.includes('curved') && (contains(textBlob, 'curved') || contains(prodFeatures, 'curved'))) ||
        (s.includes('clean') && (contains(textBlob, 'clean') || contains(textBlob, 'laminar'))) ||
        (s.includes('high free') && contains(textBlob, 'free area'));
      if (match) { score += 12; reasons.push(`Matches special requirement: ${special}.`); }
    }

    const airflow = Number(state.airflow || 0);
    if (airflow > 0) {
      if (airflow > 500 && contains(textBlob, 'high')) { score += 6; reasons.push('High-capacity product language matches higher airflow.'); }
      if (airflow > 600 && product.product_code === 'AL-DRJ-DF') { score += 12; reasons.push('Drum Jet should be considered for larger volume / long throw duties.'); }
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
        if (action.includes('recommend') || action.includes('inclusion')) score += Math.min(25, Number(rule.priority || 50) / 4);
        if (action.includes('warn') || action.includes('exclude')) warnings.push(rule.reason || rule.recommendation);
        reasons.push(rule.recommendation || rule.reason);
      }
    }

    if (product.v1_status && normalise(product.v1_status).includes('needs')) warnings.push('Included in V1 but needs manual datasheet/performance data.');
    if (!reasons.length) reasons.push('General catalogue match. Check full datasheet before issue.');
    return { product, score: Math.round(score), reasons: unique(reasons).slice(0, 5), warnings: unique(warnings).slice(0, 3) };
  }

  function renderRecommendations() {
    const ranked = products.map(scoreProduct).filter(x => x.score > -50).sort((a, b) => b.score - a.score || a.product.product_name.localeCompare(b.product.product_name));
    $('resultCount').textContent = `${ranked.length} product families shown. Top results are guidance only.`;
    $('recommendations').innerHTML = ranked.slice(0, 12).map((r, idx) => productCard(r, idx)).join('') || '<p>No products match the current filters.</p>';
  }

  function productCard(r, idx) {
    const p = r.product;
    const vars = variants.filter(v => v.product_code === p.product_code).slice(0, 6).map(v => v.variant_code).join(', ');
    const acc = productAccessories.filter(pa => pa.product_code === p.product_code).slice(0, 6).map(pa => pa.accessory_code).join(', ');
    const perf = performanceSources.find(ps => ps.product_code === p.product_code);
    const sizes = sizeLimits.find(s => s.product_code === p.product_code);
    return `<article class="card ${idx===0?'top':''}">
      <div class="card-header"><div><h3>${escapeHtml(p.product_name)}</h3><p class="code">${escapeHtml(p.product_code)}</p></div><div class="score">${r.score}</div></div>
      <p class="meta">${escapeHtml(p.product_family)} · ${escapeHtml(p.product_category)} · ${escapeHtml(p.material || '')}</p>
      <p>${escapeHtml(p.description || '')}</p>
      <div>${vars ? `<span class="badge">Variants: ${escapeHtml(vars)}</span>` : ''}${acc ? `<span class="badge">Accessories: ${escapeHtml(acc)}</span>` : ''}${perf ? `<span class="badge warn">${escapeHtml(perf.data_type)} data</span>` : ''}</div>
      ${sizes ? `<p class="meta">Size limits: ${escapeHtml(sizeSummary(sizes))}</p>` : ''}
      <ul class="reason-list">${r.reasons.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>
      ${r.warnings.length ? `<div>${r.warnings.map(w => `<span class="badge bad">${escapeHtml(w)}</span>`).join('')}</div>` : ''}
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
    const productTypes = unique(compatibility.map(c => c.product_type)).sort();
    $('compatProduct').innerHTML = productTypes.map(x => `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('');
    $('compatGroup').innerHTML = unique(compatibility.map(c => c.option_group)).map(x => `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('');
    ['compatProduct','compatGroup'].forEach(id => $(id).addEventListener('change', () => { renderCompatOptions(); renderCompat(); }));
    $('compatOption').addEventListener('change', renderCompat);
    renderCompatOptions();
    renderCompat();
  }

  function renderCompatOptions() {
    const product = $('compatProduct').value;
    const group = $('compatGroup').value;
    const opts = compatibility.filter(c => c.product_type === product && c.option_group === group).map(c => c.option_code);
    $('compatOption').innerHTML = unique(opts).map(x => `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('');
  }

  function renderCompat() {
    const product = $('compatProduct').value;
    const group = $('compatGroup').value;
    const option = $('compatOption').value;
    const rec = compatibility.find(c => c.product_type === product && c.option_group === group && c.option_code === option);
    let cls = 'na', title = 'Not found', msg = 'No compatibility record found for this combination.';
    if (rec) {
      if (rec.allowed) { cls = 'ok'; title = 'Allowed'; msg = `${option} is compatible with ${product}.`; }
      else if (rec.not_applicable) { cls = 'na'; title = 'Not applicable / check manually'; msg = `${option} is marked as not applicable or not normally used with ${product}.`; }
      else { cls = 'no'; title = 'Not allowed'; msg = `${option} is marked as incompatible with ${product}.`; }
    }
    $('compatResult').className = `compat-result ${cls}`;
    $('compatResult').innerHTML = `<h3>${title}</h3><p>${escapeHtml(msg)}</p><p class="meta">Source: Grille compatibility matrix.</p>`;

    const rows = compatibility.filter(c => c.product_type === product && c.option_group === group);
    $('compatTable').innerHTML = `<table><thead><tr><th>Option</th><th>Status</th><th>Meaning</th></tr></thead><tbody>${rows.map(r => `<tr><td>${escapeHtml(r.option_code)}</td><td>${escapeHtml(r.status)}</td><td>${r.allowed ? '<span class="badge good">Allowed</span>' : r.not_applicable ? '<span class="badge warn">Not applicable</span>' : '<span class="badge bad">Not allowed</span>'}</td></tr>`).join('')}</tbody></table>`;
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
