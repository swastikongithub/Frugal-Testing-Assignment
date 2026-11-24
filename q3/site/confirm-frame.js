/**
 * The confirmation step of the transfer, in its own document: the nested iframe that the vault's
 * CLOSED shadow root contains (the PDF's `#shadow-root (closed) > <nested-iframe> > <button>`).
 *
 *   button "Confirm Transaction"   class cta-<rand>, data-test-id dyn-uuid-<n>: both change every load
 *     --aria-describedby-->  paragraph (the two-factor note)
 *     --aria-controls-->     status (the transfer result)
 *
 * IDREFs resolve inside this document only, so the button, its note and its status live here together.
 * The amount and the account live in the vault's closed root, in the parent document. A click asks the
 * vault (postMessage to the parent) for the result, and the vault answers with the status text.
 */
import { cls, newId, testId, wrap } from './random.js';

const ids = { note: newId(), status: newId() };
document.body.insertAdjacentHTML('afterbegin', wrap(`<div class="${cls()}">
  ${wrap(`<button class="${cls('cta')}" type="button" data-test-id="${testId()}"
          aria-controls="${ids.status}" aria-describedby="${ids.note}">Confirm Transaction</button>`)}
  <p class="${cls()}" id="${ids.note}">Transfers over 1,000.00 need two-factor authentication.</p>
  <p class="${cls()}" id="${ids.status}" role="status" aria-live="polite"></p>
</div>`));

const status = document.getElementById(ids.status);
document.querySelector('button').addEventListener('click', () => {
  parent.postMessage({ type: 'confirm-transaction' }, location.origin);
});
window.addEventListener('message', (event) => {
  if (event.source !== parent || event.origin !== location.origin || event.data?.type !== 'transaction-status') return;
  status.textContent = event.data.text;
});
