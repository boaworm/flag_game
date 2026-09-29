/**
 * Small DOM builder, so modes describe structure instead of concatenating HTML.
 * Text always goes through textContent — never interpolate data into innerHTML.
 */

/**
 * el('button.choice', { onclick }, 'Sweden')
 * el('div', [child, child])
 */
export function el(spec, props, children) {
  const [tag, ...classes] = spec.split('.');
  const node = document.createElement(tag || 'div');
  if (classes.length) node.className = classes.join(' ');

  // The props argument is optional; a second positional may be the children.
  if (Array.isArray(props) || typeof props === 'string' || props instanceof Node) {
    children = props;
    props = null;
  }

  for (const [key, value] of Object.entries(props ?? {})) {
    if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2), value);
    } else if (key === 'class') {
      node.className = value;
    } else if (key in node && key !== 'list') {
      node[key] = value;
    } else {
      node.setAttribute(key, value);
    }
  }

  for (const child of [children].flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }

  return node;
}

/** Replace everything inside a node. */
export function render(parent, ...children) {
  parent.replaceChildren(...children.flat(Infinity).filter(Boolean));
  return parent;
}
