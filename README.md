## Локальный запуск фронта и API

1) Создайте файл `.env.local` в корне проекта по примеру ниже:

```
# Supabase — требуется существующий проект
SUPABASE_URL= https://YOUR_PROJECT_ID.supabase.co
SUPABASE_ANON_KEY= your-anon-or-service-role
SUPABASE_SERVICE_ROLE_KEY= your-service-role

# Фронту нужны публичные ключи через VITE_
VITE_SUPABASE_URL= https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY= your-anon-key

# Опционально для платежей/телеграма в dev
TELEGRAM_BOT_TOKEN=
RUB_PER_STAR=1

# Порт dev API (по умолчанию 3000)
API_PORT=3000
```

2) Запуск локального API (сервер исполняет файлы из папки `api` на http://localhost:3000):

```
npm run dev:api
```

3) Запуск фронтенда:

```
npm run dev
```

Фронт проксирует `/api/*` на локальный API (порт 3000).

4) Быстрая проверка ручек:

```
curl -i http://localhost:3000/api/online
curl -i -X POST http://localhost:3000/api/boot1 -H "Content-Type: application/json" -d "{}"
```

Убедитесь, что переменные окружения Supabase корректны и в проекте Supabase есть таблицы, ожидаемые API (users, user_profile, subjects и т.д.).

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      ...tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      ...tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      ...tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
