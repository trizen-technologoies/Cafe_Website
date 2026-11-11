/**
 * Places a flat element onto a four-cornered area of a photo, so text appears printed on a
 * surface seen in perspective (a book page, a menu card).
 *
 * `quad` lists the corners clockwise from top left, as fractions of the container (0 to 1).
 */
export function placeOnQuad(element, container, quad) {
  const { width: cw, height: ch } = container.getBoundingClientRect();
  const w = element.offsetWidth;
  const h = element.offsetHeight;
  const [p0, p1, p2, p3] = quad.map(([x, y]) => [x * cw, y * ch]);
  element.style.transformOrigin = '0 0';
  element.style.transform = matrixFor(w, h, p0, p1, p2, p3);
}

function matrixFor(w, h, [x0, y0], [x1, y1], [x2, y2], [x3, y3]) {
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const dy3 = y0 - y1 + y2 - y3;
  let g = 0;
  let k = 0;
  if (dx3 || dy3) {
    const det = dx1 * dy2 - dx2 * dy1;
    g = (dx3 * dy2 - dx2 * dy3) / det;
    k = (dx1 * dy3 - dx3 * dy1) / det;
  }
  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + k * x3;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + k * y3;
  const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, k / h, 0, 0, 1, 0, x0, y0, 0, 1];
  return `matrix3d(${m.map((n) => +n.toFixed(8)).join(',')})`;
}
