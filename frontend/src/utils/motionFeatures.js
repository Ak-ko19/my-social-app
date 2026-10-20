// Day 74: Motion's animation engine, loaded after the first paint (main.jsx
// wraps the app in <LazyMotion features={...}>), so it isn't part of the
// first download. Components use the light `m.*` elements; nothing here
// uses layout animations, so domAnimation is enough.
export { domAnimation as default } from 'motion/react';
