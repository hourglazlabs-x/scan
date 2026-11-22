// The rubric the app scores with, bundled by Metro (which supports JSON
// imports). App-only: node cannot import JSON without import attributes, so
// tests and scripts read the file with fs and call parseRubric themselves.
// Never import this file from code that runs under node.

import rubricJson from './nuitrix-v0.1.json';
import { parseRubric } from './schema.ts';

export const RUBRIC = parseRubric(rubricJson);
