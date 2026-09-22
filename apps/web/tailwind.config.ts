import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ember: {
          50: "#fef4ed",
          400: "#e8863a",
          600: "#c15a1c",
          900: "#4a1f0d",
        },
      },
    },
  },
  plugins: [],
};

export default config;
