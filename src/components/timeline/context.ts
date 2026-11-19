import type { ComputedRef } from 'vue';
import { createSharedInjectionKey } from '../../utils/shared-runtime';
import type { TimelineDirection, TimelineMode } from './types';

interface TimelineContext {
  direction: ComputedRef<TimelineDirection>;
  mode: ComputedRef<TimelineMode>;
  showLine: ComputedRef<boolean>;
  register: (child: { uid: symbol; getElement: () => HTMLElement | null }) => void;
  unregister: (uid: symbol) => void;
  indexOf: (uid: symbol) => number;
}

export const timelineContextKey = createSharedInjectionKey<TimelineContext>('timeline');
