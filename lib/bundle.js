/**
 * RoadBook 主插件的组合容器（profile 里那条 `roadbook-bundle` group 行的模块）。
 *
 * 为什么需要它：一个组合包只能由自己的 patch 插入 Loader 行，而这些行要能被 DSH 的
 * 插件面板逐条开关，就必须真的挂进 Loader 的组件图。这里用 Loader 自带的
 * `cordis:group` 内建把 config 里的子行挂起来 —— 子行因此可以「不重启就生效」，
 * 也不会有谁在容器等待时就单独把某个子组件关掉。
 *
 * 容器本身不注册任何工具、不碰用户数据：它只负责挂载与卸载。
 */
const groupKey = Symbol.for('cordis.group');
const init = Symbol.for('cordis.init');

class RoadbookBundle {
  static inject = ['loader'];
  static [groupKey] = true;

  constructor(ctx, config) {
    this.ctx = ctx;
    this.config = config;
  }

  async *[init]() {
    const Group = this.ctx.loader?.builtins?.group;
    if (typeof Group !== 'function') {
      throw new Error('roadbook/bundle 需要 Loader 的 cordis:group 内建组件');
    }
    const group = new Group(this.ctx, this.config);
    yield () => group.stop();
    await group.update(this.config);
  }
}

export default RoadbookBundle;
