// Runs once for any of the kit's elements: registering the plugin loader is what lets a bare
// element work on the implicit default instance, without any createTessera() call.
import { registerImplicitPlugin } from '@tessera-kit/elements';

registerImplicitPlugin('maps', () => import('../plugin.js'));
