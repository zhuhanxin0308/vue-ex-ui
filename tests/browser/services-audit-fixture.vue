<script setup lang="ts">
import { onMounted, ref } from 'vue';
import ExConfigProvider from '../../src/components/config-provider/ExConfigProvider.vue';
import ExImageCompress from '../../src/components/image-compress/ExImageCompress.vue';
import { ExImageCompressError } from '../../src/components/image-compress/errors';
import ExImageCrop from '../../src/components/image-crop/ExImageCrop.vue';
import ExFileDownload from '../../src/components/file-download/ExFileDownload.vue';
import type { ExFileDownloadExposed } from '../../src/components/file-download/types';
import '../../src/style-full';

const SOURCE_DIMENSION = 2;
const RECOVERED_TARGET_KB = 64;
const source = ref('');
const targetSize = ref(0.001);
const compressionError = ref('');
const compressionErrorCount = ref(0);
const download = ref<ExFileDownloadExposed>();
const downloadSuccesses = ref(0);
const cancelledFinished = ref(false);

const recordCompressionError = (error: Error): void => {
  compressionError.value = error instanceof ExImageCompressError ? error.code : error.name;
  compressionErrorCount.value += 1;
};
const continueDownload = (): void => {
  downloadSuccesses.value += 1;
  if (downloadSuccesses.value !== 1) return;
  cancelledFinished.value = download.value!.cancel();
  void download.value!.download();
};

onMounted(() => {
  // 使用浏览器真实 PNG 编码器提供合法资源，不替换组件的压缩算法。
  const canvas = document.createElement('canvas');
  canvas.width = SOURCE_DIMENSION;
  canvas.height = SOURCE_DIMENSION;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#29abe2';
  context.fillRect(0, 0, SOURCE_DIMENSION, SOURCE_DIMENSION);
  source.value = canvas.toDataURL('image/png');
});
</script>

<template>
  <ExConfigProvider locale="en-US">
    <main style="max-width: 960px; padding: 24px; margin: auto">
      <section data-testid="compress">
        <h1>压缩错误恢复</h1>
        <button
          type="button"
          @click="targetSize = RECOVERED_TARGET_KB"
        >
          修正目标大小
        </button>
        <output data-testid="compression-error">
          {{ compressionError }}:{{ compressionErrorCount }}
        </output>
        <ExImageCompress
          v-if="source"
          :src="source"
          mode="size"
          output-type="image/png"
          :target-size="targetSize"
          @error="recordCompressionError"
        />
      </section>
      <section data-testid="crop-source">
        <h2>裁剪资源错误</h2>
        <ExImageCrop src="/services-audit-missing.png" />
      </section>
      <section data-testid="crop-configuration">
        <h2>裁剪配置错误</h2>
        <ExImageCrop
          v-if="source"
          :src="source"
          :quality="2"
        />
      </section>
      <section data-testid="download">
        <h2>下载完成重入</h2>
        <ExFileDownload
          ref="download"
          url="/services-audit-file.txt"
          filename="regression.txt"
          transport="fetch"
          @success="continueDownload"
        />
        <output data-testid="download-result">
          {{ downloadSuccesses }}:{{ cancelledFinished }}
        </output>
      </section>
    </main>
  </ExConfigProvider>
</template>
