<script setup lang="ts">
withDefaults(defineProps<{ animated?: boolean }>(), { animated: false });
</script>

<template>
  <svg
    class="brand-symbol"
    :class="{ 'brand-symbol--animated': animated }"
    viewBox="0 0 64 64"
    aria-hidden="true"
    focusable="false"
  >
    <path
      fill="currentColor"
      d="M15 9h22a13 13 0 0 1 13 13v10h7L44 46 31 32h8V22a2 2 0 0 0-2-2H15a5.5 5.5 0 0 1 0-11Z"
    />
    <path
      fill="currentColor"
      opacity=".68"
      d="M49 55H27a13 13 0 0 1-13-13V32H7l13-14 13 14h-8v10a2 2 0 0 0 2 2h22a5.5 5.5 0 0 1 0 11Z"
    />
    <g
      v-if="animated"
      class="brand-flow"
      fill="none"
      stroke="currentColor"
      stroke-width="3"
      stroke-linecap="round"
    >
      <path d="M15 14.5H37Q44.5 14.5 44.5 22V36" pathLength="100" />
      <path d="M49 49.5H27Q19.5 49.5 19.5 42V28" pathLength="100" />
    </g>
  </svg>
</template>

<style scoped>
.brand-symbol {
  display: block;
  width: 100%;
  height: 100%;
}
.brand-flow {
  color: var(--brand-glow, #d6fff4);
  pointer-events: none;
}
.brand-flow path {
  stroke-dasharray: 14 112;
  opacity: 0;
  animation: brand-stream 4.8s linear infinite;
}
.brand-flow path + path {
  animation-delay: -2.4s;
}
@keyframes brand-stream {
  0% {
    stroke-dashoffset: 14;
    opacity: 0;
  }
  3% {
    opacity: 1;
  }
  44% {
    opacity: 1;
  }
  49%,
  100% {
    stroke-dashoffset: -112;
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .brand-flow {
    display: none;
  }
  .brand-flow path {
    animation: none;
  }
}
</style>
