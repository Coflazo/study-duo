import { configDefaults, defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  // Agent worktrees hold whole copies of the repo; their tests are not this checkout's tests.
  test: { exclude: [...configDefaults.exclude, '.claude/**', 'demo/**'] },
});
