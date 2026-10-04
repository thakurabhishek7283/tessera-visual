// Plain HTML: <script type="module" src="…/@tessera-kit/maps/autoload"></script> registers every tag of
// the kit, and each one downloads the first time an element with that tag appears.
import { lazyDefine } from '@tessera-kit/elements';

lazyDefine('tessera-map', () => import('./elements/tags/tessera-map.js'));
lazyDefine('tessera-location-picker', () => import('./elements/tags/tessera-location-picker.js'));
