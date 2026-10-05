// Runs once for any of the kit's elements: adds the icons and the design tokens, and registers the
// plugin loader, which lets a bare element work on the implicit default instance without any
// createTessera() call.
import { registerImplicitPlugin } from '@tessera-kit/elements';
import { registerAnnotatorIcons } from './icons.js';
import { installAnnotatorTokens } from './tokens.js';

registerAnnotatorIcons();
if (typeof document !== 'undefined') installAnnotatorTokens(document);
registerImplicitPlugin('annotator', () => import('../plugin.js'));
