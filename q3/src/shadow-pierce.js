/**
 * shadow-pierce.js - vanilla JS deep query for closed shadow roots, by ARIA role + accessible name.
 *
 * Load it BEFORE any page script runs (Playwright `page.addInitScript({ path })`, CDP
 * `Page.addScriptToEvaluateOnNewDocument`, or a MAIN-world extension content script at
 * document_start). It does two things:
 *
 *  1. Hooks Element.prototype.attachShadow and keeps every root it returns, open or closed,
 *     in a WeakMap keyed by host. A closed root is otherwise unreachable from page JS:
 *     host.shadowRoot is null, and an "unlinked" component keeps no other reference to it.
 *     The WeakMap holds nothing on the host itself and does not keep detached hosts alive.
 *
 *  2. Exposes window.__shadowPierce, a query API that walks the flat tree (document, then
 *     every open and hooked closed root, and every same-origin iframe document, at any depth)
 *     and matches elements by ARIA role and accessible name. It never looks at tag names, ids,
 *     classes or positions, so it keeps working when those are regenerated on every load.
 *
 * Frames: the init script runs in every frame, so each iframe has its own hook and root map.
 * The engine in the top window enters iframe.contentDocument (same-origin only) and reads
 * shadow roots there from that frame's own map. Nodes of another document belong to another
 * realm, so nothing below uses `instanceof ShadowRoot`.
 *
 * Role and name computation is a documented subset of HTML-AAM / accname-1.2, enough for
 * forms, landmarks, tabs and links. Known limits are listed in q3/README.md.
 */
(() => {
  const ROOTS_KEY = Symbol.for('shadow-pierce.roots');
  if (window.__shadowPierce) return;

  // ---------------------------------------------------------------- 1. attachShadow hook
  // The compact hook (pierce-hook.min.js) uses the same global map, so either can load first.
  /** @type {WeakMap<Element, ShadowRoot>} */
  const roots = window[ROOTS_KEY] ?? new WeakMap();
  if (!window[ROOTS_KEY]) {
    const nativeAttachShadow = Element.prototype.attachShadow;
    Object.defineProperty(window, ROOTS_KEY, { value: roots });
    Object.defineProperty(Element.prototype, 'attachShadow', {
      configurable: true,
      enumerable: false,
      writable: true,
      value: function attachShadow(init) {
        const root = nativeAttachShadow.call(this, init);
        roots.set(this, root);
        return root;
      },
    });
  }

  /** true for a ShadowRoot of any realm (an iframe's nodes fail `instanceof ShadowRoot` in this window). */
  const isShadowRoot = (node) => node?.nodeType === Node.DOCUMENT_FRAGMENT_NODE && Boolean(node.host);

  /** The root map of the frame `el` lives in: each frame's own hook filled its own map. */
  const rootsOf = (el) => el.ownerDocument?.defaultView?.[ROOTS_KEY] ?? roots;

  /** The shadow root of a host: the open one the platform exposes, else the one a hook captured. */
  const shadowOf = (el) => el.shadowRoot ?? rootsOf(el).get(el) ?? null;

  /** The document of a same-origin iframe (null for other elements and for cross-origin frames). */
  const frameDocumentOf = (el) => (el.tagName === 'IFRAME' || el.tagName === 'FRAME' ? el.contentDocument : null);

  /** The iframe element that holds `doc`, or null for the top document. */
  const frameElementOf = (doc) => doc.defaultView?.frameElement ?? null;

  /** Parent inside one document: parent element, or the host when we are at the top of a shadow root. */
  const parentInDocument = (el) => {
    if (el.parentElement) return el.parentElement;
    const root = el.getRootNode();
    return isShadowRoot(root) ? root.host : null;
  };

  /** Parent in the flat tree, across frames too: at the top of an iframe's document, the iframe element. */
  const flatParent = (el) =>
    parentInDocument(el) ?? (el.parentNode?.nodeType === Node.DOCUMENT_NODE ? frameElementOf(el.parentNode) : null);

  /** Every element under `start` (document, shadow root or element), entering shadow roots and iframe documents. */
  function* walk(start) {
    const scopes = [start];
    while (scopes.length) {
      const scope = scopes.shift();
      if (scope.nodeType === Node.ELEMENT_NODE) {
        const own = shadowOf(scope) ?? frameDocumentOf(scope);
        if (own) scopes.push(own);
      }
      const walker = (scope.ownerDocument ?? scope).createTreeWalker(scope, NodeFilter.SHOW_ELEMENT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        yield node;
        const inner = shadowOf(node) ?? frameDocumentOf(node);
        if (inner) scopes.push(inner);
      }
    }
  }

  // ---------------------------------------------------------------- 2. ARIA role
  const LANDMARKS = new Set(['banner', 'complementary', 'contentinfo', 'form', 'main', 'navigation', 'region', 'search']);
  const SECTIONING = new Set(['ARTICLE', 'ASIDE', 'MAIN', 'NAV', 'SECTION']);

  const hasOwnName = (el) => Boolean(el.getAttribute('aria-label')?.trim() || el.getAttribute('aria-labelledby')?.trim());

  /** true when no sectioning element sits between `el` and the top of its own document (flat tree). */
  const isTopLevel = (el) => {
    for (let p = parentInDocument(el); p; p = parentInDocument(p)) if (SECTIONING.has(p.tagName)) return false;
    return true;
  };

  const INPUT_ROLES = {
    button: 'button', image: 'button', reset: 'button', submit: 'button',
    checkbox: 'checkbox', radio: 'radio', range: 'slider', number: 'spinbutton', search: 'searchbox',
    email: 'textbox', tel: 'textbox', text: 'textbox', url: 'textbox', password: null, hidden: null,
  };

  function implicitRole(el) {
    switch (el.tagName) {
      case 'A': case 'AREA': return el.hasAttribute('href') ? 'link' : null;
      case 'ARTICLE': return 'article';
      case 'ASIDE': return 'complementary';
      case 'BUTTON': return 'button';
      case 'DIALOG': return 'dialog';
      case 'FIELDSET': return 'group';
      case 'FOOTER': return isTopLevel(el) ? 'contentinfo' : null;
      case 'FORM': return hasOwnName(el) ? 'form' : null;
      case 'H1': case 'H2': case 'H3': case 'H4': case 'H5': case 'H6': return 'heading';
      case 'HEADER': return isTopLevel(el) ? 'banner' : null;
      case 'HR': return 'separator';
      case 'IMG': return el.getAttribute('alt') === '' ? 'presentation' : 'img';
      case 'INPUT': {
        const type = (el.getAttribute('type') ?? 'text').toLowerCase();
        if (el.hasAttribute('list') && ['email', 'search', 'tel', 'text', 'url'].includes(type)) return 'combobox';
        return type in INPUT_ROLES ? INPUT_ROLES[type] : 'textbox';
      }
      case 'LI': return 'listitem';
      case 'MAIN': return 'main';
      case 'NAV': return 'navigation';
      case 'OL': case 'UL': case 'MENU': return 'list';
      case 'OPTION': return 'option';
      case 'OUTPUT': return 'status';
      case 'P': return 'paragraph';
      case 'PROGRESS': return 'progressbar';
      case 'SEARCH': return 'search';
      case 'SECTION': return hasOwnName(el) ? 'region' : null;
      case 'SELECT': return el.multiple || el.size > 1 ? 'listbox' : 'combobox';
      case 'TABLE': return 'table';
      case 'TD': return 'cell';
      case 'TEXTAREA': return 'textbox';
      case 'TH': return 'columnheader';
      case 'TR': return 'row';
      default: return null;
    }
  }

  /** Explicit role (first token of role="...") wins over the implicit HTML mapping. */
  const roleOf = (el) => el.getAttribute('role')?.trim().split(/\s+/)[0]?.toLowerCase() || implicitRole(el);

  // ---------------------------------------------------------------- 3. hidden from the a11y tree
  function isHidden(el) {
    for (let node = el; node; node = flatParent(node)) {
      if (node.getAttribute('aria-hidden') === 'true') return true;
    }
    // A hidden iframe hides its whole document, which checkVisibility() inside that document cannot see.
    for (let frame = frameElementOf(el.ownerDocument); frame; frame = frameElementOf(frame.ownerDocument)) {
      if (!frame.checkVisibility({ visibilityProperty: true })) return true;
    }
    // An <option> of a collapsed <select> has no layout box but is still exposed.
    const box = el.tagName === 'OPTION' ? el.closest('select') ?? el : el;
    return !box.checkVisibility({ visibilityProperty: true });
  }

  // ---------------------------------------------------------------- 4. accessible name
  const NAME_FROM_CONTENT = new Set([
    'button', 'cell', 'checkbox', 'columnheader', 'gridcell', 'heading', 'link', 'menuitem', 'menuitemcheckbox',
    'menuitemradio', 'option', 'radio', 'row', 'rowheader', 'switch', 'tab', 'tooltip', 'treeitem',
  ]);
  const normalise = (text) => text.replace(/\s+/g, ' ').trim();

  /** IDREF list resolved in the element's own tree scope (its document, iframe document or shadow root). */
  const idrefs = (el, attribute) => {
    const root = el.getRootNode();
    return (el.getAttribute(attribute) ?? '').split(/\s+/).filter(Boolean)
      .map((id) => root.getElementById(id)).filter(Boolean);
  };

  /** Text of a subtree in flat-tree order (shadow content and slotted nodes, not light DOM of hosts). */
  function textOf(node, includeHidden) {
    if (node.nodeType === Node.TEXT_NODE) return node.data;
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    if (!includeHidden && isHidden(node)) return '';
    const label = node.getAttribute('aria-label')?.trim();
    if (label) return ` ${label} `;
    if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') return ` ${node.value} `;
    if (node.tagName === 'SELECT') return ` ${node.selectedOptions[0]?.textContent ?? ''} `;
    if (node.tagName === 'IMG') return ` ${node.getAttribute('alt') ?? ''} `;
    const children = node.tagName === 'SLOT'
      ? node.assignedNodes({ flatten: true }).length ? node.assignedNodes({ flatten: true }) : [...node.childNodes]
      : [...(shadowOf(node) ?? node).childNodes];
    const inner = children.map((child) => textOf(child, includeHidden)).join('');
    const inline = node.ownerDocument.defaultView.getComputedStyle(node).display.startsWith('inline');
    return inline ? inner : ` ${inner} `;
  }

  function nameOf(el) {
    // A hidden element (e.g. an inactive tabpanel's button) is named from its hidden content.
    const hidden = isHidden(el);
    const labelledBy = idrefs(el, 'aria-labelledby');
    if (labelledBy.length) return normalise(labelledBy.map((ref) => textOf(ref, true)).join(' '));
    const label = el.getAttribute('aria-label');
    if (label?.trim()) return normalise(label);
    if (['INPUT', 'SELECT', 'TEXTAREA', 'METER', 'PROGRESS', 'OUTPUT'].includes(el.tagName)) {
      const type = el.getAttribute('type')?.toLowerCase();
      if (el.tagName === 'INPUT' && ['button', 'submit', 'reset'].includes(type)) {
        return normalise(el.value || (type === 'submit' ? 'Submit' : type === 'reset' ? 'Reset' : ''));
      }
      const labels = [...(el.labels ?? [])];
      if (labels.length) return normalise(labels.map((l) => textOf(l, hidden)).join(' '));
    }
    if (el.tagName === 'IMG' && el.hasAttribute('alt')) return normalise(el.getAttribute('alt'));
    if (el.tagName === 'FIELDSET') {
      const legend = [...el.children].find((c) => c.tagName === 'LEGEND');
      if (legend) return normalise(textOf(legend, hidden));
    }
    if (NAME_FROM_CONTENT.has(roleOf(el))) {
      const content = normalise(textOf(el, hidden));
      if (content) return content;
    }
    return normalise(el.getAttribute('title') ?? el.getAttribute('placeholder') ?? '');
  }

  // ---------------------------------------------------------------- 5. query API
  const nameMatches = (actual, wanted) =>
    wanted === undefined || (wanted instanceof RegExp ? wanted.test(actual) : actual === normalise(String(wanted)));

  /**
   * All elements under `within` (default: document) with this role and accessible name, in
   * flat-tree order. `name` is exact after whitespace normalisation, or a RegExp.
   */
  function queryAll({ role, name, includeHidden = false, within = document } = {}) {
    if (!role) throw new Error('shadow-pierce: role is required');
    const found = [];
    for (const el of walk(within)) {
      if (el === within || roleOf(el) !== role) continue;
      if (!includeHidden && isHidden(el)) continue;
      if (nameMatches(nameOf(el), name)) found.push(el);
    }
    return found;
  }

  const query = (options) => queryAll(options)[0] ?? null;

  /** Tier 3: walk an accessibility path, each step a role (+ name) searched inside the previous match. */
  function queryPath(steps, { includeHidden = false } = {}) {
    let matches = [document];
    for (const step of steps) {
      const next = new Set();
      for (const scope of matches) for (const el of queryAll({ ...step, includeHidden, within: scope })) next.add(el);
      matches = [...next];
      if (!matches.length) break;
    }
    return matches;
  }

  /**
   * Tier 2: follow an ARIA relationship (aria-controls, aria-labelledby, ...).
   *  anchor-to-target: the anchor's attribute points at the target.
   *  target-to-anchor: the target's attribute points at the anchor.
   * Anchors are { role, name } or { role, text } (text = normalised text content, for roles with no name).
   */
  function queryRelation({ relation, direction, anchor, targetRole, includeHidden = false }) {
    const anchors = queryAll({ role: anchor.role, name: anchor.name, includeHidden: true })
      .filter((el) => anchor.text === undefined || normalise(textOf(el, true)) === normalise(anchor.text));
    if (direction === 'anchor-to-target') {
      return [...new Set(anchors.flatMap((a) => idrefs(a, relation)))]
        .filter((el) => roleOf(el) === targetRole && (includeHidden || !isHidden(el)));
    }
    return queryAll({ role: targetRole, includeHidden })
      .filter((el) => idrefs(el, relation).some((ref) => anchors.includes(ref)));
  }

  /**
   * Where an element lives: 'document', or each boundary around it from the inside out:
   * a shadow root ('open' / 'closed', with its host's tag) or an iframe document ('frame').
   */
  function scopeOf(el) {
    const chain = [];
    for (let node = el; ; ) {
      const root = node.getRootNode();
      if (isShadowRoot(root)) {
        chain.push({ mode: root.mode, hostTag: root.host.localName });
        node = root.host;
        continue;
      }
      const frame = frameElementOf(root);
      if (!frame) break;
      chain.push({ mode: 'frame', hostTag: frame.localName });
      node = frame;
    }
    return { mode: chain[0]?.mode ?? 'document', chain };
  }

  /** Landmark ancestors (outermost first), the accessibility path tier 3 starts from. */
  function landmarksOf(el) {
    const path = [];
    for (let p = flatParent(el); p; p = flatParent(p)) {
      const role = roleOf(p);
      if (LANDMARKS.has(role)) path.unshift({ role, name: nameOf(p) });
    }
    return path;
  }

  /**
   * Absolute structural path (evidence only), across shadow roots and iframes, e.g.
   * /html/body/main/mf-x/#shadow-root(open)/section[2]/mf-y/#shadow-root(closed)/form/iframe/#document/html/body/button
   */
  function absolutePath(el) {
    const parts = [];
    for (let node = el; node; ) {
      const parent = node.parentElement;
      const siblings = parent ? [...parent.children] : [...node.parentNode.children];
      const same = siblings.filter((s) => s.localName === node.localName);
      parts.unshift(same.length > 1 ? `${node.localName}[${same.indexOf(node) + 1}]` : node.localName);
      if (parent) { node = parent; continue; }
      const root = node.getRootNode();
      if (isShadowRoot(root)) {
        parts.unshift(`#shadow-root(${root.mode})`);
        node = root.host;
        continue;
      }
      const frame = frameElementOf(root);
      if (!frame) break;
      parts.unshift('#document');
      node = frame;
    }
    return `/${parts.join('/')}`;
  }

  const api = {
    query, queryAll, queryPath, queryRelation,
    roleOf, nameOf, isHidden, scopeOf, landmarksOf, absolutePath,
    idrefs: (el, attribute) => idrefs(el, attribute),
    text: (el) => normalise(textOf(el, true)),
    /** Shadow roots (by mode) and iframe documents reachable from the document through this engine. */
    stats: () => {
      const count = { open: 0, closed: 0, frames: 0 };
      for (const el of walk(document)) {
        const root = shadowOf(el);
        if (root) count[root.mode]++;
        if (frameDocumentOf(el)) count.frames++;
      }
      return count;
    },
  };
  Object.defineProperty(window, '__shadowPierce', { value: Object.freeze(api) });
})();
