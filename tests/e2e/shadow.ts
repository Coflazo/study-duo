import type { CDPSession, Page } from '@playwright/test';

/** The overlay lives in a closed shadow root; DevTools protocol can still see it. */
export async function shadow(page: Page) {
  const cdp: CDPSession = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const find = async (cls: string): Promise<number | null> => {
    const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const stack: any[] = [root];
    while (stack.length) {
      const n = stack.pop();
      const attrs: string[] = n.attributes ?? [];
      const i = attrs.indexOf('class');
      if (i >= 0 && attrs[i + 1]!.split(' ').includes(cls)) return n.nodeId;
      stack.push(...(n.children ?? []), ...(n.shadowRoots ?? []));
    }
    return null;
  };
  const call = async (cls: string, fn: string) => {
    const nodeId = await find(cls);
    if (nodeId === null) return null;
    const { object } = await cdp.send('DOM.resolveNode', { nodeId });
    const { result } = await cdp.send('Runtime.callFunctionOn', { objectId: object.objectId!, functionDeclaration: fn, returnByValue: true });
    return result.value;
  };
  return {
    style: (cls: string) =>
      call(cls, 'function () { const s = getComputedStyle(this); return { opacity: s.opacity, pointerEvents: s.pointerEvents, display: s.display }; }'),
    rect: (cls: string) => call(cls, 'function () { const r = this.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }'),
    text: (cls: string) => call(cls, 'function () { return this.textContent; }'),
    prop: (cls: string, js: string) => call(cls, `function () { return ${js}; }`),
    color: (cls: string) => call(cls, 'function () { return getComputedStyle(this).color; }'),
  };
}
