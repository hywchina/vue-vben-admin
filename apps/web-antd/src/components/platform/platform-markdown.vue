<script lang="ts" setup>
import { computed } from 'vue';

type MarkdownBlock =
  | { content: string; kind: 'code'; language: string }
  | { content: string; kind: 'heading'; level: number }
  | { content: string; kind: 'paragraph' | 'quote' | 'thinking' }
  | { items: string[]; kind: 'ordered-list' | 'unordered-list' };

const props = defineProps<{ content: string }>();
const blocks = computed(() => parseMarkdown(props.content));

function parseMarkdown(content: string): MarkdownBlock[] {
  const normalized = content.replaceAll('\r\n', '\n').trim();
  if (!normalized) return [];
  const parsed: MarkdownBlock[] = [];
  const lines = normalized.split('\n');
  let paragraph: string[] = [];
  let index = 0;
  const flushParagraph = () => {
    const value = paragraph.join('\n').trim();
    if (value) parsed.push({ content: value, kind: 'paragraph' });
    paragraph = [];
  };

  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (line.trim() === '<think>') {
      flushParagraph();
      const thinking: string[] = [];
      index += 1;
      while (index < lines.length && lines[index]?.trim() !== '</think>') {
        thinking.push(lines[index] ?? '');
        index += 1;
      }
      parsed.push({ content: thinking.join('\n').trim(), kind: 'thinking' });
      index += 1;
      continue;
    }
    if (line.startsWith('```')) {
      flushParagraph();
      const language = line.slice(3).trim();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index]?.startsWith('```')) {
        code.push(lines[index] ?? '');
        index += 1;
      }
      parsed.push({ content: code.join('\n'), kind: 'code', language });
      index += 1;
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      parsed.push({
        content: heading[2] ?? '',
        kind: 'heading',
        level: heading[1]?.length ?? 1,
      });
      index += 1;
      continue;
    }
    const unordered = /^\s*[-*+]\s+(.+)$/.exec(line);
    if (unordered) {
      flushParagraph();
      const items: string[] = [];
      while (index < lines.length) {
        const match = /^\s*[-*+]\s+(.+)$/.exec(lines[index] ?? '');
        if (!match) break;
        items.push(match[1] ?? '');
        index += 1;
      }
      parsed.push({ items, kind: 'unordered-list' });
      continue;
    }
    const ordered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (ordered) {
      flushParagraph();
      const items: string[] = [];
      while (index < lines.length) {
        const match = /^\s*\d+[.)]\s+(.+)$/.exec(lines[index] ?? '');
        if (!match) break;
        items.push(match[1] ?? '');
        index += 1;
      }
      parsed.push({ items, kind: 'ordered-list' });
      continue;
    }
    if (line.startsWith('> ')) {
      flushParagraph();
      const quote: string[] = [];
      while (index < lines.length && lines[index]?.startsWith('> ')) {
        quote.push((lines[index] ?? '').slice(2));
        index += 1;
      }
      parsed.push({ content: quote.join('\n'), kind: 'quote' });
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      index += 1;
      continue;
    }
    paragraph.push(line);
    index += 1;
  }
  flushParagraph();
  return parsed;
}
</script>

<template>
  <div class="platform-markdown" data-testid="markdown-output">
    <template v-for="(block, index) in blocks" :key="index">
      <component
        :is="`h${block.level}`"
        v-if="block.kind === 'heading'"
        class="platform-markdown__heading"
      >
        {{ block.content }}
      </component>
      <p v-else-if="block.kind === 'paragraph'">{{ block.content }}</p>
      <blockquote v-else-if="block.kind === 'quote'">
        {{ block.content }}
      </blockquote>
      <ul v-else-if="block.kind === 'unordered-list'">
        <li v-for="item in block.items" :key="item">{{ item }}</li>
      </ul>
      <ol v-else-if="block.kind === 'ordered-list'">
        <li v-for="item in block.items" :key="item">{{ item }}</li>
      </ol>
      <pre
        v-else-if="block.kind === 'code'"
      ><code>{{ block.content }}</code></pre>
      <details v-else-if="block.kind === 'thinking'" class="thinking-block">
        <summary>思考过程</summary>
        <p>{{ block.content }}</p>
      </details>
    </template>
  </div>
</template>

<style scoped>
.platform-markdown {
  width: min(100%, 980px);
  padding: 8px 4px;
  font-size: 15px;
  line-height: 1.85;
  color: #20282d;
}

.platform-markdown :is(p, blockquote, ul, ol, pre) {
  margin: 0 0 14px;
}

.platform-markdown :is(p, blockquote) {
  white-space: pre-wrap;
}

.platform-markdown__heading {
  margin: 6px 0 12px;
  font-weight: 760;
  line-height: 1.4;
  color: #151b1f;
}

.platform-markdown h1 {
  font-size: 25px;
}

.platform-markdown h2 {
  font-size: 21px;
}

.platform-markdown h3 {
  font-size: 18px;
}

.platform-markdown :is(h4, h5, h6) {
  font-size: 16px;
}

.platform-markdown :is(ul, ol) {
  padding-left: 24px;
}

.platform-markdown blockquote {
  padding: 8px 13px;
  color: #58656c;
  background: #f5f6f6;
  border-left: 3px solid var(--round-accent, #c51635);
}

.platform-markdown pre {
  padding: 14px;
  overflow: auto;
  font-size: 13px;
  line-height: 1.65;
  color: #edf2f4;
  background: #202a30;
  border-radius: 10px;
}

.thinking-block {
  padding: 10px 13px;
  margin-bottom: 14px;
  color: #606d74;
  background: #f5f6f6;
  border-radius: 10px;
}

.thinking-block summary {
  font-weight: 700;
  cursor: pointer;
}

.thinking-block p {
  margin: 9px 0 0;
}
</style>
