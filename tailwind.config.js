/**
 * Identidad visual del Cotizador: la Pampa.
 *  - gray    → "rastrojo": grises con un toque verde, como el suelo con rastrojo (reemplaza al gris frío).
 *  - emerald/green → "cultivo": verde profundo de soja/pasto, más oscuro y menos "tecnológico".
 *  - amber   → "trigo": dorado de trigo maduro, es el acento (total, acciones principales).
 *  - red     → "óxido": rojo de chapa vieja, para alertas y vencidos.
 *  - blue    → "cielo": azul acero para estados informativos.
 */
const cultivo = {
  50: '#EEF4EA', 100: '#DAE8D2', 200: '#B8D1AA', 300: '#8FB57F', 400: '#62934F',
  500: '#427536', 600: '#2F6030', 700: '#254D27', 800: '#1C3B1F', 900: '#132B16', 950: '#0C1D0F',
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Archivo Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        gray: {
          50: '#F3F4EE', 100: '#E9EBE1', 200: '#DADDD0', 300: '#C2C7B6', 400: '#99A08D',
          500: '#727A67', 600: '#555D4B', 700: '#3C4435', 800: '#272E22', 900: '#181D14',
        },
        emerald: cultivo,
        green: cultivo,
        amber: {
          50: '#FCF6E0', 100: '#F7EAB6', 200: '#EFD680', 300: '#E5BF47', 400: '#D8A722',
          500: '#C0900F', 600: '#9E720B', 700: '#7C5709', 800: '#5C4108', 900: '#3D2B06',
        },
        red: {
          50: '#FBEFEB', 100: '#F6DBD2', 200: '#EDB9A8', 300: '#E08F77', 400: '#D0664A',
          500: '#BC4A2E', 600: '#A03A22', 700: '#822E1B', 800: '#632316', 900: '#451810',
        },
        blue: {
          50: '#EDF3F7', 100: '#D9E6EF', 200: '#B5CDDE', 300: '#8AAFC8', 400: '#5E8DAE',
          500: '#3F7295', 600: '#305B7B', 700: '#264862', 800: '#1D364A', 900: '#13242F',
        },
      },
      // Esquinas más cerradas y sombras casi planas: se ve más a instrumento que a "tarjeta de app"
      borderRadius: { lg: '6px', xl: '8px', '2xl': '12px' },
      boxShadow: {
        sm: '0 1px 0 rgba(24, 29, 20, 0.05)',
        DEFAULT: '0 1px 2px rgba(24, 29, 20, 0.08)',
        md: '0 2px 8px rgba(24, 29, 20, 0.10)',
        lg: '0 6px 20px rgba(24, 29, 20, 0.14)',
      },
    },
  },
  plugins: [],
};
