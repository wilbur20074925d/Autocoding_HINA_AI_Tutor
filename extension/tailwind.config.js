import rootConfig from '../tailwind.config.js';

/** @type {import('tailwindcss').Config} */
export default {
  ...rootConfig,
  content: [
    './sidepanel.html',
    './src/**/*.{js,ts,jsx,tsx}',
    '../src/components/AITutorNew/**/*.{js,ts,jsx,tsx}',
    '../src/hooks/**/*.{js,ts,jsx,tsx}',
    '../src/utils/**/*.{js,ts,jsx,tsx}',
  ],
};
