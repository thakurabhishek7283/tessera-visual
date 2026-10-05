// Plain HTML: <script type="module" src="…/@tessera-kit/annotator/autoload"></script> registers every tag of
// the kit, and each one downloads the first time an element with that tag appears.
import { lazyDefine } from '@tessera-kit/elements';

lazyDefine('tessera-label-picker', () => import('./elements/tags/tessera-label-picker.js'));
lazyDefine(
  'tessera-annotator-toolbar',
  () => import('./elements/tags/tessera-annotator-toolbar.js'),
);
lazyDefine('tessera-annotation-list', () => import('./elements/tags/tessera-annotation-list.js'));
lazyDefine(
  'tessera-annotator-minimap',
  () => import('./elements/tags/tessera-annotator-minimap.js'),
);
lazyDefine('tessera-annotator', () => import('./elements/tags/tessera-annotator.js'));
lazyDefine('tessera-whiteboard', () => import('./elements/tags/tessera-whiteboard.js'));
