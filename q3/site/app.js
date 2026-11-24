/**
 * Ledgerline account micro-frontend (local test fixture).
 *
 * Every load picks new random "segment names":
 *   - custom element tag names   mf-<rand>-<rand>
 *   - every id, and so every IDREF (for, aria-controls, aria-labelledby, aria-describedby)
 *   - every class                css-<rand>, like CSS-in-JS output
 *   - 0-2 anonymous wrapper <div>s around most blocks, so absolute paths change as well
 *
 *   document > main > <shell host>                      OPEN shadow root
 *     nav "Account sections"
 *     region "Account settings"   tablist, tabs, tabpanels
 *     region "Transfer funds" > <vault host>             CLOSED shadow root
 *       form "New transfer"   Amount, To account, Confirm transfer, status
 *
 * The closed root is "unlinked": the vault keeps it only in a local variable (closures),
 * never on `this`, a global, a slot or an event. host.shadowRoot is null.
 * Only the accessibility semantics stay the same between loads.
 */

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const rand = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => ALPHABET[b % 36]).join('');
const tagName = () => `mf-${rand()}-${rand()}`;
const newId = () => `${ALPHABET[Math.floor(Math.random() * 26)]}${rand()}${rand()}`;
const cls = () => `css-${rand()}`;
const wrap = (html) => {
  let out = html;
  for (let depth = Math.floor(Math.random() * 3); depth > 0; depth--) out = `<div class="${cls()}">${out}</div>`;
  return out;
};
const sheet = (css) => {
  const s = new CSSStyleSheet();
  s.replaceSync(css);
  return s;
};

const SHELL_TAG = tagName();
const VAULT_TAG = tagName();

const SHARED_CSS = `
  :host { display: block; }
  * { box-sizing: border-box; }
  h2 { margin: 0 0 14px; font-size: 17px; letter-spacing: -0.01em; }
  h3 { margin: 0 0 14px; font-size: 15px; }
  label { display: block; font-size: 13px; color: var(--muted); margin-bottom: 6px; }
  input, select {
    font: inherit; font-size: 15px; padding: 9px 11px; min-width: 260px;
    border: 1px solid var(--line); border-radius: 8px; background: var(--page); color: var(--ink);
  }
  input:focus-visible, select:focus-visible, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  button:not([role="tab"]) {
    font: inherit; font-size: 14px; font-weight: 600; padding: 9px 16px; border-radius: 8px; cursor: pointer;
    border: 1px solid var(--accent); background: var(--accent); color: var(--surface);
  }
  p { margin: 10px 0 0; font-size: 13px; color: var(--muted); }
`;

const SHELL_CSS = `
  ${SHARED_CSS}
  nav ul { display: flex; gap: 4px; list-style: none; margin: 0 0 20px; padding: 0; }
  nav a { display: block; padding: 8px 12px; border-radius: 8px; color: var(--muted); text-decoration: none; font-size: 14px; }
  nav a[aria-current="page"] { background: var(--surface); color: var(--ink); box-shadow: 0 0 0 1px var(--line); }
  section { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 20px 24px; margin-bottom: 16px; }
  [role="tablist"] { display: flex; gap: 4px; border-bottom: 1px solid var(--line); margin-bottom: 16px; }
  [role="tab"] {
    font: inherit; font-size: 14px; background: none; border: 0; border-bottom: 2px solid transparent;
    padding: 8px 12px; margin-bottom: -1px; color: var(--muted); cursor: pointer;
  }
  [role="tab"][aria-selected="true"] { color: var(--ink); border-bottom-color: var(--accent); }
  button[aria-pressed="true"] { background: var(--surface); color: var(--accent); }
`;

const VAULT_CSS = `
  ${SHARED_CSS}
  form { display: grid; gap: 14px; justify-items: start; }
  [role="status"] { min-height: 1.2em; color: var(--ink); font-weight: 600; }
`;

class AccountShell extends HTMLElement {
  #mounted = false;

  connectedCallback() {
    if (this.#mounted) return;
    this.#mounted = true;
    const ids = { settings: newId(), transfer: newId(), tabProfile: newId(), tabSecurity: newId(),
      panelProfile: newId(), panelSecurity: newId(), displayName: newId(), hint: newId() };
    const root = this.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [sheet(SHELL_CSS)];
    root.innerHTML = `
      <nav class="${cls()}" aria-label="Account sections">
        ${wrap(`<ul class="${cls()}">
          <li class="${cls()}"><a class="${cls()}" href="#overview" aria-current="page">Overview</a></li>
          <li class="${cls()}"><a class="${cls()}" href="#statements">Statements</a></li>
          <li class="${cls()}"><a class="${cls()}" href="#settings">Settings</a></li>
        </ul>`)}
      </nav>
      <section class="${cls()}" aria-labelledby="${ids.settings}">
        <h2 class="${cls()}" id="${ids.settings}">Account settings</h2>
        ${wrap(`<div class="${cls()}" role="tablist" aria-label="Settings sections">
          <button class="${cls()}" role="tab" id="${ids.tabProfile}" aria-selected="true"
                  aria-controls="${ids.panelProfile}" tabindex="0">Profile</button>
          <button class="${cls()}" role="tab" id="${ids.tabSecurity}" aria-selected="false"
                  aria-controls="${ids.panelSecurity}" tabindex="-1">Security</button>
        </div>`)}
        ${wrap(`<div class="${cls()}" role="tabpanel" id="${ids.panelProfile}" aria-labelledby="${ids.tabProfile}">
          <label class="${cls()}" for="${ids.displayName}">Display name</label>
          <input class="${cls()}" id="${ids.displayName}" value="Alex Morgan" autocomplete="off">
        </div>`)}
        ${wrap(`<div class="${cls()}" role="tabpanel" id="${ids.panelSecurity}" aria-labelledby="${ids.tabSecurity}" hidden>
          <button class="${cls()}" type="button" aria-pressed="false" aria-describedby="${ids.hint}">Enable two-factor authentication</button>
          <p class="${cls()}" id="${ids.hint}">You will need an authenticator app.</p>
        </div>`)}
      </section>
      <section class="${cls()}" aria-labelledby="${ids.transfer}">
        <h2 class="${cls()}" id="${ids.transfer}">Transfer funds</h2>
        ${wrap(`<${VAULT_TAG} class="${cls()}"></${VAULT_TAG}>`)}
      </section>`;

    const tabs = [root.getElementById(ids.tabProfile), root.getElementById(ids.tabSecurity)];
    for (const tab of tabs) {
      tab.addEventListener('click', () => {
        for (const other of tabs) {
          const selected = other === tab;
          other.setAttribute('aria-selected', String(selected));
          other.tabIndex = selected ? 0 : -1;
          root.getElementById(other.getAttribute('aria-controls')).hidden = !selected;
        }
      });
    }
    const twoFactor = root.querySelector('[aria-pressed]');
    twoFactor.addEventListener('click', () => {
      twoFactor.setAttribute('aria-pressed', String(twoFactor.getAttribute('aria-pressed') !== 'true'));
    });
  }
}

class TransferVault extends HTMLElement {
  #mounted = false;

  connectedCallback() {
    if (this.#mounted) return;
    this.#mounted = true;
    const ids = { heading: newId(), amount: newId(), account: newId(), note: newId(), status: newId() };
    // Closed and unlinked: `root` lives only in this scope and the listeners below.
    const root = this.attachShadow({ mode: 'closed' });
    root.adoptedStyleSheets = [sheet(VAULT_CSS)];
    root.innerHTML = `
      <form class="${cls()}" aria-labelledby="${ids.heading}" novalidate>
        <h3 class="${cls()}" id="${ids.heading}">New transfer</h3>
        ${wrap(`<div class="${cls()}">
          <label class="${cls()}" for="${ids.amount}">Amount</label>
          <input class="${cls()}" id="${ids.amount}" inputmode="decimal" autocomplete="off">
        </div>`)}
        ${wrap(`<div class="${cls()}">
          <label class="${cls()}" for="${ids.account}">To account</label>
          <select class="${cls()}" id="${ids.account}">
            <option>Savings 4821</option>
            <option>Holiday fund 1093</option>
          </select>
        </div>`)}
        ${wrap(`<button class="${cls()}" type="submit" aria-controls="${ids.status}"
                        aria-describedby="${ids.note}">Confirm transfer</button>`)}
        <p class="${cls()}" id="${ids.note}">Transfers over 1,000.00 need two-factor authentication.</p>
        <p class="${cls()}" id="${ids.status}" role="status" aria-live="polite"></p>
      </form>`;

    const form = root.querySelector('form');
    const amount = root.getElementById(ids.amount);
    const account = root.getElementById(ids.account);
    const status = root.getElementById(ids.status);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = Number(amount.value);
      status.textContent = Number.isFinite(value) && value > 0
        ? `Transfer of ${value.toFixed(2)} to ${account.selectedOptions[0].textContent} scheduled.`
        : 'Enter an amount greater than zero.';
    });
  }
}

customElements.define(VAULT_TAG, TransferVault);
customElements.define(SHELL_TAG, AccountShell);
document.querySelector('main').append(document.createElement(SHELL_TAG));
