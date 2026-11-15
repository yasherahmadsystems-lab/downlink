// Tiny DOM helper. Written by Claude (AI) for Team AETHELGARD.

/** h('p', { class: 'x', onclick: fn }, 'text', childNode) */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  el.append(...children.filter((c) => c != null));
  return el;
}
