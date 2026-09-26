// Figure registry for the step component. A figure module default-exports:
//   { name, steps, label, svg(step) -> string, mount(stage) -> { set(step), animate(tl, from, to, ctx) -> ms } }
// svg(step) is pure (no DOM), so the compiler can inline the final state for readers without JavaScript.

import nameTag from './name-tag.js';

export const figures = { [nameTag.name]: nameTag };

export function registerFigure(fig) {
  figures[fig.name] = fig;
}

/** Static SVG markup of a figure at a step (for the compiler's no-JS output). */
export function renderFigure(name, step) {
  const fig = figures[name];
  return fig ? fig.svg(step) : '';
}
