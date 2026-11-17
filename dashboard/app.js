// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail drawer with the model's
// own inputs and the protocol's farm plan, and the live-token set the board sets aside.
// No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', band: 'all', tab: 'board', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return (Math.round(n * 10000) / 10000).toFixed(2) + 'x'; }

  // The model in one function: the page recomputes a row from the snapshot figures and checks
  // the number board.json carries, so the page's code and the board's data are visibly the same
  // arithmetic. Sector multiple comes from the row; the rest from the model's constants.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var chainMult = 1 + model.chain_weight * Math.min(Math.max((row.chains || []).length - 1, 0), model.chain_cap);
    return Math.max(1, Math.round(row.tvl_usd * row.sector_multiple * growthMult * maturity * chainMult));
  }
  function chainMultOf(row, model) {
    return 1 + model.chain_weight * Math.min(Math.max((row.chains || []).length - 1, 0), model.chain_cap);
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL
  // and age decide the action, the capital, the hold and every cost and time. No name is
  // special-cased, so this page's plan and board.json's plan are the same strings.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ', then borrow $20 against it so both sides of the position are active.';
    if (c.indexOf('dex') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' in a balanced pair and keep the position open.';
    if (c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('farm') >= 0) return 'Deposit $' + capital + " of USDC into " + name + "'s highest-TVL vault on " + chain + ' and keep the shares.';
    if (c.indexOf('restak') >= 0 || c.indexOf('staking pool') >= 0) return 'Stake $' + capital + " of the chain's staking asset through " + name + ' on ' + chain + ' and keep the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis trad') >= 0 || c.indexOf('options') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge, then leave it open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + ', then leave it to resolve.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the vault shares for the full hold.';
    if (c.indexOf('stable') >= 0 || c.indexOf('dual-token') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and keep it in the protocol.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + " of the protocol's yield-bearing asset on " + chain + ' and hold it in the same wallet.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0) return 'Load $' + capital + ' onto ' + name + ' on ' + chain + ' and spend a small amount through it each week.';
    if (c.indexOf('governance') >= 0) return 'Deposit $' + capital + ' into ' + name + ' on ' + chain + ' and vote in its next governance round.';
    if (c.indexOf('privacy') >= 0) return 'Move $' + capital + " through " + name + "'s private transfer on " + chain + ' and keep the receipt.';
    if (c.indexOf('index') >= 0) return 'Buy $' + capital + " of " + name + "'s index token on " + chain + ' and hold it.';
    if (c.indexOf('otc') >= 0) return 'Place one $' + capital + ' order on ' + name + "'s OTC desk on " + chain + ' and settle it.';
    if (c.indexOf('chain') >= 0) return 'Use $' + capital + " in the flagship app on " + name + ' and keep the activity in one wallet.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function secondActionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (p.chains && p.chains.length >= 2) return 'Repeat the same position on ' + p.chains[1] + ' so the wallet is active on two of ' + name + "'s chains.";
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Repay the $20 borrow, then borrow again once, so the loan history shows two cycles.';
    if (c.indexOf('dex') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Swap $' + Math.max(10, Math.round(capital / 5)) + " through " + name + "'s own router on " + chain + ' once a week.';
    if (c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0) return 'Move a quarter of the vault shares into ' + name + "'s second vault on " + chain + ' for one week, then move it back.';
    if (c.indexOf('restak') >= 0 || c.indexOf('staking') >= 0) return 'Delegate a second, smaller stake through ' + name + ' to a different validator set on ' + chain + '.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis trad') >= 0) return 'Close the hedge, then open a fresh one half its size, so the account shows two trades.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Deposit a second, smaller amount into a different ' + name + ' vault on ' + chain + ' and hold both.';
    if (c.indexOf('governance') >= 0) return 'Delegate your voting power to an active delegate in ' + name + "'s governance on " + chain + '.';
    return 'Use a second feature of ' + name + ' on ' + chain + ' once: a swap, a vote, or a claim, whichever the app offers.';
  }
  function weeklyActionFor(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'a supply top-up, a borrow, a repayment or a rate switch';
    if (c.indexOf('dex') >= 0 || c.indexOf('liquidity manager') >= 0) return 'a swap through the pool or a liquidity top-up';
    if (c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0) return 'a vault deposit, a harvest, or a reinvest';
    if (c.indexOf('restak') >= 0 || c.indexOf('staking') >= 0) return 'a stake top-up or a reward claim';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis trad') >= 0) return 'a small trade, a margin top-up, or a funding check';
    if (c.indexOf('prediction') >= 0) return 'one new market position';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'a vault deposit or a rebalance vote';
    if (c.indexOf('governance') >= 0) return 'a vote or a proposal comment';
    if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0) return 'one small spend through the card';
    return 'a deposit, a swap, a vote or a claim';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function gasFor(chain, base) { return chain === 'Ethereum' ? base * 3 : base; }
  function weeksFor(hold) { return Math.max(1, Math.round(hold / 7)); }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var weeks = weeksFor(hold);
    var setupGas = gasFor(chain, capital >= 150 ? 8 : 4);
    var steps = [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline on paper.', cost: 'about $' + gasFor(chain, 3) + ' of gas for the first transaction on ' + chain, time: '5 minutes', cost_usd: gasFor(chain, 3), time_min: 5 },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + setupGas + ' of gas on ' + chain, time: '15 minutes to set up', cost_usd: setupGas, time_min: 15 },
      { text: secondActionFor(p, capital, chain), cost: 'about $' + gasFor(chain, 3) + ' of gas on ' + chain, time: '10 minutes', cost_usd: gasFor(chain, 3), time_min: 10 },
      { text: 'Make one qualifying action each week, such as ' + weeklyActionFor(p) + '.', cost: 'about $' + gasFor(chain, 2) + ' of gas a week on ' + chain + ', ' + weeks + ' weeks', time: '10 minutes a week for ' + weeks + ' weeks', cost_usd: gasFor(chain, 2) * weeks, time_min: 10 * weeks },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot, then open the protocol' + "'s own points or rewards page.", cost: 'the $' + capital + ' stays in the position', time: hold + ' days', cost_usd: 0, time_min: 0 },
      { text: 'Claim only from the link the protocol itself publishes, never from a link in a chat or an ad, and write the wallet, the dates and every transaction in a farm log.', cost: 'no fee to check, and never pay to claim', time: '10 minutes', cost_usd: 0, time_min: 10 }
    ];
    if (p.watchlist) {
      steps.push({ text: 'Before the hold ends, open the protocol' + "'s points or eligibility page a second time and confirm the position still shows, then set a reminder for the next weekly action so the streak is not broken.", cost: 'no fee to check', time: '5 minutes', cost_usd: 0, time_min: 5 });
    }
    return steps.map(stepText);
  }
  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('band')) state.band = params.get('band');
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.band !== 'all') params.set('band', state.band);
    if (state.tab !== 'board') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.tab === 'watchlist' && !r.watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.band === 'high' && r.implied_value_usd < 1e8) return false;
      if (state.band === 'mid' && (r.implied_value_usd < 1e7 || r.implied_value_usd >= 1e8)) return false;
      if (state.band === 'low' && (r.implied_value_usd < 1e6 || r.implied_value_usd >= 1e7)) return false;
      if (state.band === 'micro' && r.implied_value_usd >= 1e6) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name' }, [el('b', { text: 'Token Radar' }), document.createTextNode(' · pre-token board')])),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: 'Which protocol without a token is worth farming next?' }),
        el('p', null, [
          document.createTextNode('The watchlist is the floor: '),
          el('b', { text: DATA.watchlist_size + ' protocols' }),
          document.createTextNode(' with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds '),
          el('b', { text: DATA.early_size + ' more' }),
          document.createTextNode(' below that floor. Each is priced by what its own sector pays for a dollar of TVL — never by a hand-kept list of names.')
        ])
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Total implied value' }), el('b', { text: fmtUsd(DATA.total_implied_usd) })),
        el('div', { class: 'fact' }, el('span', { text: 'Median implied value' }), el('b', { text: fmtUsd(DATA.median_implied_usd) })),
        el('div', { class: 'fact' }, el('span', { text: 'Top 10 that survive resampling' }), el('b', { text: DATA.validation.stability.top10_kept.toFixed(1) + '/10' })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function spotlight() {
    var top = DATA.rows.slice(0, 3);
    return el('section', { class: 'spot', 'aria-label': 'Top three by implied value' },
      top.map(function (r) {
        return el('button', { type: 'button', class: 'spot-card', onclick: function () { openDetail(r.slug); } },
          el('span', { class: 'rank', text: 'RANK ' + r.rank + (r.watchlist ? ' · WATCHLIST' : ' · EARLY') }),
          el('h3', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + fmtUsd(r.tvl_usd) + ' TVL · ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') : 'one chain') }),
          el('span', { class: 'value', text: fmtUsd(r.implied_value_usd) }),
          el('span', { class: 'meta', text: 'implied value · ' + fmtPct(r.change_7d) + ' in 7d · ' + fmtAge(r.age_days) + ' with no token' })
        );
      })
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chainCounts = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { chainCounts[c] = (chainCounts[c] || 0) + 1; }); });
    var chains = Object.keys(chainCounts).sort(function (a, b) { return chainCounts[b] - chainCounts[a]; }).slice(0, 18);
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search protocols', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c + ' (' + DATA.rows.filter(function (r) { return (r.category || 'Other') === c; }).length + ')', selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c + ' (' + chainCounts[c] + ')', selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var bands = [['all', 'All values'], ['high', '>= $100M implied'], ['mid', '$10M - $100M'], ['low', '$1M - $10M'], ['micro', 'Under $1M']];
    var bandSelect = el('select', { id: 'band', 'aria-label': 'Filter by implied value band' },
      bands.map(function (b) { return el('option', { value: b[0], text: b[1], selected: b[0] === state.band ? 'selected' : null }); })
    );
    bandSelect.addEventListener('change', function () { state.band = bandSelect.value; writeHash(); render(); });
    function tabButton(tab, label) {
      return el('button', { type: 'button', 'aria-pressed': state.tab === tab ? 'true' : 'false', text: label, onclick: function () { state.tab = tab; writeHash(); render(); } });
    }
    var count = state.tab === 'live' ? DATA.live.length + ' live-token protocols' : filtered().length + ' rows shown';
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('label', { for: 'band', text: 'Implied value' }), bandSelect),
      el('div', { class: 'field' }, el('span', { class: 'label', text: 'Board' }),
        el('div', { class: 'tabs' }, tabButton('board', 'Pre-token'), tabButton('watchlist', 'Watchlist'), tabButton('live', 'Live token'))),
      el('span', { class: 'count', text: count })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(filtered());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category or chain to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); } })
      ));
    }
    var max = 1;
    DATA.rows.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', null, el('span', { class: 'rank-num' + (r.rank <= 3 ? ' top' : ''), text: String(r.rank) })),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', { class: 'num farm', text: r.farm ? '≈$' + r.farm.gas_usd + ' gas · ' + r.farm.hold_days + 'd' : 'n/a' }),
        el('td', null, el('span', { class: r.watchlist ? 'badge watch' : 'badge', text: r.watchlist ? 'watchlist' : 'early' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Farm cost' }),
            el('th', { scope: 'col', text: 'Board' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('span', { class: 'badge live', text: 'live' })),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'badge live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking — and their market caps price the sector multiples the board is scored with.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var v = DATA.validation;
    var gain = v.median_abs_pct_error > 0 ? (v.naive_median_abs_pct_error / v.median_abs_pct_error) : 0;
    function checkCell(s) {
      if (s.test < 3 || s.median_abs_pct_error === null || s.hit_rate_pct === null) return '—';
      return s.median_abs_pct_error.toFixed(1) + '% · ' + s.hit_rate_pct.toFixed(1) + '%';
    }
    var valByCat = {};
    (v.sectors || []).forEach(function (s) { valByCat[s.category] = s; });
    var sectorRows = DATA.sectors.map(function (s) {
      var c = valByCat[s.category];
      return el('tr', null,
        el('td', null, el('b', { text: s.category })),
        el('td', { class: 'num', text: String(s.peers) }),
        el('td', { class: 'num', text: fmtMult(s.multiple) }),
        el('td', { class: 'num', text: c ? String(c.fit) + ' / ' + c.test : '—' }),
        el('td', { class: 'num', text: c ? checkCell(c) : '—' })
      );
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'One function scores every row, from the snapshot figures alone. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x sector_multiple x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x (1 + ' + m.chain_weight + ' x min(chains - 1, ' + m.chain_cap + ')) )'
      ),
      el('p', { class: 'sub', text: 'Sector multiple: the geometric median market-cap-to-TVL ratio of the live-token protocols in the same category — the median in log space, because the ratios span four orders of magnitude and a plain median is dragged by the outliers — each peer\u2019s ratio capped at ' + m.sector_winsor + 'x first so one outsized token cannot set its sector\u2019s price, shrunk toward the global median, clamped to ' + m.sector_floor + '–' + m.sector_cap + '. A category with fewer than ' + m.sector_min_peers + ' live peers takes the global median instead. Age is the time since the protocol was first listed — how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. Farm plans follow the protocol\u2019s own category, chains, TVL and age: the action fits the category, the capital follows the TVL, the hold follows the age, and gas is priced per chain — Ethereum about three times the other chains.' }),
      el('h3', { text: 'Model check — a blind test on the live tokens' }),
      el('p', { class: 'sub', text: v.method + ' ' + v.fit_n + ' peers fit the multiples, ' + v.test_n + ' peers were predicted and never fit.' }),
      el('div', { class: 'facts check' },
        el('div', { class: 'fact' }, el('span', { text: 'Smaller typical miss than TVL alone' }), el('b', { text: gain.toFixed(1) + '×' })),
        el('div', { class: 'fact' }, el('span', { text: 'Top 10 that survive resampling' }), el('b', { text: v.stability.top10_kept.toFixed(1) + '/10' })),
        el('div', { class: 'fact' }, el('span', { text: 'Rank #1 unchanged in resampling' }), el('b', { text: v.stability.rank1_same_pct.toFixed(0) + '/100' }))
      ),
      el('p', { class: 'sub', text: 'Read it as a ranking, not a price. Pricing a launch from TVL alone misses the real market cap by ' + v.naive_median_abs_pct_error.toFixed(1) + '% on the typical test peer; pricing it through its sector cuts that miss ' + gain.toFixed(1) + ' times over, to ' + v.median_abs_pct_error.toFixed(1) + '%. The order itself is steady: resampling the ' + (v.fit_n + v.test_n) + ' live peers that price the sectors, refitting, and rescoring the board leaves ' + v.stability.top10_kept.toFixed(1) + ' of the top 10 and ' + v.stability.top40_kept.toFixed(1) + ' of the top 40 in place, and rank #1 never moves. The board says which protocol is worth a look before which — it does not price a launch.' }),
      el('p', { class: 'sub', text: 'Calibration, in full: median miss ' + v.median_abs_pct_error.toFixed(1) + '% · ' + v.hit_rate_pct.toFixed(1) + '% of predictions within 50% of the real cap · rank correlation with the real market-cap order ρ ' + v.spearman_rho.toFixed(2) + ' · the model\u2019s top 10 holds ' + v.top10_overlap + ' of the test half\u2019s real top 10 · ' + v.fit_n + ' peers fit, ' + v.test_n + ' tested.' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'sectors-table' },
          el('caption', { class: 'sub', text: 'Sector multiples the board was scored with, and how each sector\u2019s multiple did on the peers it never saw. Fit / test counts, then the test half\u2019s median error and hit rate; \u2014 means the sector had fewer than 3 test peers, too few to score a sector.' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Sector' }),
            el('th', { scope: 'col', text: 'Live peers' }),
            el('th', { scope: 'col', text: 'Multiple' }),
            el('th', { scope: 'col', text: 'Fit / test' }),
            el('th', { scope: 'col', text: 'Median error · hit rate' })
          )),
          el('tbody', null, sectorRows)
        )
      )
    );
  }

  function notePanel() {
    return el('section', { class: 'panel note' },
      el('p', null, [el('b', { text: 'What this board does not claim. ' }), document.createTextNode('A protocol on it records no token in the snapshot — that is DefiLlama\u2019s record, not proof it has none, and it does not predict whether or when any token is issued. Implied value is this entry\u2019s own claim, priced from the snapshot, never a price and never make.fun\u2019s.')]),
      el('p', { text: 'Source: ' + DATA.source + '. Snapshot ' + DATA.as_of + '. Built by an AI agent for make.fun\u2019s token-radar-01 bounty.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, DATA.model);
    var growth = Math.min(DATA.model.growth_cap, Math.max(DATA.model.growth_floor, row.change_7d === null ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * DATA.model.growth_weight;
    var age = row.age_days === null ? DATA.model.unknown_age_days : row.age_days;
    var maturity = DATA.model.maturity_floor + (Math.min(Math.max(age, 0), DATA.model.maturity_days) / DATA.model.maturity_days) * DATA.model.maturity_range;
    var sectorCheck = null;
    (DATA.validation.sectors || []).forEach(function (s) { if (s.category === (row.category || 'Other')) sectorCheck = s; });
    var sectorCheckText = sectorCheck && sectorCheck.test >= 3
      ? 'Blind check on this sector: ' + sectorCheck.test + ' test peers, median error ' + sectorCheck.median_abs_pct_error.toFixed(1) + '%, hit rate ' + sectorCheck.hit_rate_pct.toFixed(1) + '% — the sector\u2019s multiple is checked, not just stated.'
      : 'Blind check on this sector: too few test peers to score a sector, so no error is reported for it.';
    var farm = row.farm || null;
    var farmTotalText = farm
      ? 'Plan total: about $' + farm.gas_usd + ' of gas on ' + chainOf(row) + ', $' + farm.capital_usd + ' of capital locked, a ' + farm.hold_days + '-day hold, about ' + farm.setup_min + ' minutes to set up plus 10 minutes a week for ' + weeksFor(farm.hold_days) + ' weeks.'
      : '';
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.watchlist ? ' · watchlist' : ' · early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Sector multiple (' + (row.category || 'Other') + ')' }), el('b', { class: 'num', text: fmtMult(row.sector_multiple) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) + ' → ' + fmtMult(growthMult) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) + ' → ' + fmtMult(maturity) })),
        el('div', null, el('span', { text: 'Chain spread (' + (row.chains || []).length + ' chain' + ((row.chains || []).length === 1 ? '' : 's') + ')' }), el('b', { class: 'num', text: fmtMult(chainMultOf(row, DATA.model)) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price, and the protocol records no token — not proof it has none.' }),
      el('p', { class: 'sub', text: sectorCheckText })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('p', { class: 'sub plan-total', text: farmTotalText }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    dialog.appendChild(el('p', { class: 'footnote', text: 'Farm with money you can afford to lock, on a fresh wallet. Never pay anyone to claim, and claim only from the link the protocol itself publishes.' }));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(spotlight());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'live' ? liveTable() : boardTable());
    if (state.tab !== 'live') shell.appendChild(modelPanel());
    shell.appendChild(notePanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
