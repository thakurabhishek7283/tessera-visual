export {
  AnnotatorConfig,
  type AnnotatorConfigValue,
  TOKEN_COLORS,
  TOOL_IDS,
  TokenColor,
  type ToolId,
} from './config.js';
export {
  type Annotation,
  AnnotationSchema,
  type Body,
  type Geometry,
  GeometrySchema,
  type NewAnnotation,
  type Point,
  type Rect,
  type Style,
} from './geometry/model.js';
export {
  exportW3C,
  importW3C,
  type W3CAnnotation,
  type W3CBody,
  type W3CSelector,
} from './interop/w3c.js';
export { mergeSets, type SetDocValue } from './persistence.js';
export { annotatorPlugin as default, annotatorPlugin } from './plugin.js';
export type {
  AnnotatorApi,
  AnnotatorHandle,
  AnnotatorHooks,
  AnnotatorOptions,
  ChangeSet,
  ViewState,
} from './types.js';
