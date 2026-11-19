<script setup lang="ts">
import { ref } from 'vue';
import {
  ExAnchor,
  ExAnchorLink,
  ExButton,
  ExCarousel,
  ExCarouselItem,
  ExConfigProvider,
  ExGrid,
  ExGridItem,
  ExLayout,
  ExList,
  ExSider,
  ExStep,
  ExSteps,
  ExTabPane,
  ExTabs,
  ExTimeline,
  ExTimelineItem,
} from '../../src';

const params = new URLSearchParams(location.search);
const scene = params.get('scene');
const rtl = ref(false);
const count = ref(9);
const active = ref(1);
const lastClosed = ref(0);
const clicks = ref(0);
const size = params.get('size') as 'small' | 'medium' | 'large' | null;
const theme = ref<'light' | 'neon-blue'>('neon-blue');
</script>

<template>
  <main :dir="rtl ? 'rtl' : 'ltr'">
    <button
      id="direction"
      @click="rtl = !rtl"
    >
      切换书写方向
    </button>
    <ExGrid
      v-if="scene === 'grid'"
      style="width: 400px"
    >
      <ExGridItem
        :span="6"
        :offset="12"
        :pull="6"
        :md="{ pull: 0, push: 3 }"
      >
        栅格
      </ExGridItem>
    </ExGrid>
    <ExCarousel
      v-if="scene === 'carousel'"
      :height="200"
      :autoplay="false"
      indicator-position="top"
      arrow="always"
    >
      <ExCarouselItem
        v-for="item in params.has('many') ? 10 : 3"
        :key="item"
      >
        <button
          class="slide-action"
          @click="clicks++"
        >
          操作 {{ item }}
        </button>
      </ExCarouselItem>
    </ExCarousel>
    <div v-if="scene === 'anchor'">
      <ExAnchor style="width: 180px">
        <ExAnchorLink
          href="#parent"
          title="父标题"
        >
          <ExAnchorLink
            v-for="item in 3"
            :key="item"
            :href="'#child' + item"
            :title="'子标题' + item"
          />
        </ExAnchorLink>
      </ExAnchor>
      <div id="parent"></div>
    </div>
    <div
      v-if="scene === 'sider'"
      class="ex-app"
      style="transform: translateZ(0)"
    >
      <ExLayout>
        <ExSider
          breakpoint="md"
          collapsible
          default-collapsed
        >
          <button
            id="sider-action"
            @click="clicks++"
          >
            侧栏操作
          </button>
        </ExSider>
      </ExLayout>
    </div>
    <div
      v-if="scene === 'tabs'"
      style="width: 320px"
    >
      <button
        id="select-last"
        @click="active = count"
      >
        激活末项
      </button>
      <button
        id="add-tab"
        @click="count++"
      >
        新增
      </button>
      <ExTabs
        v-model="active"
        :size="size ?? 'small'"
        closable
        @tab-remove="lastClosed = Number($event)"
      >
        <ExTabPane
          v-for="i in count"
          :key="i"
          :name="i"
          :label="i === 1 ? 'I' : '标签页 ' + i"
        />
      </ExTabs>
      <output id="last-closed">{{ lastClosed }}</output>
    </div>
    <ExTimeline
      v-if="scene === 'timeline'"
      mode="alternate"
    >
      <ExTimelineItem
        v-for="i in 4"
        :key="i"
        :timestamp="'时间 ' + i"
      >
        内容 {{ i }}
      </ExTimelineItem>
    </ExTimeline>
    <div
      v-if="scene === 'list'"
      style="width: 320px"
    >
      <ExList :data="[{ id: 1, title: '项目' }]">
        <template #extra>
          <button
            id="extra"
            @click="clicks++"
          >
            操作
          </button>
        </template>
      </ExList>
    </div>
    <ExConfigProvider
      v-if="scene === 'steps'"
      :neon-effect="false"
      :animation="false"
    >
      <ExSteps clickable><ExStep title="可聚焦步骤" /></ExSteps>
    </ExConfigProvider>
    <div v-if="scene === 'theme'">
      <button
        id="theme-switch"
        @click="theme = theme === 'light' ? 'neon-blue' : 'light'"
      >
        切换主题
      </button>
      <ExConfigProvider :theme="theme === 'light' ? 'neon-blue' : 'light'">
        <ExConfigProvider
          id="inner"
          :theme="theme"
        >
          <ExButton type="primary">主操作</ExButton>
          <ExButton type="success">成功</ExButton>
        </ExConfigProvider>
      </ExConfigProvider>
      <ExConfigProvider
        id="reference"
        :theme="theme"
      >
        <ExButton type="primary">主操作</ExButton>
        <ExButton type="success">成功</ExButton>
      </ExConfigProvider>
    </div>
    <div
      v-if="scene === 'prose'"
      class="ex-app"
      style="height: 100px; overflow: auto"
    >
      <ol
        start="5"
        reversed
      >
        <li>起点</li>
        <li value="9">
          显式编号
          <ol>
            <li>嵌套</li>
          </ol>
        </li>
      </ol>
    </div>
    <output id="clicks">{{ clicks }}</output>
  </main>
</template>

<style scoped>
.slide-action {
  position: absolute;
  left: 50%;
  top: 65%;
  transform: translate(-50%, -50%);
}
</style>
