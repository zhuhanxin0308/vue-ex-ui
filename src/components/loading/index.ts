import ExLoadingComponent from './ExLoading.vue';
import { withInstall, type InstallableComponent } from '../../utils/install';
import { LoadingPlugin } from './LoadingService';

export type {
  ExLoadingEmits,
  ExLoadingExposed,
  ExLoadingProps,
  ExLoadingSlots,
  LoadingDirectiveBinding,
  LoadingDirectiveValue,
  LoadingPluginOptions,
  LoadingService,
  LoadingServiceConfig,
  LoadingServiceDefaults,
  LoadingServiceInstance,
  LoadingSize,
  LoadingTarget,
  LoadingType,
} from './types';

export {
  createLoadingService,
  destroyLoading,
  hideLoading,
  loadingService,
  LOADING_SERVICE_KEY,
  showLoading,
  useLoadingService,
  LoadingPlugin,
  vLoading,
} from './LoadingService';

export const ExLoading: InstallableComponent<typeof ExLoadingComponent> =
  withInstall(ExLoadingComponent);

const installComponent = ExLoading.install;
ExLoading.install = app => {
  installComponent(app);
  app.use(LoadingPlugin);
};

export default ExLoading;
