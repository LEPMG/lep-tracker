import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef6ff",
          100: "#d9eaff",
          600: "#1d4ed8",
          700: "#1e40af",
          800: "#1e3a8a",
        },
      },
    },
  },
  plugins: [],
};
export default config;
