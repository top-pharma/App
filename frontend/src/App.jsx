/**
 * @file App.jsx
 * @description المكون الجذر للتطبيق.
 *
 * ⚠️ ToastContainer موجود في Layout.jsx (وليس هنا) —
 *    لتجنب التكرار (ظهور كل Toast مرتين).
 */

import AppRoutes from './routes/AppRoutes.jsx';

/**
 * المكون الجذر
 * @returns {JSX.Element}
 */
function App() {
  return <AppRoutes />;
}

export default App;