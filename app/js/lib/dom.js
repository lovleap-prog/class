// 아주 작은 DOM 헬퍼. 빌드 도구 없이 쓰기 위한 최소 구현.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style' && typeof v === 'object') {
      // CSS 변수(--이름)는 Object.assign 으로는 안 들어가서 따로 넣는다.
      for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith('--')) el.style.setProperty(sk, String(sv));
        else el.style[sk] = sv;
      }
    }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

export function mount(el, ...children) { clear(el); append(el, children); return el; }

/** 간단한 토스트 알림 */
export function toast(msg, kind = 'info') {
  let host = $('#toast-host');
  if (!host) { host = h('div', { id: 'toast-host' }); document.body.appendChild(host); }
  const t = h('div', { class: `toast toast-${kind}` }, msg);
  host.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 3200);
}

/** 확인 모달 (window.confirm 대체) */
export function confirmDialog(message, { okText = '확인', cancelText = '취소', danger = false } = {}) {
  return new Promise((resolve) => {
    const close = (v) => { back.remove(); resolve(v); };
    const back = h('div', { class: 'modal-back', onClick: (e) => { if (e.target === back) close(false); } },
      h('div', { class: 'modal modal-sm' },
        h('p', { class: 'modal-msg' }, message),
        h('div', { class: 'modal-actions' },
          h('button', { class: 'btn', onClick: () => close(false) }, cancelText),
          h('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, onClick: () => close(true) }, okText))));
    document.body.appendChild(back);
  });
}

/** 입력 모달 — 반려 사유 등 */
export function promptDialog(message, { placeholder = '', okText = '확인' } = {}) {
  return new Promise((resolve) => {
    const input = h('textarea', { class: 'input', rows: 3, placeholder });
    const close = (v) => { back.remove(); resolve(v); };
    const back = h('div', { class: 'modal-back', onClick: (e) => { if (e.target === back) close(null); } },
      h('div', { class: 'modal modal-sm' },
        h('p', { class: 'modal-msg' }, message), input,
        h('div', { class: 'modal-actions' },
          h('button', { class: 'btn', onClick: () => close(null) }, '취소'),
          h('button', { class: 'btn btn-primary', onClick: () => close(input.value.trim()) }, okText))));
    document.body.appendChild(back);
    setTimeout(() => input.focus(), 30);
  });
}

/** 큰 모달 (미리보기 등) */
export function openModal(title, bodyNode, actions = []) {
  const close = () => back.remove();
  const back = h('div', { class: 'modal-back', onClick: (e) => { if (e.target === back) close(); } },
    h('div', { class: 'modal' },
      h('div', { class: 'modal-head' }, h('h3', {}, title), h('button', { class: 'icon-btn', title: '닫기', onClick: close }, '✕')),
      h('div', { class: 'modal-body' }, bodyNode),
      h('div', { class: 'modal-actions' }, ...actions.map((a) =>
        h('button', { class: `btn ${a.class || ''}`, onClick: () => a.onClick(close) }, a.label)))));
  document.body.appendChild(back);
  return close;
}

/** 파일 다운로드 */
export function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename, rel: 'noopener' });
  document.body.appendChild(a);
  a.click();
  // 앵커를 곧바로 지우면 크로미움이 download 속성(파일명)을 잃어버린다.
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch { // 보안 컨텍스트가 아닐 때 폴백
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } });
    ta.value = text; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  }
}
