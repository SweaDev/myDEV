import type { FeatureModule } from '../core/types.ts';
import { myDevFeature } from './mydev/index.ts';

/** Static registry (SPEC §6.5). A new feature is a folder under src/features plus one line here. */
export const features: readonly FeatureModule[] = [myDevFeature];
