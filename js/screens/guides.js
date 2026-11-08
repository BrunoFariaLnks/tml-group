// Guides: how to do each thing, with the official GOV.UK page.
import { GUIDES } from '../guides.js';

const ORDER = ['approval', 'bank', 'active', 'cs', 'accounts', 'ctPay', 'ctReturn', 'sh01', 'certs', 'change', 'vat', 'selfAssessment', 'records'];

export function view(state, { esc, params }) {
  const g = GUIDES[params];
  if (g) {
    return `
    <header class="page-head"><div><a class="back" href="#guides">All guides</a><h1 class="page-title">${esc(g.title)}</h1><p class="page-sub">${esc(g.what)}</p></div></header>
    <div class="guide">
      <section class="card"><h3>When</h3><p>${esc(g.when)}</p></section>
      <section class="card"><h3>Where</h3><p>${esc(g.where[0])}</p><a class="btn small" href="${esc(g.where[1])}" target="_blank" rel="noopener">Open the official page</a></section>
      <section class="card"><h3>What you need</h3><ul class="bul">${g.need.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></section>
      <section class="card"><h3>Cost</h3><p>${esc(g.cost)}</p></section>
      <section class="card span"><h3>Steps</h3><ol class="steps">${g.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></section>
      <section class="card span late"><h3>If it's late</h3><p>${esc(g.late)}</p></section>
      <p class="hint span">Checked against <a href="${esc(g.source)}" target="_blank" rel="noopener">GOV.UK</a> on 8 November 2026. If the official page says something different, the official page is right.</p>
    </div>`;
  }
  return `
  <header class="page-head"><div><h1 class="page-title">Guides</h1><p class="page-sub">What each deadline means and how to do it, step by step.</p></div></header>
  <ul class="list card list-card">${ORDER.map((k) => `
    <li><a class="row guide-row" href="#guides/${k}"><span><span class="row-title">${esc(GUIDES[k].title)}</span><br><span class="row-meta">${esc(GUIDES[k].when)}</span></span><span class="chev" aria-hidden="true">›</span></a></li>`).join('')}</ul>`;
}
