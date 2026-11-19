import { createSharedInjectionKey } from '../../utils/shared-runtime';
import type { StepsContext } from './types';
import type { Ref } from 'vue';

export const stepsContextKey = createSharedInjectionKey<StepsContext>('steps');
export const stepsHydrationKey =
  createSharedInjectionKey<Readonly<Ref<boolean>>>('steps-hydration');
