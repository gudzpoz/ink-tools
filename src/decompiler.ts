import { SourceNode } from 'source-map-js';
import {
  Type_actionTag,
  Type_buildingBlockWithParams,
  Type_customDictionary,
  Type_doFuncsNode,
  Type_funcWithParams,
  Type_get,
  Type_paramsForFuncs,
  Type_set,
  Type_then,
} from './auto-types';
import {
  InkActionType,
  InkBlock, InkChunkNode, InkChunkWithStitches, InkFuncType, InkRootNode,
  InkStoryCustomContentClassType,
  JSONPath,
  annotateInkBlockType,
} from './types';

/**
 * 把 Ink JSON 文件反序列化为 Ink 文本。
 *
 * 基本上就是按照类型信息来就好。
 *
 * 虽然想弄成无状态的，但是记录缩进太麻烦了。
 */
class PoorOldInkSerializer {
  indentation: number;

  nested: boolean;

  argStack: { args: Set<string>, refs: Set<string> }[];

  private currentName: string;

  constructor(
    private root: InkRootNode,
    private jsonPathMapper: (name: string, path: JSONPath) => number,
  ) {
    this.currentName = '';
    this.indentation = 0;
    this.nested = false;
    this.argStack = [];
  }

  reset(name: string) {
    this.nested = false;
    this.indentation = 0;
    this.currentName = name;
  }

  serializeActionTag(path: JSONPath, tag: Type_actionTag): SourceNode {
    const action = tag.action as InkActionType;
    const content: (string | SourceNode)[] = [
      this.nl(),
      '#JourneyEvent: ', tag.action,
      this.nl(),
    ];
    if (tag.userInfo) {
      const titled = tag.userInfo as { title?: string };
      const texted = tag.userInfo as { text?: string, speaker?: string, retelling?: string };
      if (titled.title !== undefined) {
        if (Object.keys(titled).length !== 1 || action !== 'ChangeTransportTitle') {
          throw new Error('Titled action tag must have only one key.');
        }
        content.push(
          '##TransportTitle: ',
          this.sourceNode([...path, 'userInfo', 'title'], titled.title),
          this.nl(),
        );
      } else if (texted.text !== undefined) {
        if (texted.speaker) {
          content.push(
            '##Speaker: ',
            this.sourceNode([...path, 'userInfo', 'speaker'], texted.speaker),
            this.nl(),
          );
        }
        content.push(
          '##Text: ',
          this.sourceNode([...path, 'userInfo', 'text'], texted.text),
          this.nl(),
        );
        if (texted.retelling) {
          content.push(
            '##Retelling: ',
            this.sourceNode([...path, 'userInfo', 'retelling'], texted.retelling),
            this.nl(),
          );
        }
      }
    }
    return this.sourceNode(
      path,
      content,
    );
  }

  nl() {
    return `\n${'  '.repeat(this.indentation)}`;
  }

  getSourceLocation(path: JSONPath) {
    const line = this.jsonPathMapper(this.currentName, path);
    return line;
  }

  checkIfIsArg(name: Type_paramsForFuncs[number], nestLevel: number): string {
    if (typeof name === 'number' || typeof name === 'boolean'
      || ((typeof name !== 'string') && !(name as { get: Type_get }).get)) {
      throw new Error(`Unknown arg type: ${JSON.stringify(name)}`);
    }
    /**
     * 我们暂时把 double set + get 这种情况都看作是 ref 值。
     */
    if (typeof name !== 'string') {
      return this.checkIfIsArg((name as { get: Type_get }).get, nestLevel + 1);
    }
    if (name.startsWith('__bb')) {
      if (this.argStack.length > 0) {
        const { args, refs } = this.argStack[this.argStack.length - 1];
        args.add(name);
        if (nestLevel >= 2) {
          refs.add(name);
        }
      }
    }
    return name;
  }

  fixDivertFormat(divert: Type_paramsForFuncs[number]) {
    if (typeof divert !== 'string') {
      throw new Error(`Unknown divert type: ${JSON.stringify(divert)}`);
    }
    if (divert.startsWith(':')) {
      // eslint-disable-next-line no-param-reassign
      divert = divert.slice(1);
    }
    return divert.replace(/:/g, '.');
  }

  isSimplyNested(node: Type_then, level: number): boolean {
    if (level === 0) {
      return false;
    }
    return node.every((block) => {
      const typed = annotateInkBlockType(block);
      switch (typed.type) {
        case 'value':
          return typed.value !== '<br><br>';
        case 'cycle':
          return typed.value.cycle.every((n) => this.isSimplyNested(n, level - 1));
        case 'sequence':
          return typed.value.sequence.every((n) => this.isSimplyNested(n, level - 1));
        case 'condition':
          return this.isSimplyNested(typed.value.then, level - 1)
            && (!typed.value.otherwise || this.isSimplyNested(typed.value.otherwise, level - 1));
        case 'building':
          return true;
        default:
          return false;
      }
    });
  }

  checkNestable(node: Type_then, level?: number) {
    if (!this.nested && this.isSimplyNested(node, 2 + (level ?? 0))) {
      this.nested = true;
      return true;
    }
    return false;
  }

  sourceNode(path: JSONPath, s: string | (string | SourceNode)[]) {
    return new SourceNode(this.getSourceLocation(path), 0, '<input>', s as never);
  }

  serializeExpr(expr: Type_set[number], path: JSONPath): SourceNode {
    if (typeof expr !== 'object') {
      if (typeof expr === 'string') {
        this.checkIfIsArg(expr, 0);
        return this.sourceNode(path, expr);
      }
      return this.sourceNode(path, JSON.stringify(expr));
    }
    const typed = annotateInkBlockType(expr);
    switch (typed.type) {
      case 'get':
        return this.sourceNode(path, this.checkIfIsArg(expr, 0));
      case 'building': {
        const { buildingBlock, params } = typed.value;
        const paramList = Object.keys(params).sort()
          .filter((k) => params[k as never] && k !== 'position')
          .map((k) => [k, params[k as never]!]);
        return this.sourceNode(
          path,
          [
            `${buildingBlock}(`,
            ...paramList.map(
              ([k, v], i) => [i === 0 ? '' : ', ', this.serializeExpr(
                v as never,
                typed.join(path, 'params', k as never),
              )],
            ).flat(),
            ')',
          ],
        );
      }
      default:
        break;
    }
    const { func, params } = expr as Type_funcWithParams;
    const op = func as InkFuncType;
    const [param1, param2] = params;
    switch (op) {
      case 'FlagIsSet':
      case 'HasRead':
        return this.sourceNode(path, `${this.fixDivertFormat(param1)}`);
      case 'FlagIsNotSet':
      case 'HasNotRead':
        return this.sourceNode(path, `not ${this.fixDivertFormat(param1)}`);
      case 'Not':
        return this.sourceNode(path, ['not ', this.serializeExpr(param1, [...path, 'params', 0])]);
      case 'Log10':
        // TODO: 啥啥啥？
        return this.sourceNode(path, ['Log10(', this.serializeExpr(param1, [...path, 'params', 0]), ')']);
      // Increment 和 Decrement 都不会用作其它表达式的输入
      case 'Increment':
        return this.sourceNode(path, [`${this.checkIfIsArg(param1, 0)}`, ' += 1']);
      case 'Decrement':
        return this.sourceNode(path, [`${this.checkIfIsArg(param1, 0)}`, ' -= 1']);
      // 其它的似乎都是双参数（见 80days.enum.json）
      default: {
        const mapping: Record<typeof op, string> = {
          Add: '+',
          And: '&&',
          Divide: '/',
          Equals: '==',
          GreaterThan: '>',
          GreaterThanOrEqualTo: '>=',
          LessThan: '<',
          LessThanOrEqualTo: '<=',
          Mod: '%',
          Multiply: '*',
          NotEquals: '!=',
          Or: '||',
          Subtract: '-',
        };
        return this.sourceNode(
          path,
          [
            '(',
            this.serializeExpr(param1, [...path, 'params', 0]),
            ` ${mapping[op]} `,
            this.serializeExpr(param2, [...path, 'params', 1]),
            ')',
          ],
        );
      }
    }
  }

  serializeDoFuncsNode(node: Type_doFuncsNode, path: JSONPath): SourceNode {
    return this.sourceNode(
      path,
      node.doFuncs
        .map((func, i) => {
          const set = func as { set: Type_set };
          const nl = i === 0 ? '' : this.nl();
          if (set.set) {
            const setter = set.set.map((s, j) => this.serializeExpr(s, [...path, 'doFuncs', i, 'set', j]));
            return [nl, '~ ', setter[0], ' = ', setter[1]];
          }
          return [nl, '~ ', this.serializeExpr(
            func as Type_funcWithParams | Type_buildingBlockWithParams,
            [...path, 'doFuncs', i],
          )];
        }).flat(),
    );
  }

  serializeBlocks(blocks: InkBlock[], path: JSONPath): SourceNode {
    const prev = this.nested;
    this.checkNestable(blocks, 1);
    this.indentation += 1;
    const ss = this.sourceNode(
      path,
      blocks.map((block, i) => [this.nested ? '' : ' ', this.serializeInkBlock(block, [...path, i])]).flat(),
    );
    this.nested = prev;
    this.indentation -= 1;
    return ss;
  }

  serializeInkBlock(block: InkBlock, path: JSONPath): SourceNode {
    if (typeof block === 'string') {
      if (this.nested) {
        return this.sourceNode(path, block);
      }
      const s = block.replace(/^-/, '\\-');
      if (s.indexOf('<br><br>') !== -1) {
        return this.sourceNode(path, s.replace('<br><br>', `<br><br>${this.nl().repeat(2)}`));
      }
      return this.sourceNode(path, `${s} <>`);
    }

    const typed = annotateInkBlockType(block);
    switch (typed.type) {
      case 'action':
        return this.serializeActionTag(path, typed.value);
      case 'do':
        return this.sourceNode(path, [
          this.nl(),
          this.serializeDoFuncsNode(typed.value, path),
          this.nl(),
        ]);
      case 'return':
        return this.sourceNode(path, [this.nl(), '~ return ', this.serializeExpr(
          typed.value.return,
          typed.join(path, 'return'),
        ), this.nl()]);
      case 'custom': {
        const { dictionary, storyCustomContentClass } = block as Type_customDictionary;
        const contentType = storyCustomContentClass as InkStoryCustomContentClassType;
        if (contentType === 'NextHeadingStyleContent') {
          if (Object.keys(dictionary).length !== 1) {
            throw new Error('NextHeadingStyleContent must have exactly one property');
          }
          const style = dictionary as { styleName: 'NewspaperTitle' | 'NewspaperHeadline' };
          if (style.styleName !== 'NewspaperTitle' && style.styleName !== 'NewspaperHeadline') {
            throw new Error(`Unsupported style: ${style.styleName as string}`);
          }
          return this.sourceNode(
            path,
            `${this.nl()}#${style.styleName}: `,
          );
        }
        if (contentType === 'InsertClueFromGenericLocalContent') {
          const speaker = dictionary as { speaker?: string };
          return this.sourceNode(
            path,
            [this.nl(), '#SystemClue',
              speaker.speaker ? ' from ' : '',
              speaker.speaker
                ? this.sourceNode(typed.join(path, 'dictionary', 'speaker' as never), speaker.speaker)
                : '',
              ': <RandomClue>', this.nl()],
          );
        }
        throw new Error(`Unsupported custom content type: ${contentType as string}`);
      }
      case 'building':
        return this.sourceNode(
          path,
          this.nested
            ? ['{', this.serializeExpr(typed.value, path), '}']
            : [this.nl(), '~ ', this.serializeExpr(typed.value, path), this.nl()],
        );
      case 'option': {
        const {
          option, linkPath, condition, inlineOption,
        } = typed.value;
        const postfix = inlineOption ? ' <>' : '';
        const marker = '+ ';
        const cond = condition
          ? ['{', this.serializeExpr(condition, typed.join(path, 'condition')), '} '] : [''];
        return this.sourceNode(
          path,
          [this.nl(), marker, ...cond, this.sourceNode(typed.join(path, 'option'), option), postfix, this.nl(),
            '  -> ', this.fixDivertFormat(linkPath), this.nl()],
        );
      }
      case 'condition': {
        const { condition, then, otherwise } = typed.value;
        const prev = this.nested;
        const nl = this.checkNestable([typed.value], 1) ? this.nl() : '';
        if (this.nested) {
          const result = this.sourceNode(
            path,
            [nl, '{', this.serializeExpr(condition, typed.join(path, 'condition')),
              ':', this.serializeBlocks(then, typed.join(path, 'then')),
              ...(otherwise ? ['|', this.serializeBlocks(otherwise, typed.join(path, 'otherwise'))] : []),
              '}', nl],
          );
          this.nested = prev;
          return result;
        }
        const s = [
          this.nl(),
          this.nl(),
          '{',
          this.nl(),
          '- ',
          this.serializeExpr(condition, typed.join(path, 'condition')),
          ':',
          this.nl(),
          '  ',
          this.serializeBlocks(then, typed.join(path, 'then')),
        ];
        if (otherwise && otherwise.filter((ss) => typeof ss !== 'string' || ss.trim() !== '').length > 0) {
          s.push(
            this.nl(),
            '- else:',
            this.nl(),
            '  ',
            this.serializeBlocks(otherwise, typed.join(path, 'otherwise')),
          );
        }
        s.push(this.nl(), '}', this.nl());
        return this.sourceNode(path, s);
      }
      case 'cycle':
      case 'sequence': {
        const key = typed.type === 'sequence' ? 'stopping' : typed.type;
        const nested: InkBlock[][] = typed.type === 'cycle'
          ? typed.value.cycle
          : typed.value.sequence;
        const prev = this.nested;
        const nl = this.checkNestable([typed.value], 1) ? this.nl() : '';
        if (this.nested) {
          const prefix = typed.type === 'cycle' ? '&' : '';
          const result = [nl, '{', prefix,
            ...nested.map((blocks, i) => [i === 0 ? '' : '|', this.serializeBlocks(
              blocks,
              typed.join(path, typed.type as never, i),
            )]).flat(),
            '}', nl];
          this.nested = prev;
          return this.sourceNode(path, result);
        }
        return this.sourceNode(
          path,
          [
            this.nl(),
            '{ ',
            key,
            ':',
            this.nl(),
            '  - ',
            ...nested.map(
              (blocks, i) => [i === 0 ? '' : `${this.nl()}  - `, this.serializeBlocks(
                blocks,
                typed.join(path, typed.type as never, i),
              )],
            ).flat(),
            this.nl(),
            '}',
          ],
        );
      }
      case 'divert': {
        const { divert } = typed.value;
        return this.sourceNode(path, `${this.nl()}-> ${this.fixDivertFormat(divert)}${this.nl()}`);
      }
      default:
        throw new Error(`Unknown block type: ${Object.keys(block).join(', ')}`);
    }
  }

  serializeBuildingBlock(name: string, content: InkBlock[], path: JSONPath): SourceNode {
    this.argStack.push({ args: new Set(), refs: new Set() });
    this.indentation -= 1;
    // 不知道为什么 have_raced 函数是空白的，总之应付一下先。
    const serialization = content.length === 0
      ? this.sourceNode(path, '\n~ return 0\n')
      : this.serializeBlocks(content, path);
    const args = this.argStack.pop()!;
    this.indentation += 1;
    return this.sourceNode(
      path,
      [
        '=== function ',
        name,
        ' (',
        [...args.args].sort()
          .filter((arg) => arg.startsWith(`__bb${name}`))
          .map((arg) => (args.refs.has(arg) ? `ref ${arg}` : arg))
          .join(', '),
        ') ===\n',
        serialization,
      ],
    );
  }

  decompileMeta() {
    this.reset('');
    const { root } = this;
    return {
      content: `
INCLUDE variables.ink
INCLUDE buildingBlocks.ink
INCLUDE indexed-content.ink
`,
      files: {
        'variables.ink': Object.entries(root.variables)
          .map(([name, value]) => `VAR ${name} = ${JSON.stringify(value)}`)
          .join('\n'),
        'indexed-content.ink': Object.entries(root['indexed-content'].ranges)
          .map(
            ([name], i) => `INCLUDE content/${String(i + 1).padStart(4, '0')}-${name}.ink`,
          )
          .join('\n'),
        'buildingBlocks.ink': this.sourceNode(
          ['buildingBlocks'],
          Object.entries(root.buildingBlocks)
            .filter(([k]) => k !== 'position')
            .map(([name, value]) => [
              this.serializeBuildingBlock(name, value, ['buildingBlocks', name]),
              '\n',
            ]).flat(),
        ),
      },
    };
  }

  decompile(name: string, file: InkChunkNode): SourceNode {
    this.reset(name);
    this.indentation -= 1;
    if (!Array.isArray(file) && Object.keys(file).filter((f) => f !== 'position').length === 0) {
      // Notorious ENDFLOW
      return this.sourceNode([], `=== ${name} ===`);
    }

    if (Array.isArray(file)) {
      return this.sourceNode(
        [],
        [
          `=== ${name} ===\n`,
          this.serializeBlocks(file as InkBlock[], []),
        ],
      );
    }

    const content = file as InkChunkWithStitches;
    return this.sourceNode(
      [],
      [
        `=== ${name} ===\n`,
        ...Object.entries(content.stitches)
          .filter(([k]) => k !== 'position')
          .map(
            ([stitch, blocks]) => [
              `\n= ${stitch}\n`,
              this.serializeBlocks(blocks.content, ['stitches', stitch, 'content']),
            ],
          ).flat(),
      ],
    );
  }
}

export default PoorOldInkSerializer;
