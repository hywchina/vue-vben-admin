<script lang="ts" setup>
defineProps<{
  description: string;
  eyebrow?: string;
  title: string;
}>();
</script>

<template>
  <header class="platform-page-heading">
    <div class="min-w-0">
      <div v-if="eyebrow" class="platform-page-heading__eyebrow">
        {{ eyebrow }}
      </div>
      <h1>{{ title }}</h1>
      <p>{{ description }}</p>
    </div>
    <div v-if="$slots.extra" class="platform-page-heading__extra">
      <slot name="extra"></slot>
    </div>
  </header>
</template>
