<script lang="ts" setup>
import { computed } from 'vue';

import { parseMarkdownInline } from './platform-markdown-inline';

const props = defineProps<{ content: string }>();
const tokens = computed(() => parseMarkdownInline(props.content));
</script>

<template>
  <template v-for="(token, index) in tokens" :key="index">
    <strong v-if="token.kind === 'strong'">{{ token.content }}</strong>
    <em v-else-if="token.kind === 'emphasis'">{{ token.content }}</em>
    <code v-else-if="token.kind === 'code'" class="markdown-inline-code">
      {{ token.content }}
    </code>
    <a
      v-else-if="token.kind === 'link'"
      :href="token.href"
      rel="nofollow noopener noreferrer"
      target="_blank"
    >
      {{ token.content }}
    </a>
    <template v-else>{{ token.content }}</template>
  </template>
</template>

<style scoped>
.markdown-inline-code {
  padding: 0.12em 0.35em;
  font-size: 0.9em;
  color: inherit;
  background: rgb(93 105 117 / 11%);
  border-radius: 4px;
}

a {
  color: var(--round-accent, #b91c32);
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>
