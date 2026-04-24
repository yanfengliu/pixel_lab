export type { Brush } from './brush';
export {
  stampDot,
  stampLine,
  stampErase,
  stampEraseLine,
} from './brush';
export { floodFill } from './fill';
export { samplePixel } from './sample';
export type { StrokeDelta } from './diff';
export { computeDelta, redoDelta, undoDelta } from './diff';
export {
  drawLine,
  drawRectOutline,
  drawRectFilled,
  drawEllipseOutline,
  drawEllipseFilled,
} from './shapes';
export type { Selection } from './selection';
export { extractSelection, pasteSelection } from './selection';
