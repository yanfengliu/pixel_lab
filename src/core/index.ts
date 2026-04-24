export type {
  Id,
  Rect,
  Slicing,
  GridSlicing,
  AutoSlicing,
  ManualSlicing,
  SequenceSlicing,
  Source,
  SourceKind,
  GifFrameMeta,
  FrameRef,
  Animation,
  Project,
  PreparedSource,
  Tool,
} from './types';

export type { RawImage, RGBA } from './image';
export {
  createImage,
  setPixel,
  getAlpha,
  crop,
  blit,
  imagesEqual,
  isCellFullyTransparent,
} from './image';

export { newId } from './ids';

export { slice, sliceGrid, sliceAuto, sliceManual } from './slicers';

export { prepareSheet, prepareSequence } from './source';

export type { Brush } from './drawing';
export {
  stampDot,
  stampLine,
  stampErase,
  stampEraseLine,
  floodFill,
  samplePixel,
} from './drawing';

export type { DecodedGifFrame, GifFramePatch } from './gif';
export { compositeGifFrames, decodeGif } from './gif';

export type { PackInput, Placement, PackOptions, PackResult } from './packer';
export { packFrames } from './packer';

export { encodePng, decodePng } from './png';

export type {
  FrameInfo,
  AtlasInfo,
  ManifestAnimation,
  Manifest,
  BuildManifestInput,
} from './serialize/manifest';
export { buildManifest } from './serialize/manifest';

export { projectToJson, projectFromJson } from './serialize/project';
export { bytesToBase64, base64ToBytes } from './serialize/base64';

export type { ExportBundle, ExportOptions } from './export';
export { buildExport } from './export';
