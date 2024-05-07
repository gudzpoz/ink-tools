let lastYieldTime = Date.now();

const resolved = Promise.resolve();

/**
 * 例如 Chrome 把执行分为 Tasks 和 Microtasks，
 * 而同属一个 Task 的 Microtasks 之间是无法插进用户交互等关键操作的处理。
 * 也就是普通的 Promise 其实还是会阻塞用户交互的，必须用个 setTimeout 才能。
 *
 * @returns 用于稍稍让出控制权
 */
export function yieldToMain(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastYieldTime;
  if (elapsed < 50) {
    return resolved;
  }
  lastYieldTime = now;
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * 因为 JS 里的 Promise 并没有 back-pressure 的概念，所以只能再用一层函数来包装。
 *
 * 因为 InkStoryRunner 是所有函数共用一套栈的，所以绝对不能使用 `Promise.all`。
 * 下面的类型体操是直接从 `Promise.all` 的类型定义里改过来的。
 *
 * 非要说的话，毕竟 JS 是单线程，在加载完网络资源之后其实并行化也没大必要。
 *
 * @param promises 顺序执行的函数
 */
export async function evaluateSequentially<T>(
  promises: (() => Promise<T>)[],
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < promises.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const result = await promises[i]();
    results.push(result);
    // eslint-disable-next-line no-await-in-loop
    await yieldToMain();
  }
  return results;
}
