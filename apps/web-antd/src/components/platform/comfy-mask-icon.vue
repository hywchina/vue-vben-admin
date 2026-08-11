<script lang="ts" setup>
defineProps<{ size?: number }>();
</script>

<template>
  <svg
    aria-hidden="true"
    fill="none"
    :height="size ?? 16"
    viewBox="0 0 16 16"
    :width="size ?? 16"
  >
    <g stroke="currentColor" stroke-width="1.3">
      <path d="M6.05 2C5.52 7.295 9.23 10.472 14 9.943" />
      <path d="M6.5 5.5 10 2" stroke-linecap="round" />
      <path d="m8 8 4.5-4.5" stroke-linecap="square" />
      <path d="M10.5 9.5 14 6" stroke-linecap="round" />
      <path
        d="M8 14.667A6.667 6.667 0 1 0 8 1.333a6.667 6.667 0 0 0 0 13.334"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </g>
  </svg>
</template>
