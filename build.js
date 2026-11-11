#!/usr/bin/env node
// Builds the static site from data/content.js using the Webflow components in src/.
// Usage: node build.js
// Writes index.html, about-us.html, contact-us.html and services/*.html, and creates any missing images/placeholder-*.svg files.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const { site, services, pages } = require('./data/content.js');

const read = f => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8').trim();
const icons = Object.fromEntries(['arrow', 'arrow-nav', 'chevron', 'chevron-mobile', 'quote', 'faq-arrow', 'logo', 'pin', 'monogram', 'contact-email', 'contact-phone', 'contact-map'].map(n => [n, read(`icons/${n}.svg`)]));
const shell = Object.fromEntries(['head-style', 'body-css', 'rf-grid', 'cursor', 'video-modal', 'swiper-style'].map(n => [n, read(`shell/${n}.html`)]));

const placeholders = new Map(); // image path -> label
const warnings = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugify = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const attrs = o => Object.entries(o).filter(([, v]) => v !== undefined && v !== false).map(([k, v]) => (v === true ? ` ${k}=""` : ` ${k}="${esc(v)}"`)).join('');

// Page context: `root` is the relative prefix back to the site root ("" or "../").
let page = null;
let root = '';

// Resolve a content href for the current page.
function url(href) {
  if (!href || href === '#') return '#';
  if (!href.startsWith('/')) return href;
  const [file, hash] = href.slice(1).split('#');
  if (file === page.path) return hash ? `#${hash}` : root + file;
  return root + file + (hash ? `#${hash}` : '');
}
const linkAttrs = item => attrs({ href: url(item.href), 'data-todo': item.todo });

function img(src, label) {
  if (src.startsWith('images/placeholder-')) placeholders.set(src, label);
  return root + src;
}

// "A Simple Process. Powerful Results." -> ash first sentence(s), black last sentence.
function headline(text, tag = 'h2', cls = 'heading-style-h1 text-color-ash') {
  const parts = text.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g).map(s => s.trim());
  const inner = parts.length > 1
    ? `${esc(parts.slice(0, -1).join(' '))} <span class="text-color-black">${esc(parts[parts.length - 1])}</span>`
    : `<span class="text-color-black">${esc(text)}</span>`;
  return `<${tag} class="${cls}">${inner}</${tag}>`;
}

function kicker(text) {
  return `<div color-white="0" data-anim="" transition-delay="" class="headshot-text"><div class="text-style-kicker text-color-ash">${esc(text)}</div></div>`;
}

function sectionHead(s) {
  if (!s.eyebrow && !s.headline && !s.body) return '';
  return `<div class="flex-verti gap-1-87rem">${s.eyebrow ? kicker(s.eyebrow) : ''}${s.headline ? headline(s.headline) : ''}${s.body ? `<p class="text-size-large text-color-ash max-width-44rem">${esc(s.body)}</p>` : ''}</div>`;
}

function section(s, inner, cls = 'section') {
  return `<section${attrs({ id: s.id })} class="${cls}"><div class="padding-global padding-section-large"><div class="flex-verti gap-6-25rem">${sectionHead(s)}${inner}</div></div></section>`;
}

function button(b, extra = {}) {
  return `<a${attrs({ class: 'btn w-inline-block', 'btn-medium': '0', 'hover-icon-white': true, 'icon-last': '1', href: url(b.href), 'data-todo': b.todo, 'btn-big': '0', 'aria-label': b.label, 'icon-small': '0', 'btn-theme': 'green, white, black', ...extra })}><div class="btn-inner"><div class="btn-icon-wrap"><div arrow-up="" class="btn-icons"><div class="btn-icons-wrap"><div class="btn-icon-arrow w-embed">${icons.arrow}</div><div class="btn-icon-arrow is-absolute w-embed">${icons.arrow}</div></div></div><div class="btn-icon-shape _1"></div><div class="btn-icon-shape _2"></div></div><div>${esc(b.label)}</div></div></a>`;
}

const tagsList = (tags, cls = 'tag color-ash') => `<div class="tags-list">${tags.map(t => `<div class="${cls}">${esc(t)}</div>`).join('')}</div>`;

// Splits "10M+" into the number the count-up animation runs on and its suffix.
function statValue(v) {
  const m = v.match(/^(\d+(?:\.\d+)?)(.*)$/);
  return m ? `<span count-up="">${m[1]}</span>${esc(m[2])}` : esc(v);
}

// ---------------------------------------------------------------------------
// Global: navigation
// ---------------------------------------------------------------------------
function navLink(item, cls, inner, key) {
  const current = item.href === '/index.html' && page.path === 'index.html';
  return `<a${attrs({ href: url(item.href), 'data-todo': item.todo, 'data-nav': key, 'aria-current': current ? 'page' : undefined, class: cls })}>${inner}</a>`;
}

function serviceLinks(cls, border) {
  return services.map(s => {
    const current = page.key === s.slug;
    return `<a${attrs({ href: url(s.href), 'aria-current': current ? 'page' : undefined, class: `${cls}${current ? ' w--current' : ''}` })}><div>${esc(s.name)}</div><div class="${border}"><div class="border for-nav-link"></div></div></a>`;
  }).join('');
}

function navButton(cls) {
  const b = site.nav.button;
  return `<div${attrs({ 'data-mailto': b.href, 'aria-label': b.label, 'book-modal-open-btn': true, class: cls })}><div class="button-inner"><div class="button-text">${esc(b.label).replace(/ /g, '&nbsp;')}</div><div class="button-icon"><div class="button-icons-wrap"><div class="btn-icon-arrow w-embed">${icons['arrow-nav']}</div><div class="btn-icon-arrow is-second w-embed">${icons['arrow-nav']}</div></div></div></div></div>`;
}

// Every top-level nav item carries the dot; only the current one (.is-current) shows it.
// The build marks Home or Services; js/revcube.js moves it to Our Work / Contact while those sections are on screen.
function nav() {
  const currentKey = page.navKey || (page.serviceName ? 'services' : 'home');
  const navKey = item => slugify(item.label);
  const mark = item => ({ 'data-nav': navKey(item), current: navKey(item) === currentKey });

  const desktop = site.nav.items.map(item => {
    const { 'data-nav': key, current } = mark(item);
    const cls = current ? ' is-current' : '';
    if (item.dropdown) {
      return `<div nav-dropdown="on-hover" class="dropdown"><div dropdown-toggle="" data-nav="${key}" class="nav-link for-dropdown${cls}"><div>${esc(item.label)}</div>${icons.chevron}<div class="dot"></div><div class="border-wrap for-nav-link"><div class="border for-nav-link"></div></div></div><div class="dropdown-body-wrap"><div class="dropdown-body"><div class="dropdown-list">${serviceLinks('nav-link dropdown-link w-inline-block', 'border-wrap for-nav-link for-dropdown-link')}</div></div></div></div>`;
    }
    return navLink(item, `nav-link w-inline-block${cls}`, `<div>${esc(item.label)}</div><div class="dot"></div><div class="border-wrap for-nav-link"><div class="border for-nav-link"></div></div>`, key);
  }).join('');

  const mobileDot = '<div class="dot for-inner-link"><div class="dot-anime"></div></div>';
  const mobile = site.nav.items.map(item => {
    const { 'data-nav': key, current } = mark(item);
    const cls = current ? ' is-current' : '';
    if (item.dropdown) {
      return `<div nav-accordion="" class="dropdown"><div nav-accordion-head="" data-nav="${key}" class="nav-menu-link-wrap${cls}"><div class="nav-menu-link">${esc(item.label)}</div>${mobileDot}${icons['chevron-mobile']}<div class="border-wrap is-transparent"><div class="border for-nav-link"></div></div></div><div data-height="" nav-accordion-body="" class="dropdown-body v2"><div class="dropdown-list v2">${serviceLinks('nav-link dropdown-link w-inline-block', 'border-wrap for-nav-link for-dropdown-link')}</div></div></div>`;
    }
    return navLink(item, `nav-menu-link w-inline-block${cls}`, `<div>${esc(item.label)}</div><div class="border-wrap is-transparent"><div class="border for-nav-link"></div></div>${mobileDot}`, key);
  }).join('');

  const social = site.footer.social.map(s => `<a${attrs({ href: url(s.href), 'data-todo': s.todo, class: 'nav-link dropdown-link' })}>${esc(s.label)}</a>`).join('');

  return `<div theme="" bg-white-not-used="" class="nav-wrap"><div class="nav-space"></div><div class="nav"><div class="nav-head"><a${attrs({ 'aria-label': `${site.logoText} home`, href: url('/index.html'), class: 'nav-brand-text' })}>${icons.logo}</a><div class="head-menu"><nav class="menu-content">${desktop}</nav></div><div class="nav-right"><div class="menu-btn"><div class="menu-btn-icon"><div class="menu-btn-line1"></div><div class="menu-btn-line2"></div><div class="menu-btn-line3"></div></div></div>${navButton('button for-nav')}</div></div><div nav-menu="" class="nav-menu"><div class="nav-body"><div class="nav-body-top"><nav class="nav-links-list">${mobile}</nav><div class="divider-line-wrap is-static"><div class="divider-line"></div></div><div class="certificate-logos-component"><div class="flex-verti _0-75rem align-left">${social}</div></div><div class="divider-line-wrap is-static"><div class="divider-line"></div></div></div><div class="nav-body-cta">${navButton('button fill')}</div></div></div><div class="nav-blur"></div></div><div class="nav-space"></div></div>`;
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------
function hero(h) {
  const crumb = page.serviceName
    ? `<nav aria-label="Breadcrumb" data-anim="" transition-delay="1" class="founder-block align-center revcube-breadcrumb"><a href="${url('/index.html')}">${esc(site.breadcrumb.home)}</a><span aria-hidden="true">&gt;</span><a href="${url('/index.html#services')}">${esc(site.breadcrumb.services)}</a><span aria-hidden="true">&gt;</span><span aria-current="page">${esc(page.serviceName)}</span></nav>`
    : '';
  const eyebrow = h.eyebrow ? `<div data-anim="" transition-delay="1" class="tag v2">${esc(h.eyebrow)}</div>` : '';
  const buttons = (h.buttons || []).length ? `<div data-anim="" transition-delay="3" class="revcube-buttons">${h.buttons.map(b => button(b)).join('')}</div>` : '';
  const bottomTags = [h.trustBadge, ...(h.highlights || [])].filter(Boolean);
  return `<section class="section-hero"><div class="padding-global height-fill z-index-2"><div class="hero-content"><div class="hero-text-block"><div class="flex-verti gap-1-87rem align-center">${crumb}${eyebrow}<div class="hero-text-wrap"><div class="hero-text"><h1 transition-delay="2" data-anim="" class="hero-heading revcube-hero-heading${h.headline.length <= 30 ? ' is-short' : ''}">${esc(h.headline)}</h1></div></div></div><p class="text-size-xlarge max-width-45rem revcube-hero-body">${esc(h.body)}</p>${buttons}</div><div class="hero-bottom">${bottomTags.length ? tagsList(bottomTags, 'tag') : '<div></div>'}</div></div></div><video hero-video="1" width="100%" muted="" playsinline="1" data-object-fit="cover" loading="lazy" data-cmp-info="10" poster="${root}images/67a4f3315ed0752da04cb941_ezgif-frame-001.webp" autoplay-mode="1" loop="" class="bg-video"><source id="video-source" src="${root}videos/hero-background.mp4" type="video/mp4"></video><div class="video-cover"></div></section>`;
}

function logos(s) {
  // The marquee needs enough logos to span the screen, so short lists are repeated.
  // Entries are a client name, or { name, image } once a real logo file exists.
  const entries = s.logos.map(l => (typeof l === 'string' ? { name: l } : l));
  const names = [];
  while (names.length < 12) names.push(...entries);
  // `showName` puts the name beside a small icon (used for the tools strip).
  const list = names.map(l => {
    const src = img(l.image || `images/placeholder-logo-${slugify(l.name)}.svg`, l.name);
    return l.showName
      ? `<div role="listitem" class="logo-wrap w-dyn-item revcube-tool"><img src="${src}" loading="lazy" alt="" class="revcube-tool-icon"><span>${esc(l.name)}</span></div>`
      : `<div role="listitem" class="logo-wrap w-dyn-item"><img src="${src}" loading="lazy" alt="${esc(l.name)}" class="fit-contain"></div>`;
  }).join('');
  const col = `<div class="logos-col-wrap w-dyn-list"><div role="list" class="logos-list w-dyn-items">${list}</div></div>`;
  return `<section class="section overflow-hidden for-logos"><div class="padding-global"><div class="intro-images"><div class="flex-verti gap-3-12rem revcube-logos">${s.eyebrow ? `<div class="padding-global">${kicker(s.eyebrow)}</div>` : ''}<div class="logos-component"><div class="logos-marque"><div class="logos-track"><div marquee="logos" class="logos">${col}${col}</div></div></div></div><div class="padding-global"><div class="divider-line"></div></div></div></div></div></section>`;
}

// Statement block: small kicker and badge on the left, large two-tone statement on the right.
// In `statement`, **text** is shown in black; the rest is grey.
function intro(s) {
  const statement = esc(s.statement).replace(/\*\*(.+?)\*\*/g, '<span class="text-color-black">$1</span>');
  const badge = s.badge ? `<div class="divider-line"></div><div class="award-batch">${icons.monogram}<div class="award-text-block"><div data-split="lines" anim-lines="">${esc(s.badge.title)}</div><div data-split="lines" anim-lines="" class="text-color-ash">${esc(s.badge.subtitle)}</div></div></div>` : '';
  // With `link`, the kicker + badge block is one link (normal page load, not a Barba transition).
  const details = `<h2 class="text-style-kicker text-color-ash">${esc(s.kicker)}</h2>${badge}`;
  const left = s.link
    ? `<a${attrs({ href: url(s.link.href), 'aria-label': s.link.label, 'data-todo': s.link.todo, 'data-barba-prevent': 'self', class: 'intro-details revcube-intro-link' })}>${details}</a>`
    : `<div class="intro-details">${details}</div>`;
  return `<section${attrs({ id: s.id })} class="section"><div class="padding-global padding-section-large"><div class="flex-verti custom-gap"><div class="grid-layout _2-9">${left}<div class="intro-text"><h3 anim-lines="" data-split="lines" class="text-style-statement h1-mobile text-color-ash is-home">${statement}</h3></div></div></div></div></section>`;
}

// Full-width looping preview video; clicking it opens the full video (with sound) in the player modal.
// The empty project-grid block is what the remote script's scroll-scale animation hooks onto.
function showreel(s) {
  const id = s.id || 'showreel';
  const modal = shell['video-modal'].replace('{{id}}', esc(id)).replace('{{src}}', root + esc(s.video));
  return `${modal}<section project-grid__wrapper="section" class="section overflow-hidden"><div class="padding-global"><div data-cursor-intro="3" open-modal="${esc(id)}" class="bg-element for-gallery"><video width="100%" muted="" playsinline="1" data-object-fit="cover" loading="lazy" data-cmp-info="10" poster="" loop="" autoplay-mode="1" class="bg-video"><source id="video-source" src="${root}${esc(s.preview)}" type="video/mp4"></video></div><div class="intro-images hide"><div project-grid__wrapper-animation="" class="project-grid__wrapper"><div class="project-grid__inner-wrap"><div project-images-list-wrap="1" class="project-images-list-wrap"></div><div project-images-list-wrap="2" class="project-images-list-wrap is-big"></div><div project-images-list-wrap="3" class="project-images-list-wrap"></div></div></div></div></div></section>`;
}

// Dark statement section with the curved panorama slider (the remote script loads Swiper when
// .panorama-slider is on the page). In `statement`, **text** is highlighted.
function industries(s) {
  const statement = esc(s.statement).replace(/\*\*(.+?)\*\*/g, '<span class="text-color-green">$1</span>');
  const slides = s.items.map(item => {
    const label = esc(item.label);
    return `<div role="listitem" class="swiper-slide for-pp w-dyn-item"><div class="pp-slide-content"><div class="pp-slide-img-wrap"><img src="${img(item.image || `images/placeholder-industry-${slugify(item.label)}.svg`, item.label)}" loading="lazy" alt="${label}" class="pp-slide-img"></div><div class="pp-slide-content-text">${label}</div></div></div>`;
  }).join('');
  return `<section${attrs({ id: s.id })} section-tab="" theme-dark="" class="section for-home-pp"><div class="padding-global padding-section-large padding-bottom-0"><div class="flex-verti align-center gap-1-87rem"><div>${kicker(s.kicker)}</div><h2 class="max-width-xlarge heading-style-h1">${statement}</h2></div></div><div class="panorama-slider">${shell['swiper-style']}<div class="swiper w-dyn-list"><div role="list" class="swiper-wrapper for-pp w-dyn-items">${slides}</div></div></div></section>`;
}

// Service cards in a grid: icon (src/icons/services/<slug>.svg), name, description and link text.
function serviceCards(s) {
  const items = s.items.map(item => `<a href="${url(item.href)}" class="revcube-service-card"><div class="revcube-service-icon">${read(`icons/services/${item.slug}.svg`)}</div><h3 class="revcube-service-title">${esc(item.name)}</h3><p class="revcube-service-text text-color-ash">${esc(item.description)}</p><div class="revcube-service-more">${esc(s.linkText)}<span class="revcube-service-arrow">${icons.arrow}</span></div></a>`).join('');
  return section(s, `<div class="revcube-service-grid">${items}</div>`);
}

const STEP_IMAGES = ['images/67ab6224803dbad2c0fd254d_service-forge-min.webp', 'images/67ab6237a30c06333f454a89_service-ascend-min.webp', 'images/67ab62475ba9ab8c7441af31_service-tailwind-min.webp'];

function steps(s) {
  const cards = s.items.map((item, i) => {
    const pic = `<img src="${img(STEP_IMAGES[i % STEP_IMAGES.length])}" loading="lazy" alt="" class="bg">`;
    return `<div accordion="" slide-card="" role="listitem" class="slide-card w-dyn-item${i === 0 ? ' active' : ''}"><div class="slide-card-inner"><div accordion-head="" class="slide-card-head"><div class="flex-verti gap-3-12rem"><div class="tags-list for-slide-card"><div class="tag simple-style is-green">${esc(item.number)}</div></div><h3 class="text-style-display">${esc(item.title)}</h3></div><div slide-card-inner="" class="slide-card-image hide-mobile-landscape">${pic}</div></div><div accordion-body="" class="slide-card-body-wrapper"><div class="slide-card-body"><div slide-card-inner="" class="slide-card-image for-mobile">${pic}</div><div slide-card-inner="" class="slide-card-para"><div class="slide-card-rich-text w-richtext"><p>${esc(item.description)}</p></div></div></div></div></div></div>`;
  }).join('');
  return section(s, `<div class="slide-cards-wrap w-dyn-list"><div accordion-list="mobile" slide-cards="" role="list" class="slide-cards w-dyn-items revcube-steps-${s.items.length}">${cards}</div></div>`, 'section background-color-white');
}

// Hover card beside a project image, joined to it by a curved connector (frosted like the nav).
function workSummary(p) {
  if (!p.summary) return '';
  return `<div class="revcube-work-summary"><div class="revcube-work-connector" aria-hidden="true"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M0 62 C50 62 50 38 100 38" vector-effect="non-scaling-stroke"/></svg><span class="revcube-work-port is-card"></span><span class="revcube-work-port is-image"></span></div><div class="revcube-work-summary-head"><span class="text-style-kicker text-color-ash">Project Summary</span><span class="revcube-work-pill">${esc(p.subtitle)}</span></div><h3 class="revcube-work-summary-title">${esc(p.title)}</h3><p class="revcube-work-summary-text">${esc(p.summary)}</p></div>`;
}

// Images the remote script flips through (every 0.3s) while a .work-block is hovered.
function hoverStack(images) {
  if (!images || !images.length) return '';
  return `<div class="w-dyn-list"><div role="list" class="hover-images-list w-dyn-items">${images.map(src => `<div role="listitem" class="bg w-dyn-item w-dyn-repeater-item"><img src="${img(src)}" loading="lazy" alt="" class="hide-mobile-landscape"></div>`).join('')}</div></div>`;
}

function work(s) {
  const items = s.items.slice(0, s.limit || s.items.length).map(p => {
    // With `tagLimit`, show that many tags plus a "+N" tag for the rest (as the original site did).
    let shown = p.tags || [];
    if (s.tagLimit && shown.length > s.tagLimit) shown = [...shown.slice(0, s.tagLimit), `+${shown.length - s.tagLimit}`];
    const tags = shown.length ? tagsList(shown) : '';
    return `<div work-item="" role="listitem" class="flex-verti gap-5rem w-dyn-item"><div class="work-block${p.summary ? ' has-summary' : ''}">${workSummary(p)}<div work-images-block="" anim-clip-path="" data-cursor="" class="work-block-image"><img src="${img(p.image || `images/placeholder-work-${page.key}-${slugify(p.title)}.svg`, p.title)}" loading="lazy" alt="${esc(p.title)}" class="bg">${hoverStack(p.hoverImages)}</div><div class="work-block-text"><div class="flex-verti"><h2>${esc(p.title)}</h2><div class="text-size-body-l text-color-ash">${esc(p.subtitle)}</div></div>${tags}</div></div><div class="divider-line hide-mobile-landscape"></div></div>`;
  }).join('');
  const link = s.link ? `<div class="cta-footer">${button(s.link)}</div>` : '';
  return section({ ...s, id: 'work' }, `<div class="w-dyn-list"><div work-list="" role="list" class="flex-verti gap-5rem w-dyn-items">${items}</div></div>${link}`);
}

// Numbered list rows: centred caption, then number, title and detail. On hover the row pops up and a
// tilted image appears in its centre (CSS). Each item can set `image`; otherwise a placeholder is used.
function list(s) {
  const caption = [s.eyebrow, s.headline].filter(Boolean).map(esc).join(' — ');
  const rows = s.items.map((item, i) => {
    const src = img(item.image || `images/placeholder-why-${slugify(item.title)}.svg`, item.title);
    return `<div role="listitem" class="revcube-list-row"><div class="revcube-list-no">${String(i + 1).padStart(2, '0')}</div><h3 class="revcube-list-title">${esc(item.title)}</h3><p class="revcube-list-detail">${esc(item.description || '')}</p><div class="revcube-list-media" aria-hidden="true"><img src="${src}" loading="lazy" alt=""></div></div>`;
  }).join('');
  return `<section${attrs({ id: s.id })} class="section revcube-list-section"><div class="padding-global padding-section-large"><h2 class="revcube-list-caption">${caption}</h2><div role="list" class="revcube-list">${rows}</div></div></section>`;
}

function accordion(s) {
  const items = s.items.map(item => item.description
    ? `<div accordion="" role="listitem" class="faq w-dyn-item"><div accordion-head="" class="faq-head"><div class="faq-hend-inner"><div class="number-text-block"><div item-no="" class="number-text-block">-</div></div><h3 class="text-size-body-r faq-head-text">${esc(item.title)}</h3></div><div class="faq-arrow w-embed">${icons['faq-arrow']}</div></div><div accordion-body="" class="faq-body"><div class="faq-content"><p class="text-color-ash">${esc(item.description)}</p></div></div></div>`
    : `<div role="listitem" class="faq w-dyn-item"><div class="faq-head"><div class="faq-hend-inner"><div class="number-text-block"><div item-no="" class="number-text-block">-</div></div><h3 class="text-size-body-r faq-head-text">${esc(item.title)}</h3></div></div></div>`).join('');
  const extra = s.tags ? `<div class="flex-verti gap-1-87rem">${s.tagsLabel ? `<div class="text-style-kicker text-color-ash">${esc(s.tagsLabel)}</div>` : ''}${tagsList(s.tags)}</div>` : '';
  return `<section class="section background-color-white"><div class="padding-global padding-section-large"><div class="faq-gird"><div class="flex-verti gap-1-87rem is-sticky">${s.eyebrow ? kicker(s.eyebrow) : ''}${s.headline ? headline(s.headline) : ''}${s.body ? `<p class="text-size-large text-color-ash">${esc(s.body)}</p>` : ''}${extra}</div><div class="w-dyn-list"><div accordion-list="" items-list="" role="list" class="grid for-faq w-dyn-items">${items}</div></div></div></div></section>`;
}

function cardGrid(items) {
  return `<div class="grid no-grid-gap overflow-hidden">${items.map(c => `<div class="impact-card"><h3 class="text-size-body-xl">${esc(c.title)}</h3>${c.description ? `<p class="impact-card-para text-color-ash">${esc(c.description)}</p>` : ''}</div>`).join('')}</div>`;
}

function statGrid(items) {
  return `<div class="grid no-grid-gap overflow-hidden">${items.map(st => `<div class="impact-card"><h3 class="text-style-display">${statValue(st.value)}</h3><p class="impact-card-para text-color-ash">${esc(st.label)}</p></div>`).join('')}</div>`;
}

function cards(s) {
  const parts = [];
  if (s.items) parts.push(cardGrid(s.items));
  if (s.tags) parts.push(tagsList(s.tags));
  if (s.stats) parts.push(statGrid(s.stats));
  if (s.aside) parts.push(`<div class="cta-footer"><h4 class="text-size-body-l text-color-ash">${esc(s.aside.text)}</h4>${button(s.aside.button)}</div>`);
  return section(s, parts.join(''));
}

function review(t) {
  return `<div class="review"><div class="quote-icon-wrap">${icons.quote}</div><h3 class="heading-style-h2 revcube-quote">${esc(t.quote)}</h3><div class="review-bottom"><div class="flex-verti gap-0-31rem"><div>${esc(t.name)}</div><div class="text-color-ash">${esc(`${t.role}, ${t.company}`)}</div></div></div></div>`;
}

function testimonials(s) {
  let body;
  if (s.items.length === 1) {
    // With `video`, a muted looping background video (played when in view by the remote script).
    const media = s.video
      ? `<video width="100%" muted="" playsinline="1" data-object-fit="cover" loading="lazy" data-cmp-info="10" poster="" loop="" autoplay-mode="1" class="bg-video" aria-hidden="true"><source id="video-source" src="${root}${esc(s.video)}" type="video/mp4"></video>`
      : `<img src="${img(s.image || `images/placeholder-testimonial-${page.key}.svg`, 'Testimonial image')}" loading="lazy" alt="" class="bg">`;
    body = `<div class="testimonial-component"><div class="w-dyn-list"><div role="list" class="w-dyn-items"><div role="listitem" class="review-cta w-dyn-item revcube-review-single"><div class="bg-element">${media}</div>${review(s.items[0])}</div></div></div></div>`;
  } else {
    body = `<div class="revcube-reviews">${s.items.map(review).join('')}</div>`;
  }
  return section(s, `${s.stats ? statGrid(s.stats) : ''}<div class="flex-verti gap-3-75rem">${body}</div>`);
}

// Dark statement section: kicker, then full-width paragraphs split into words. js/revcube.js highlights
// the words in reading order as the section scrolls up the screen and un-highlights them on the way back.
function statement(s) {
  const paras = s.paragraphs.map(t => `<p class="revcube-statement-text">${t.trim().split(/\s+/).map(w => `<span class="revcube-word">${esc(w)}</span>`).join(' ')}</p>`).join('');
  return `<section${attrs({ id: s.id })} theme-dark="" class="section background-color-black revcube-statement"><div class="padding-global padding-section-large"><div class="flex-verti gap-3-12rem">${s.kicker ? kicker(s.kicker) : ''}<div scroll-highlight="" class="revcube-statement-body">${paras}</div></div></div></section>`;
}

// Values: section heading on top; below it a sticky column with a number badge and the value names, and on the
// right one block per value (large text above a wide image). js/revcube.js marks the value on screen and
// updates the badge number.
function values(s) {
  const no = i => String(i + 1).padStart(2, '0');
  const names = s.items.map((item, i) => `<li class="revcube-values-name${i === 0 ? ' is-active' : ''}">${esc(item.title)}</li>`).join('');
  const rows = s.items.map((item, i) => `<div class="revcube-values-row"><span class="revcube-values-badge for-row">${no(i)}</span><h3 class="revcube-values-row-title">${esc(item.title)}</h3><p class="revcube-values-text">${esc(item.description)}</p><div class="revcube-values-media"><img src="${img(item.image || `images/placeholder-value-${slugify(item.title)}.svg`, item.title)}" loading="lazy" alt="${esc(item.title)}"></div></div>`).join('');
  const head = sectionHead({ eyebrow: s.eyebrow, headline: s.headline });
  return `<section${attrs({ id: s.id })} class="section"><div class="padding-global padding-section-large"><div class="flex-verti gap-6-25rem">${head}<div class="revcube-values"><div class="revcube-values-head"><span class="revcube-values-badge" values-badge="">01</span><ol class="revcube-values-names">${names}</ol></div><div class="revcube-values-rows">${rows}</div></div></div></div></section>`;
}

// Optional office hours in another time zone (e.g. the US team works Pakistan's night): data-open-tz/-open/-close.
const sched = o => o.schedule ? ` data-open-tz="${esc(o.schedule.timeZone)}" data-open="${o.schedule.open}" data-close="${o.schedule.close}"` : '';

// Dark team section: statement, one live-clock card per office (clocks are run by js/revcube.js), then stats.
function offices(s) {
  const c = site.contact;
  const cards = [c, c.secondOffice, c.thirdOffice].filter(Boolean).map(o => `<div la-availability="" data-tz="${esc(o.timeZone)}"${sched(o)} class="revcube-office"><div class="revcube-office-top"><span class="text-style-kicker text-color-ash">${esc(o.officeLabel || o.label)}</span><span class="revcube-office-status"><span class="dot is-relative"></span><span class="online-text">ONLINE</span><span class="offline-text">OFFLINE</span></span></div><div class="revcube-office-city">${esc(o.city)}</div><div class="revcube-office-time" la-time="">--:--:--</div><p class="text-size-body-l text-color-ash">${esc(o.address)}</p></div>`).join('');
  const text = esc(s.headline).replace(/\*\*(.+?)\*\*/g, '<span class="revcube-statement-strong">$1</span>');
  return `<section${attrs({ id: s.id })} theme-dark="" class="section background-color-black revcube-offices-section"><div class="padding-global padding-section-large"><div class="flex-verti gap-6-25rem"><div class="flex-verti gap-1-87rem">${s.kicker ? kicker(s.kicker) : ''}<h2 class="heading-style-h1 revcube-statement-text max-width-xlarge">${text}</h2></div><div class="revcube-offices">${cards}</div>${s.stats ? statGrid(s.stats) : ''}</div></div></section>`;
}

// Process tabs: one image per step on the left (cross-fading), the steps on the right. The active step shows
// its description and a progress bar; when the bar is full js/revcube.js opens the next step. Click to jump.
function process(s) {
  const pics = s.items.map((item, i) => `<img src="${img(item.image || `images/placeholder-how-${slugify(item.title)}.svg`, item.title)}" loading="lazy" alt="${esc(item.title)}" class="revcube-process-img${i === 0 ? ' is-active' : ''}">`).join('');
  const steps = s.items.map((item, i) => `<div class="revcube-process-item${i === 0 ? ' is-active' : ''}"><h3 class="revcube-process-title"><button type="button" class="revcube-process-btn" aria-expanded="${i === 0}">${esc(item.title)}</button></h3><div class="revcube-process-body"><div><p>${esc(item.description)}</p></div></div><div class="revcube-process-bar" aria-hidden="true"><div class="revcube-process-fill"></div></div></div>`).join('');
  const head = sectionHead({ eyebrow: s.eyebrow, headline: s.headline });
  return `<section${attrs({ id: s.id })} class="section"><div class="padding-global padding-section-large"><div class="flex-verti gap-6-25rem">${head}<div process-tabs="" class="revcube-process"><div class="revcube-process-media">${pics}</div><div class="revcube-process-list">${steps}</div></div></div></div></section>`;
}

// Contact page: heading and enquiry-type pills, details (rating, social, offices, email) on the left, the form
// on the right. Without `action` the form opens the visitor's email app with the message (js/revcube.js).
function contactForm(s) {
  const c = site.contact;
  const two = esc(s.headline) + (s.body ? ` <span class="text-color-ash">${esc(s.body)}</span>` : '');
  const types = s.enquiryTypes.map((t, i) => `<label class="radio-btn revcube-radio"><input type="radio" form="revcube-contact-form" name="Enquiry type" value="${esc(t)}"${i === 0 ? ' checked=""' : ''}><span class="radio-btn-circle"><span class="radio-circle-active"></span></span><span>${esc(t)}</span></label>`).join('');
  const block = (label, inner) => `<div class="flex-verti align-left revcube-contact-detail"><div class="text-style-kicker text-color-ash">${esc(label)}</div>${inner}</div>`;
  const offices = [c, c.secondOffice, c.thirdOffice].filter(Boolean).map(o => `<a href="${esc(o.mapUrl)}" target="_blank" rel="noopener" data-keep-link="" class="revcube-contact-office"><span class="text-color-black">${esc(o.officeLabel || o.label)}</span><span class="text-color-ash">${esc(o.address)}</span>${o.phone ? `<span class="text-color-ash">${esc(o.phone)}</span>` : ''}</a>`).join('');
  const details = [
    s.rating ? block('Our Rating', `<div class="rating-component"><span class="revcube-stars" aria-hidden="true">★★★★★</span><span>${esc(s.rating.score)}</span><span class="text-color-ash">${esc(s.rating.text)}</span></div>`) : '',
    block('Follow Us', `<div class="revcube-contact-social">${site.footer.social.map(l => `<a${attrs({ href: url(l.href), 'data-todo': l.todo, class: 'is-link' })}>${esc(l.label)}</a>`).join('')}</div>`),
    block('Find Us', `<div class="revcube-contact-offices">${offices}</div>`),
    block('Email Us', `<a href="mailto:${esc(c.email)}" class="text-size-body-xl is-link">${esc(c.email)}</a>`),
  ].join('');
  // Modern form card: floating labels (the label sits in the field and moves up on focus or once filled),
  // Name/Email and Company/Phone side by side, services as multi-select chips, full-width send button.
  const field = (name, label, { type = 'text', required = false, auto, area = false } = {}) => {
    const id = `cf-${slugify(name)}`;
    const control = area
      ? `<textarea id="${id}" name="${esc(name)}" placeholder=" " rows="5"${required ? ' required=""' : ''}></textarea>`
      : `<input id="${id}" type="${type}" name="${esc(name)}" placeholder=" "${auto ? ` autocomplete="${auto}"` : ''}${required ? ' required=""' : ''}>`;
    return `<div class="revcube-field${area ? ' is-area' : ''}">${control}<label for="${id}">${esc(label)}${required ? '<span class="revcube-req" aria-hidden="true"> *</span>' : ''}</label></div>`;
  };
  const chips = s.serviceOptions.map(o => `<label class="revcube-chip"><input type="checkbox" name="Service" value="${esc(o)}"><span>${esc(o)}</span></label>`).join('');
  const arrow = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11M11 5l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const form = `<form${attrs({ id: 'revcube-contact-form', 'contact-form': true, 'data-email': c.email, action: s.action, method: s.action ? 'post' : undefined, class: 'revcube-form' })}>`
    + `<div class="revcube-form-head"><span class="text-style-kicker text-color-ash">${esc(s.formKicker || 'Start a conversation')}</span><h2 class="revcube-form-title">${esc(s.formTitle || 'Tell us about your project')}</h2></div>`
    + `<div class="revcube-form-row">${field('Name', 'Full name', { required: true, auto: 'name' })}${field('Email', 'Email address', { type: 'email', required: true, auto: 'email' })}</div>`
    + `<div class="revcube-form-row">${field('Company', 'Company or brand', { auto: 'organization' })}${field('Phone', 'Phone (optional)', { type: 'tel', auto: 'tel' })}</div>`
    + `<fieldset class="revcube-chips"><legend>What can we help with? <span class="text-color-ash">Pick all that apply</span></legend><div class="revcube-chip-list">${chips}</div></fieldset>`
    + field('Message', 'Tell us about your project, goals and timeline', { required: true, area: true })
    + `<div class="revcube-form-foot"><button type="submit" class="revcube-submit"><span>${esc(s.submitLabel)}</span><span class="revcube-submit-icon">${arrow}</span></button><p class="revcube-form-note text-color-ash">${esc(s.formNote || 'We only use your details to reply to your enquiry.')}</p></div>`
    + `<p class="revcube-form-status" role="status" aria-live="polite"></p></form>`;
  return `<section${attrs({ id: s.id })} class="section"><div class="padding-global for-hero bottom-7-79rem"><div class="flex-verti gap-1-87rem">${kicker(s.kicker)}<div class="grid-layout _5-6 revcube-contact-grid"><div class="flex-verti gap-3-75rem"><h1 class="text-color-black revcube-contact-heading">${two}</h1><fieldset class="buttons-wrap revcube-radios"><legend class="revcube-sr-only">Enquiry type</legend>${types}</fieldset><div class="divider-line"></div><div class="flex-verti gap-1-87rem">${details}</div></div><div class="forms-wrap">${form}</div></div></div></div></section>`;
}

// Scrolling uppercase text strip, the text repeated with a star between (CSS animation).
function textMarquee(s) {
  const star = '<svg viewBox="0 0 16 16" aria-hidden="true" class="revcube-marquee-star"><path d="M8 0c.6 4.4 3.6 7.4 8 8-4.4.6-7.4 3.6-8 8-.6-4.4-3.6-7.4-8-8 4.4-.6 7.4-3.6 8-8z" fill="currentColor"/></svg>';
  const run = Array.from({ length: 8 }, () => `<span class="revcube-marquee-item">${star}${esc(s.text)}</span>`).join('');
  return `<section class="section overflow-hidden revcube-marquee-section" aria-label="${esc(s.text)}"><div class="revcube-marquee" aria-hidden="true"><div class="revcube-marquee-track">${run}${run}</div></div></section>`;
}

const renderers = { logos, intro, showreel, serviceCards, steps, work, industries, list, accordion, cards, testimonials, statement, values, offices, process, contact: contactForm, textMarquee };

// ---------------------------------------------------------------------------
// Global: footer (with the page's call to action)
// ---------------------------------------------------------------------------
function footer(cta) {
  const f = site.footer;
  const c = site.contact;
  const primary = cta.buttons[0];
  const ctaBlock = `<section${attrs({ 'data-mailto': primary.href.startsWith('mailto:') ? primary.href : undefined, 'data-cursor-intro': '1', 'aria-label': primary.label, class: 'section background-color-black' })}><div class="padding-global padding-section-large"><div class="main-cta-block">${cta.eyebrow ? `<div class="tag v2">${esc(cta.eyebrow)}</div>` : ''}<h2 class="text-style-display for-cta width-50rem">${esc(cta.headline)}</h2>${cta.body ? `<p class="text-size-large max-width-44rem">${esc(cta.body)}</p>` : ''}<div class="revcube-buttons">${cta.buttons.map(b => button(b)).join('')}</div></div></div><div class="cta-bg-block"><div class="cta-bg-img"><img src="${root}images/cta-background.webp" loading="lazy" alt=""></div><div class="cta-linner"></div></div></section>`;

  const list = (label, links) => `<div class="footer-nav"><div class="text-style-kicker">${esc(label)}</div><div class="footer-links-list">${links.map(l => `<a${attrs({ href: url(l.href), 'data-todo': l.todo, class: 'text-size-body-xl is-link' })}>${esc(l.label)}</a>`).join('')}</div></div>`;

  // Office addresses open Google Maps in a new tab; data-keep-link keeps them working while homeLinksOnly is on.
  const mapLink = (office, text) => office.mapUrl
    ? `<a href="${esc(office.mapUrl)}" target="_blank" rel="noopener" data-keep-link="" aria-label="${esc(text)} (opens Google Maps)" class="text-size-body-l text-color-ash revcube-address">${esc(text)}</a>`
    : `<p class="text-size-body-l text-color-ash revcube-address">${esc(text)}</p>`;
  const clockFor = x => (x && x.timeZone) ? `<div availability-time-block="" la-availability="" data-tz="${esc(x.timeZone)}"${sched(x)} class="footer-bottom-block revcube-office-clock" aria-label="${esc(x.city)} local time"><div class="dot is-relative"></div><div><div class="online-text">ONLINE</div><div class="offline-text">OFFLINE</div></div>${icons.pin}<div>${esc(x.city.toUpperCase())} <span la-time="">--:--:--</span></div></div>` : '';
  const contactBlock = `<div id="contact" class="footer-nav revcube-contact"><div class="text-style-kicker">${esc(c.label)}</div><div class="footer-links-list"><a aria-label="Call ${esc(site.name)}" href="${esc(c.phoneHref)}" class="text-size-body-xl is-link">${esc(c.phone)}</a>${mapLink(c, c.officeLabel ? c.officeLabel + ': ' + c.address : c.address)}</div>${clockFor(c)}</div>`;
  // A blank heading and a blank first line (the email's row) put the second office's phone beside the main phone
  // and its address beside the main address.
  const o = c.secondOffice;
  const officeBlock = o ? `<div class="footer-nav revcube-contact"><div class="text-style-kicker" aria-hidden="true">&nbsp;</div><div class="footer-links-list"><a aria-label="Call ${esc(site.name)} ${esc(o.label)}" href="${esc(o.phoneHref)}" class="text-size-body-xl is-link">${esc(o.phone)}</a>${mapLink(o, o.label + ': ' + o.address)}</div>${clockFor(o)}</div>` : '';
  const t = c.thirdOffice;
  const thirdBlock = t ? `<div class="footer-nav revcube-contact"><div class="text-style-kicker" aria-hidden="true">&nbsp;</div><div class="footer-links-list"><a aria-label="Call ${esc(site.name)} ${esc(t.label)}" href="${esc(t.phoneHref)}" class="text-size-body-xl is-link">${esc(t.phone)}</a>${mapLink(t, t.label + ': ' + t.address)}</div>${clockFor(t)}</div>` : '';
  const socialBlock = `<div class="footer-nav"><div class="text-style-kicker">${esc(f.socialLabel)}</div><div class="footer-links-list">${f.social.map(s => `<a${attrs({ href: url(s.href), 'data-todo': s.todo, class: 'text-style-statement for-link' })}>${esc(s.label)}</a>`).join('')}</div></div>`;
  const legal = `<div class="revcube-legal">${f.legal.map(l => `<a${attrs({ href: url(l.href), 'data-todo': l.todo, class: 'text-size-body-l is-link' })}>${esc(l.label)}</a>`).join('')}</div>`;

  // Heading row: big links on the left, round contact icons (email, phone, map) on the right.
  const contactIcons = [
    { label: `Email ${c.email}`, href: `mailto:${c.email}`, icon: icons['contact-email'] },
    { label: `Call ${c.phone}`, href: c.phoneHref, icon: icons['contact-phone'] },
    { label: `Find us: ${c.address}`, href: c.mapUrl, icon: icons['contact-map'], external: true },
  ];
  const footerHead = `<div class="footer-head"><div class="footer-head-links">${(f.headLinks || []).map(l => `<a${attrs({ href: url(l.href), class: 'text-style-statement for-link' })}>${esc(l.label)}</a>`).join('')}</div><div class="certificate-logos revcube-contact-icons">${contactIcons.map(i => `<a${attrs({ href: i.href, 'aria-label': i.label, title: i.label, target: i.external ? '_blank' : undefined, rel: i.external ? 'noopener' : undefined, class: 'revcube-contact-icon' })}>${i.icon}</a>`).join('')}</div><div class="divider-line-wrap opacity-50"><div class="divider-line"></div></div></div>`;

  // Footer status: one clock per office, each online during its own work hours.
  const cursor = shell.cursor.replace(/\{\{cursorLabel\}\}/g, esc(primary.label));

  return `<footer theme-dark="" class="footer">${ctaBlock}<div class="padding-global"><div class="flex-verti gap-3-75rem for-footer"><h2 class="footer-yugen-text">${icons.logo}</h2><div class="flex-verti for-footer"><p class="text-size-body-l text-color-ash column-fill-5">${esc(f.blurb)}</p>${footerHead}</div><div class="grid-layout _8-4 for-footer"><div class="footer-links-grid revcube-footer-links">${list(f.quickLinksLabel, f.quickLinks)}${contactBlock}${officeBlock}${thirdBlock}</div><div class="footer-nav-column">${socialBlock}</div></div><div class="divider-line opacity-50"></div><div class="footer-bottom">${legal}<div class="revcube-copyright text-size-body-l back-to-top">${esc(f.copyright)}</div><div aria-label="Back to top" back-to-top="" class="text-size-body-l back-to-top">Back to top</div></div></div></div>${cursor}</footer>`;
}

// With site.homeLinksOnly: every <a> that isn't the Home link becomes a <div> with the same classes
// and content (so it looks the same but goes nowhere). Email links (mailto:, and blocks with data-mailto)
// links marked data-keep-link (the office addresses) and links to the About Us and Contact pages stay clickable.
function homeLinksOnly(html) {
  const home = url('/index.html');
  return html
    .replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/g, (whole, attrsText, inner) => {
      const href = (attrsText.match(/\shref="([^"]*)"/) || [])[1] || '';
      if (href === home || href.startsWith('mailto:') || /(^|\/)(about|contact)-us\.html$/.test(href) || /\sdata-keep-link="/.test(attrsText)) return whole;
      const kept = attrsText.replace(/\s(href|target|rel|data-barba-prevent|data-todo|aria-current)="[^"]*"/g, '');
      return `<div${kept} data-link-off="">${inner}</div>`;
    });
}

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------
function document(p) {
  // Pages without a hero (Contact) give their title and description in `meta`.
  const title = (p.meta ? p.meta.title : p.hero.headline) + site.titleSuffix;
  const description = (p.meta ? p.meta.description : p.hero.body) + site.titleSuffix;
  const canonical = `${site.url}/${p.path === 'index.html' ? '' : p.path}`;
  const head = `<meta charset="utf-8"><title>${esc(title)}</title><meta content="${esc(description)}" name="description"><meta content="${esc(title)}" property="og:title"><meta content="${esc(description)}" property="og:description"><meta content="${site.url}/images/revcube-og.png" property="og:image"><meta content="${esc(title)}" name="twitter:title"><meta content="${esc(description)}" name="twitter:description"><meta property="og:type" content="website"><meta content="${esc(canonical)}" property="og:url"><meta content="summary_large_image" name="twitter:card"><meta content="width=device-width, initial-scale=1" name="viewport"><link href="${root}css/yugen5.shared.3377b735f.min.css" rel="stylesheet" type="text/css"><link href="${root}css/revcube-theme.css" rel="stylesheet" type="text/css"><script type="text/javascript">!function(o,c){var n=c.documentElement,t=" w-mod-";n.className+=t+"js",("ontouchstart"in o||o.DocumentTouch&&c instanceof DocumentTouch)&&(n.className+=t+"touch")}(window,document);</script><link href="${root}images/revcube-favicon.svg" rel="icon" type="image/svg+xml"><link href="${root}images/revcube-favicon.png" rel="icon" type="image/png"><link href="${root}images/revcube-webclip.png" rel="apple-touch-icon"><link href="${esc(canonical)}" rel="canonical">${shell['head-style']}`;
  const loading = `<div loading-screen="" class="loading-screen"><div class="loading-screen-bg"></div><div class="loading-content"><div class="loading-texts"><div data-split="char">${esc(site.name)}</div></div><div class="loading-numbers"><span loading-counter="">0</span>%</div></div></div>`;
  const sections = p.sections.map(s => {
    const r = renderers[s.type];
    if (!r) throw new Error(`${p.key}: unknown section type "${s.type}"`);
    return r(s);
  }).join('');
  const scripts = `<script src="${root}js/jquery-3.5.1.min.dc5e7f18c8.js" type="text/javascript"></script><script src="${root}js/yugen5.a0aa6ca1.b7683852b8a60d8e.js" type="text/javascript"></script><script defer="" src="https://yugen5.vercel.app/"></script><script src="${root}js/revcube.js"></script>`;
  // Barba page transitions drop the #hash, so links to a section on another page do a normal page load.
  let body = `<body><div data-barba="wrapper" class="page">${shell['body-css']}${shell['rf-grid']}${loading}<main data-barba="container" data-barba-namespace="${esc(p.key)}" class="main">${nav()}${p.hero ? hero(p.hero) : ''}${sections}${footer(p.cta)}</main><div page="" class="load-transition-screen"></div>${scripts}</div></body>`
    .replace(/<a\b([^>]*?) href="([^"#]+\.html#[^"]*)"/g, '<a$1 href="$2" data-barba-prevent="self"');
  if (site.homeLinksOnly) body = homeLinksOnly(body);
  return `<!DOCTYPE html>\n<!-- Generated by build.js from data/content.js. Edit the content file, then run: node build.js -->\n<html data-wf-domain="www.therevcube.com" data-wf-page="670420ce21fb6c1fb7b2d330" data-wf-site="670420cc21fb6c1fb7b2d08e" lang="en"><head>${head}</head>${body}</html>\n`;
}

// ---------------------------------------------------------------------------
// Placeholder images
// ---------------------------------------------------------------------------
function placeholderSvg(file, label) {
  const name = path.basename(file);
  if (name.startsWith('placeholder-logo-')) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 120" width="400" height="120"><text x="200" y="68" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="30" font-weight="700" fill="#2b2b2b">${esc(label)}</text><text x="200" y="100" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#9a9a9a">placeholder logo</text></svg>\n`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="1600" height="1000" preserveAspectRatio="xMidYMid slice"><rect width="1600" height="1000" fill="#e6e6e6"/><rect x="24" y="24" width="1552" height="952" fill="none" stroke="#b2b2b2" stroke-width="4" stroke-dasharray="18 14"/><text x="800" y="490" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="64" font-weight="700" fill="#2b2b2b">${esc(label)}</text><text x="800" y="570" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="30" fill="#7a7a7a">Placeholder · ${esc(name)}</text></svg>\n`;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
const keys = new Set();
for (const p of pages) {
  if (keys.has(p.key)) throw new Error(`duplicate page key ${p.key}`);
  keys.add(p.key);
  if (!p.path) throw new Error(`${p.key}: no path`);
  page = p;
  root = '../'.repeat(p.path.split('/').length - 1);
  const html = document(p);
  const out = path.join(ROOT, p.path);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  console.log(`wrote ${p.path} (${(html.length / 1024).toFixed(0)} KB)`);
}

// Every service needs a page, and every page needs a matching service (except home).
for (const s of services) if (!keys.has(s.slug)) warnings.push(`service "${s.name}" has no page`);

const created = [];
for (const [file, label] of [...placeholders].sort()) {
  const abs = path.join(ROOT, file);
  if (fs.existsSync(abs)) continue;
  fs.writeFileSync(abs, placeholderSvg(file, label));
  created.push(file);
}
console.log(`placeholders: ${placeholders.size} referenced, ${created.length} created`);
const listFile = path.join(ROOT, 'images', 'PLACEHOLDERS.txt');
fs.writeFileSync(listFile, [
  '# Placeholder images referenced by the site (generated by build.js).',
  '# To replace one: save the real image in images/, set image: "images/<file>" on that entry in data/content.js',
  '# (a project, a service, a logo-set entry as { name, image }, or a testimonials section), then run: node build.js',
  ...[...placeholders.keys()].sort(),
].join('\n') + '\n');
warnings.forEach(w => console.warn('warning:', w));
if (warnings.length) process.exitCode = 1;
